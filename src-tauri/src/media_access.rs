//! Which files on disk the webview may open.
//!
//! The asset protocol (`asset://`) used to cover the whole disk (`"scope": ["**"]`) and the export command took any path.
//! Now a file becomes available only after the user picked it in a native dialog (`select_media_files`,
//! `open_project_dialog`), and the export may write only to the place the user picked in the save dialog
//! (`select_export_path`). Nothing a script can call adds a path to this list.
//!
//! The list of picked media files is stored in the app data folder, so a project that is restored after a restart
//! (autosave recovery) can still be previewed.

use std::collections::HashSet;
use std::path::{Component, Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Manager};

use crate::export_guard::normalize_path;

/// Extensions of the media files the picker offers (`select_media_files`)
pub const MEDIA_EXTENSIONS: &[&str] = &[
    "mp4", "mov", "avi", "mkv", "webm", "mp3", "wav", "aac", "m4a", "ogg", "flac", "png", "jpg", "jpeg", "webp", "bmp",
];

const MAX_ENTRIES: usize = 5000;
const LIST_FILE_NAME: &str = "media_allowlist.json";

pub fn is_media_file(path: &Path) -> bool {
    path.extension()
        .map(|e| MEDIA_EXTENSIONS.contains(&e.to_string_lossy().to_lowercase().as_str()))
        .unwrap_or(false)
}

#[derive(Default)]
struct Inner {
    /// Normalized paths, for comparing
    keys: HashSet<String>,
    /// The paths as picked, oldest first
    paths: Vec<PathBuf>,
    export_target: Option<PathBuf>,
}

#[derive(Default)]
pub struct MediaAccess {
    inner: Mutex<Inner>,
}

impl MediaAccess {
    /// Adds the files that are absolute, free of `..`, media files and (when `check_exists`) present on disk.
    /// Returns the ones that were not on the list yet.
    pub fn add_paths(&self, candidates: Vec<PathBuf>, check_exists: bool) -> Vec<PathBuf> {
        let mut inner = self.inner.lock().unwrap();
        let mut added = Vec::new();
        for path in candidates {
            if !path.is_absolute() || path.components().any(|c| matches!(c, Component::ParentDir)) {
                continue;
            }
            if !is_media_file(&path) || (check_exists && !path.is_file()) {
                continue;
            }
            if inner.keys.insert(normalize_path(&path.to_string_lossy())) {
                inner.paths.push(path.clone());
                added.push(path);
            }
        }
        if inner.paths.len() > MAX_ENTRIES {
            let excess = inner.paths.len() - MAX_ENTRIES;
            let dropped: Vec<PathBuf> = inner.paths.drain(..excess).collect();
            for path in dropped {
                inner.keys.remove(&normalize_path(&path.to_string_lossy()));
            }
        }
        added
    }

    pub fn is_allowed(&self, path: &str) -> bool {
        self.inner.lock().unwrap().keys.contains(&normalize_path(path))
    }

    pub fn allowed_keys(&self) -> HashSet<String> {
        self.inner.lock().unwrap().keys.clone()
    }

    pub fn paths(&self) -> Vec<PathBuf> {
        self.inner.lock().unwrap().paths.clone()
    }

    pub fn set_export_target(&self, path: PathBuf) {
        self.inner.lock().unwrap().export_target = Some(path);
    }

    pub fn export_target(&self) -> Option<PathBuf> {
        self.inner.lock().unwrap().export_target.clone()
    }

    /// Whether `path` is the chosen export file or one of the picked media files
    pub fn may_reveal(&self, path: &str) -> bool {
        let key = normalize_path(path);
        let inner = self.inner.lock().unwrap();
        inner.keys.contains(&key)
            || inner
                .export_target
                .as_ref()
                .map(|t| normalize_path(&t.to_string_lossy()) == key)
                .unwrap_or(false)
    }
}

/// The `path` of every entry in the `assets` list of a project file
pub fn asset_paths_from_project(project_json: &str) -> Vec<PathBuf> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(project_json) else {
        return Vec::new();
    };
    value
        .get("assets")
        .and_then(|a| a.as_array())
        .map(|assets| {
            assets
                .iter()
                .filter_map(|a| a.get("path").and_then(|p| p.as_str()))
                .map(PathBuf::from)
                .collect()
        })
        .unwrap_or_default()
}

pub fn list_to_json(paths: &[PathBuf]) -> String {
    let strings: Vec<String> = paths.iter().map(|p| p.to_string_lossy().to_string()).collect();
    serde_json::to_string(&strings).unwrap_or_else(|_| "[]".to_string())
}

pub fn list_from_json(json: &str) -> Vec<PathBuf> {
    serde_json::from_str::<Vec<String>>(json)
        .unwrap_or_default()
        .into_iter()
        .map(PathBuf::from)
        .collect()
}

fn list_file(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join(LIST_FILE_NAME))
}

fn save(app: &AppHandle, access: &MediaAccess) {
    let Some(file) = list_file(app) else { return };
    if let Some(parent) = file.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Err(e) = std::fs::write(&file, list_to_json(&access.paths())) {
        eprintln!("[media_access] Medya listesi yazılamadı: {}", e);
    }
}

/// Opens the asset protocol for the given files and remembers them. Call this only with paths the user picked in a native dialog.
pub fn grant(app: &AppHandle, access: &MediaAccess, paths: Vec<PathBuf>) {
    let added = access.add_paths(paths, true);
    if added.is_empty() {
        return;
    }
    let scope = app.asset_protocol_scope();
    for path in &added {
        if let Err(e) = scope.allow_file(path) {
            eprintln!("[media_access] Dosya asset kapsamına eklenemedi: {}", e);
        }
    }
    save(app, access);
}

/// Loads the remembered list at startup and opens the asset protocol for the files that still exist
pub fn restore(app: &AppHandle, access: &MediaAccess) {
    let Some(file) = list_file(app) else { return };
    let Ok(json) = std::fs::read_to_string(&file) else { return };
    let added = access.add_paths(list_from_json(&json), true);
    let scope = app.asset_protocol_scope();
    for path in &added {
        let _ = scope.allow_file(path);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(s: &str) -> PathBuf {
        PathBuf::from(s)
    }

    #[test]
    fn accepts_absolute_media_files_only() {
        let access = MediaAccess::default();
        let added = access.add_paths(
            vec![p("C:/media/a.mp4"), p("C:/docs/letter.docx"), p("media/b.mp4"), p("C:/media/../c.mp4"), p("C:/m/d.PNG")],
            false,
        );
        assert_eq!(added, vec![p("C:/media/a.mp4"), p("C:/m/d.PNG")]);
        assert!(access.is_allowed("C:\\media\\A.MP4"));
        assert!(!access.is_allowed("C:/docs/letter.docx"));
    }

    #[test]
    fn a_file_is_added_once() {
        let access = MediaAccess::default();
        assert_eq!(access.add_paths(vec![p("C:/a/x.mp4")], false).len(), 1);
        assert_eq!(access.add_paths(vec![p("C:\\a\\X.mp4")], false).len(), 0);
        assert_eq!(access.paths().len(), 1);
    }

    #[test]
    fn missing_files_are_skipped_when_checking_for_existence() {
        let access = MediaAccess::default();
        assert!(access.add_paths(vec![p("C:/definitely/not/here.mp4")], true).is_empty());
    }

    #[test]
    fn the_oldest_entries_drop_out_past_the_limit() {
        let access = MediaAccess::default();
        let many: Vec<PathBuf> = (0..MAX_ENTRIES + 3).map(|i| p(&format!("C:/m/{}.mp4", i))).collect();
        access.add_paths(many, false);
        assert_eq!(access.paths().len(), MAX_ENTRIES);
        assert!(!access.is_allowed("C:/m/0.mp4"));
        assert!(access.is_allowed(&format!("C:/m/{}.mp4", MAX_ENTRIES + 2)));
    }

    #[test]
    fn reveal_is_limited_to_the_export_file_and_picked_media() {
        let access = MediaAccess::default();
        access.add_paths(vec![p("C:/m/a.mp4")], false);
        assert!(access.may_reveal("C:/m/a.mp4"));
        assert!(!access.may_reveal("C:/Windows/notepad.exe"));
        access.set_export_target(p("C:/out/x.mp4"));
        assert!(access.may_reveal("c:\\out\\x.mp4"));
    }

    #[test]
    fn reads_asset_paths_from_a_project_file() {
        let json = r#"{"version":1,"assets":[{"id":"a","path":"C:/m/a.mp4"},{"id":"b"},{"id":"c","path":7}]}"#;
        assert_eq!(asset_paths_from_project(json), vec![p("C:/m/a.mp4")]);
        assert!(asset_paths_from_project("not json").is_empty());
    }

    #[test]
    fn the_list_survives_a_json_round_trip() {
        let paths = vec![p("C:/m/a.mp4"), p("C:/m/ç ş.mp4")];
        assert_eq!(list_from_json(&list_to_json(&paths)), paths);
        assert!(list_from_json("garbage").is_empty());
    }
}
