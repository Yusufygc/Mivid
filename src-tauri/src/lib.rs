mod export_guard;
mod export_job;
mod media_access;

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter, Manager, State};

use export_guard::Policy;
use export_job::ExportJob;
use media_access::MediaAccess;

/// Project files bigger than this are not read (a real project is a few hundred kilobytes)
const MAX_PROJECT_FILE_BYTES: u64 = 64 * 1024 * 1024;

/// Places FFmpeg is looked for, in order. Never a path relative to the working directory: whoever can drop an
/// `ffmpeg.exe` into the folder the app is started from would get it run.
fn ffmpeg_candidates(exe_dir: Option<&Path>) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(dir) = exe_dir {
        // Next to the app: where a bundled FFmpeg (sidecar) lives
        candidates.push(dir.join("ffmpeg.exe"));
    }
    candidates.push(PathBuf::from("C:\\ffmpeg\\bin\\ffmpeg.exe"));
    candidates.push(PathBuf::from("C:\\ffmpeg\\ffmpeg.exe"));
    candidates
}

fn find_ffmpeg_executable() -> String {
    let exe_dir = std::env::current_exe().ok().and_then(|p| p.parent().map(Path::to_path_buf));
    for candidate in ffmpeg_candidates(exe_dir.as_deref()) {
        if candidate.is_absolute() && candidate.is_file() {
            return candidate.to_string_lossy().to_string();
        }
    }
    // Last resort: whatever `ffmpeg` the system PATH offers
    "ffmpeg".to_string()
}

#[derive(Clone, serde::Serialize)]
struct ExportProgressPayload {
    progress: f32,
    time_str: String,
    status: String,
}

#[derive(serde::Serialize)]
struct OpenedProject {
    path: String,
    text: String,
}

fn path_strings(paths: &[PathBuf]) -> Vec<String> {
    paths.iter().map(|p| p.to_string_lossy().to_string()).collect()
}

/// Native file picker. The chosen files are the only ones the webview may open (see `media_access`).
#[tauri::command]
fn select_media_files(app: AppHandle, access: State<'_, MediaAccess>) -> Vec<String> {
    let picked = rfd::FileDialog::new()
        .add_filter("Tüm Medyalar", &["mp4", "mov", "avi", "mkv", "webm", "mp3", "wav", "aac", "m4a", "ogg", "flac", "png", "jpg", "jpeg", "webp"])
        .add_filter("Videolar (*.mp4, *.mov, *.avi, *.mkv)", &["mp4", "mov", "avi", "mkv", "webm"])
        .add_filter("Sesler (*.mp3, *.wav, *.aac, *.m4a)", &["mp3", "wav", "aac", "m4a", "ogg", "flac"])
        .add_filter("Resimler (*.png, *.jpg, *.jpeg)", &["png", "jpg", "jpeg", "webp"])
        .set_title("Medya Dosyası Seçin")
        .pick_files()
        .unwrap_or_default();

    media_access::grant(&app, &access, picked.clone());
    let accepted: Vec<PathBuf> = picked
        .into_iter()
        .filter(|p| access.is_allowed(&p.to_string_lossy()))
        .collect();
    path_strings(&accepted)
}

/// Native "open project" dialog. Returns the project text and opens the media files the project lists.
#[tauri::command]
fn open_project_dialog(app: AppHandle, access: State<'_, MediaAccess>) -> Result<Option<OpenedProject>, String> {
    let Some(path) = rfd::FileDialog::new()
        .add_filter("Mivid projesi", &["json"])
        .set_title("Proje Aç")
        .pick_file()
    else {
        return Ok(None);
    };

    let size = std::fs::metadata(&path)
        .map_err(|e| format!("Proje dosyası okunamadı: {}", e))?
        .len();
    if size > MAX_PROJECT_FILE_BYTES {
        return Err("Proje dosyası çok büyük.".to_string());
    }
    let text = std::fs::read_to_string(&path).map_err(|e| format!("Proje dosyası okunamadı: {}", e))?;

    media_access::grant(&app, &access, media_access::asset_paths_from_project(&text));
    Ok(Some(OpenedProject {
        path: path.to_string_lossy().to_string(),
        text,
    }))
}

/// Native "save as" dialog for the exported video. The export writes only to the file chosen here.
#[tauri::command]
fn select_export_path(access: State<'_, MediaAccess>, suggested_name: Option<String>) -> Option<String> {
    let name: String = suggested_name
        .unwrap_or_else(|| "export.mp4".to_string())
        .chars()
        .map(|c| if "\\/:*?\"<>|".contains(c) { '_' } else { c })
        .collect();

    let picked = rfd::FileDialog::new()
        .add_filter("Video", &["mp4", "mov", "webm"])
        .set_file_name(name.as_str())
        .set_title("Dışa Aktarma Konumu")
        .save_file()?;

    let has_video_extension = picked
        .extension()
        .map(|e| ["mp4", "mov", "webm"].contains(&e.to_string_lossy().to_lowercase().as_str()))
        .unwrap_or(false);
    let picked = if has_video_extension { picked } else { picked.with_extension("mp4") };

    access.set_export_target(picked.clone());
    Some(picked.to_string_lossy().to_string())
}

#[tauri::command]
fn open_file_location(access: State<'_, MediaAccess>, path: String) -> Result<(), String> {
    if !access.may_reveal(&path) {
        return Err("Yalnızca dışa aktarılan veya seçilen dosyaların konumu açılabilir.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let win_path = path.replace('/', "\\");
        // /select,<path> highlights the specific file in its folder
        Command::new("explorer")
            .arg(format!("/select,{}", win_path))
            .spawn()
            .map_err(|e| format!("Dosya konumu açılamadı: {}", e))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        let p = Path::new(&path);
        let dir = if p.is_dir() { p } else { p.parent().unwrap_or(p) };
        Command::new("open")
            .arg(dir)
            .spawn()
            .map_err(|e| format!("Failed to open directory: {}", e))?;
    }

    Ok(())
}

/// Whether FFmpeg's stream listing (`ffmpeg -i file`) has an audio stream; None when the text is no stream listing
fn parse_has_audio(ffmpeg_output: &str) -> Option<bool> {
    let streams: Vec<&str> = ffmpeg_output.lines().filter(|l| l.contains("Stream #")).collect();
    if streams.is_empty() {
        return None;
    }
    Some(streams.iter().any(|l| l.contains(": Audio:")))
}

/// Asks FFmpeg about a media file the user picked: Some(true/false) = has / has no audio, None = could not tell
#[tauri::command]
async fn probe_media(access: State<'_, MediaAccess>, path: String) -> Result<Option<bool>, String> {
    if !access.is_allowed(&path) {
        return Err("Bu dosya medya havuzuna dosya diyaloğuyla eklenmemiş.".to_string());
    }
    let output = Command::new(find_ffmpeg_executable())
        .args(["-hide_banner", "-i", path.as_str()])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("FFmpeg çalıştırılamadı: {}", e))?;
    Ok(parse_has_audio(&String::from_utf8_lossy(&output.stderr)))
}

/// The H.264 encoder to export with: `libx264` when this FFmpeg has it (GPL builds), else `h264_mf` (Windows Media
/// Foundation, present in LGPL builds, which is what the app bundles). None when neither exists.
fn pick_video_encoder(encoders_output: &str) -> Option<&'static str> {
    let has = |name: &str| encoders_output.lines().any(|l| l.split_whitespace().nth(1) == Some(name));
    ["libx264", "h264_mf"].into_iter().find(|name| has(name))
}

#[tauri::command]
async fn video_encoder() -> Result<String, String> {
    static CHOSEN: std::sync::OnceLock<String> = std::sync::OnceLock::new();
    if let Some(name) = CHOSEN.get() {
        return Ok(name.clone());
    }
    let output = Command::new(find_ffmpeg_executable())
        .args(["-hide_banner", "-encoders"])
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .map_err(|e| format!("FFmpeg çalıştırılamadı: {}", e))?;
    let name = pick_video_encoder(&String::from_utf8_lossy(&output.stdout))
        .ok_or_else(|| "Bu FFmpeg sürümünde H.264 kodlayıcı (libx264 ya da h264_mf) yok.".to_string())?;
    Ok(CHOSEN.get_or_init(|| name.to_string()).clone())
}

/// The error text `run_ffmpeg_export` returns for a cancelled export (the interface recognizes it)
const CANCELLED_MESSAGE: &str = "Export iptal edildi.";

#[tauri::command]
fn cancel_export(job: State<'_, ExportJob>) -> bool {
    job.cancel()
}

/// Seconds of output in an FFmpeg stats line (`frame=  90 fps=30 ... time=00:00:03.00 bitrate=...`) and the time text
fn parse_progress_time(line: &str) -> Option<(f64, String)> {
    let start = line.find("time=")? + 5;
    let rest = &line[start..];
    let end = rest.find(' ').unwrap_or(rest.len());
    let value = &rest[..end];
    let parts: Vec<&str> = value.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let hours = parts[0].parse::<f64>().ok()?;
    let minutes = parts[1].parse::<f64>().ok()?;
    let seconds = parts[2].parse::<f64>().ok()?;
    Some((hours * 3600.0 + minutes * 60.0 + seconds, value.to_string()))
}

#[tauri::command]
async fn run_ffmpeg_export(
    app: AppHandle,
    access: State<'_, MediaAccess>,
    job: State<'_, ExportJob>,
    args: Vec<String>,
    total_duration: Option<f64>,
) -> Result<String, String> {
    let output = access
        .export_target()
        .ok_or_else(|| "Önce dışa aktarma konumunu seçin.".to_string())?;
    let allowed_inputs = access.allowed_keys();
    export_guard::validate(
        &args,
        &Policy {
            allowed_inputs: &allowed_inputs,
            output: &output,
            check_files_exist: true,
        },
    )
    .map_err(|e| e.to_string())?;

    let ffmpeg_bin = find_ffmpeg_executable();

    // Ensure output directory exists
    if let Some(parent) = output.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Kayıt klasörü oluşturulamadı ({}): {}", parent.display(), e))?;
        }
    }

    if !job.try_begin() {
        return Err("Bir export zaten çalışıyor.".to_string());
    }

    let mut child = match Command::new(&ffmpeg_bin)
        .args(&args)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(child) => child,
        Err(e) => {
            job.release();
            return Err(format!(
                "FFmpeg çalıştırılamadı (Denenen yol: '{}'). Sisteminizde FFmpeg kurulu mu? Hata: {}",
                ffmpeg_bin, e
            ));
        }
    };

    let total_secs = total_duration.unwrap_or(30.0).max(0.1);
    let stderr = child.stderr.take();
    // The process lives in the job so `cancel_export` can kill it while this command reads its output
    job.attach(child);

    // The reading blocks until FFmpeg is done: keep it off the async runtime's threads
    let progress_app = app.clone();
    let all_stderr = tauri::async_runtime::spawn_blocking(move || {
        let mut all_stderr = String::new();
        if let Some(stderr) = stderr {
            // FFmpeg ends its stats lines with a carriage return (the line is rewritten in place), other messages with a
            // line feed: split on both, or the progress only arrives in one piece when the render is over
            let reader = BufReader::new(stderr);
            for chunk in reader.split(b'\r') {
                let Ok(bytes) = chunk else { continue };
                let text = String::from_utf8_lossy(&bytes);
                for line in text.split('\n') {
                    if line.trim().is_empty() {
                        continue;
                    }
                    // The error text of a failed render should not drown in thousands of stats lines
                    if !line.trim_start().starts_with("frame=") && !line.trim_start().starts_with("size=") {
                        all_stderr.push_str(line);
                        all_stderr.push('\n');
                    }

                    if let Some((seconds, label)) = parse_progress_time(line) {
                        let progress = ((seconds / total_secs) * 100.0).clamp(0.0, 99.0) as f32;
                        let _ = progress_app.emit(
                            "export-progress",
                            ExportProgressPayload {
                                progress,
                                time_str: label.clone(),
                                status: format!("Render Yapılıyor: %{:.0} ({})", progress, label),
                            },
                        );
                    }
                }
            }
        }
        all_stderr
    })
    .await
    .map_err(|e| format!("Export okuma görevi çöktü: {}", e))?;

    let (exit, cancelled) = job.finish();
    if cancelled {
        // A killed render leaves a broken file behind
        let _ = std::fs::remove_file(&output);
        let _ = app.emit(
            "export-progress",
            ExportProgressPayload {
                progress: 0.0,
                time_str: "İptal".to_string(),
                status: "Export iptal edildi.".to_string(),
            },
        );
        return Err(CANCELLED_MESSAGE.to_string());
    }
    let status = exit.ok_or_else(|| "FFmpeg işlemi beklenirken hata oluştu.".to_string())?;

    if status.success() {
        let _ = app.emit(
            "export-progress",
            ExportProgressPayload {
                progress: 100.0,
                time_str: "Bitti".to_string(),
                status: "Render Başarıyla Tamamlandı!".to_string(),
            },
        );
        Ok(output.to_string_lossy().to_string())
    } else {
        eprintln!("[Tauri IPC] Export failed with stderr:\n{}", all_stderr);
        Err(format!("FFmpeg Render Hatası:\n{}", all_stderr))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use export_guard::normalize_path;

    #[test]
    fn reads_audio_from_a_stream_listing() {
        let with_audio = "Input #0, mov\n  Stream #0:0: Video: h264\n  Stream #0:1(und): Audio: aac, 44100 Hz\n";
        let silent = "Input #0, mov\n  Stream #0:0: Video: h264\n";
        assert_eq!(parse_has_audio(with_audio), Some(true));
        assert_eq!(parse_has_audio(silent), Some(false));
        assert_eq!(parse_has_audio("No such file or directory"), None);
    }

    #[test]
    fn ffmpeg_is_never_looked_up_relative_to_the_working_directory() {
        let candidates = ffmpeg_candidates(Some(Path::new("C:\\Apps\\Mivid")));
        assert!(candidates.iter().all(|c| c.is_absolute()), "{:?}", candidates);
        assert_eq!(candidates[0], PathBuf::from("C:\\Apps\\Mivid\\ffmpeg.exe"));
        assert!(ffmpeg_candidates(None).iter().all(|c| c.is_absolute()));
    }

    #[test]
    fn picks_libx264_when_present_else_the_media_foundation_encoder() {
        let gpl = " V....D libx264              libx264 H.264\n V....D h264_mf              H264 via MediaFoundation\n";
        let lgpl = " V....D h264_mf              H264 via MediaFoundation\n V....D h264_nvenc NVIDIA\n";
        let none = " V....D mpeg4                MPEG-4 part 2\n";
        assert_eq!(pick_video_encoder(gpl), Some("libx264"));
        assert_eq!(pick_video_encoder(lgpl), Some("h264_mf"));
        assert_eq!(pick_video_encoder(none), None);
        // a name that only contains the wanted one does not count
        assert_eq!(pick_video_encoder(" V....D libx264rgb           x\n"), None);
    }

    #[test]
    fn reads_the_time_of_a_stats_line() {
        let line = "frame=  150 fps= 61 q=29.0 size=    2048kB time=00:01:05.50 bitrate=1000kbits/s speed=2.1x";
        assert_eq!(parse_progress_time(line), Some((65.5, "00:01:05.50".to_string())));
        // at the very end of the line, and a line without stats
        assert_eq!(parse_progress_time("x time=00:00:02.00").map(|r| r.0), Some(2.0));
        assert_eq!(parse_progress_time("Input #0, mov"), None);
        assert_eq!(parse_progress_time("time=N/A bitrate=N/A"), None);
    }

    #[test]
    fn splits_carriage_return_stats_from_line_feed_messages() {
        use std::io::{BufRead, Cursor};
        let stream = b"Input #0, mov\nframe=1 time=00:00:01.00 x\rframe=2 time=00:00:02.00 x\rlast message\n";
        let mut lines = Vec::new();
        for chunk in Cursor::new(&stream[..]).split(b'\r') {
            for line in String::from_utf8_lossy(&chunk.unwrap()).split('\n') {
                if !line.is_empty() {
                    lines.push(line.to_string());
                }
            }
        }
        assert_eq!(lines.len(), 4);
        assert_eq!(parse_progress_time(&lines[1]).map(|r| r.0), Some(1.0));
        assert_eq!(parse_progress_time(&lines[2]).map(|r| r.0), Some(2.0));
    }

    #[test]
    fn path_comparison_ignores_slash_style_and_case() {
        assert_eq!(normalize_path("C:\\Users\\X\\a.MP4"), normalize_path("c:/users/x/a.mp4"));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(MediaAccess::default())
        .manage(ExportJob::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // Files the user picked in earlier sessions stay previewable (autosave recovery)
            media_access::restore(app.handle(), &app.state::<MediaAccess>());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            select_media_files,
            open_project_dialog,
            select_export_path,
            run_ffmpeg_export,
            cancel_export,
            video_encoder,
            probe_media,
            open_file_location
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
