//! Argument guard for `run_ffmpeg_export`.
//!
//! The webview builds the FFmpeg command line (`src/core/export/ffmpegBuilder.ts`) and hands it to Rust. Without a check,
//! any script running in the webview could ask FFmpeg to read an arbitrary file (`-i`, `movie=`, `textfile=`) or to
//! overwrite one (`-y` plus an output path). This module lets through only the kind of command the builder produces:
//! known flags, input files the user picked with a native dialog, the output path the user picked with a native dialog
//! and filters from a fixed list.
//!
//! The lists below are a contract with the builder. `tests/fixtures/export_args.json` is written by the vitest file
//! `src/core/export/guardFixtures.test.ts` from real builder output; the tests here run every fixture through `validate`.
//! When the builder starts to use a new filter or flag, that test and these lists have to change together.

use std::collections::HashSet;
use std::fmt;
use std::path::{Component, Path};

pub const MAX_ARGS: usize = 4096;
pub const MAX_FILTER_GRAPH_BYTES: usize = 2 * 1024 * 1024;

/// Filters the export builder emits (`ALLOWED_FILTERS` snapshot in `guardFixtures.test.ts.snap`)
pub const ALLOWED_FILTERS: &[&str] = &[
    "adelay", "afade", "afftdn", "alphamerge", "amix", "asetpts", "atempo", "atrim", "chromakey", "color",
    "colorchannelmixer", "convolution", "crop", "drawbox", "drawtext", "eq", "fade", "format", "gblur", "geq", "loop", "null",
    "overlay", "pad", "rotate", "scale", "select", "setpts", "split", "trim", "volume",
];

/// Filter options that make FFmpeg read a file. `fontfile` is handled separately (only the Windows font folder).
const FILE_OPTIONS: &[&str] = &["textfile", "file", "filename", "subfile", "fontsdir", "font_file", "lut", "lutfile"];

/// Fonts the builder may reference: the Windows font folder (see `src/core/export/fonts.ts`)
const FONT_DIRECTORY_PREFIX: &str = "c:/windows/fonts/";

const ALLOWED_PRESETS: &[&str] = &["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow"];
const OUTPUT_EXTENSIONS: &[&str] = &["mp4", "mov", "webm"];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GuardError(pub String);

impl fmt::Display for GuardError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for GuardError {}

fn deny<T>(message: impl Into<String>) -> Result<T, GuardError> {
    Err(GuardError(message.into()))
}

/// What a command may touch
pub struct Policy<'a> {
    /// Normalized (see `normalize_path`) media files the user has picked
    pub allowed_inputs: &'a HashSet<String>,
    /// The output file the user has picked
    pub output: &'a Path,
    /// Production checks that inputs exist on disk; unit tests use made-up paths
    pub check_files_exist: bool,
}

/// Slashes forward, lower case: how paths are compared (Windows paths are case-insensitive)
pub fn normalize_path(path: &str) -> String {
    path.replace('\\', "/").to_lowercase()
}

pub fn validate(args: &[String], policy: &Policy) -> Result<(), GuardError> {
    if args.len() < 2 {
        return deny("Geçersiz export komutu: argüman yok.");
    }
    if args.len() > MAX_ARGS {
        return deny("Geçersiz export komutu: çok fazla argüman.");
    }

    let output_arg = &args[args.len() - 1];
    if normalize_path(output_arg) != normalize_path(&policy.output.to_string_lossy()) {
        return deny("Çıktı yolu, seçilen dışa aktarma konumuyla aynı değil.");
    }
    check_output(policy.output)?;

    let mut inputs = 0usize;
    let mut graphs = 0usize;
    let mut i = 0usize;
    let end = args.len() - 1; // the output path is the last argument
    while i < end {
        let flag = args[i].as_str();
        let takes_value = !matches!(flag, "-y");
        if takes_value && i + 1 >= end {
            return deny(format!("'{}' bayrağının değeri yok.", flag));
        }
        let value = if takes_value { args[i + 1].as_str() } else { "" };
        match flag {
            "-y" => {}
            "-loop" => {
                if value != "1" {
                    return deny("-loop yalnızca 1 olabilir.");
                }
            }
            "-framerate" => check_number(flag, value, 0.0, 240.0)?,
            "-t" => check_number(flag, value, 0.0, 86_400.0)?,
            "-i" => {
                inputs += 1;
                check_input(value, policy)?;
            }
            "-filter_complex" => {
                graphs += 1;
                check_filter_graph(value)?;
            }
            "-map" => check_map_label(value)?,
            "-c:a" => expect_value(flag, value, &["aac"])?,
            "-c:v" => expect_value(flag, value, &["libx264", "h264_mf"])?,
            "-b:v" => check_video_bitrate(value)?,
            "-pix_fmt" => expect_value(flag, value, &["yuv420p"])?,
            "-preset" => expect_value(flag, value, ALLOWED_PRESETS)?,
            "-b:a" => check_audio_bitrate(value)?,
            other => return deny(format!("İzin verilmeyen FFmpeg bayrağı: {}", other)),
        }
        i += if takes_value { 2 } else { 1 };
    }

    if inputs == 0 {
        return deny("Export komutunda girdi dosyası yok.");
    }
    if graphs != 1 {
        return deny("Export komutu tam olarak bir -filter_complex içermeli.");
    }
    Ok(())
}

fn expect_value(flag: &str, value: &str, allowed: &[&str]) -> Result<(), GuardError> {
    if allowed.contains(&value) {
        Ok(())
    } else {
        deny(format!("{} için izin verilmeyen değer: {}", flag, value))
    }
}

fn check_number(flag: &str, value: &str, min: f64, max: f64) -> Result<(), GuardError> {
    match value.parse::<f64>() {
        Ok(n) if n.is_finite() && n >= min && n <= max => Ok(()),
        _ => deny(format!("{} için geçersiz sayı: {}", flag, value)),
    }
}

fn check_audio_bitrate(value: &str) -> Result<(), GuardError> {
    let digits = value.strip_suffix('k').unwrap_or("");
    let valid = !digits.is_empty() && digits.len() <= 3 && digits.chars().all(|c| c.is_ascii_digit());
    if valid {
        Ok(())
    } else {
        deny(format!("-b:a için geçersiz değer: {}", value))
    }
}

/// `<digits>k` (kilobits), 1k-200000k: the quality knob of `h264_mf`, which has no CRF
fn check_video_bitrate(value: &str) -> Result<(), GuardError> {
    let digits = value.strip_suffix('k').unwrap_or("");
    let in_range = digits.len() <= 6 && digits.chars().all(|c| c.is_ascii_digit()) && digits.parse::<u32>().map_or(false, |n| (1..=200_000).contains(&n));
    if in_range {
        Ok(())
    } else {
        deny(format!("-b:v için geçersiz değer: {}", value))
    }
}

fn check_map_label(value: &str) -> Result<(), GuardError> {
    let inner = value.strip_prefix('[').and_then(|v| v.strip_suffix(']')).unwrap_or("");
    if !inner.is_empty() && inner.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        Ok(())
    } else {
        deny(format!("-map için geçersiz etiket: {}", value))
    }
}

fn check_output(output: &Path) -> Result<(), GuardError> {
    let extension = output
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    if !OUTPUT_EXTENSIONS.contains(&extension.as_str()) {
        return deny("Çıktı dosyası .mp4, .mov veya .webm olmalı.");
    }
    if !output.is_absolute() || output.components().any(|c| matches!(c, Component::ParentDir)) {
        return deny("Çıktı yolu mutlak ve '..' içermeyen bir yol olmalı.");
    }
    let normalized = normalize_path(&output.to_string_lossy());
    let protected = ["c:/windows/", "c:/program files/", "c:/program files (x86)/", "c:/programdata/"];
    if protected.iter().any(|prefix| normalized.starts_with(prefix)) {
        return deny("Sistem klasörlerine export yapılamaz.");
    }
    Ok(())
}

fn check_input(value: &str, policy: &Policy) -> Result<(), GuardError> {
    if value.is_empty() || value.starts_with('-') {
        return deny("Geçersiz girdi dosyası.");
    }
    let path = Path::new(value);
    if !path.is_absolute() || path.components().any(|c| matches!(c, Component::ParentDir)) {
        return deny(format!("Girdi dosyası mutlak ve '..' içermeyen bir yol olmalı: {}", value));
    }
    if !policy.allowed_inputs.contains(&normalize_path(value)) {
        return deny(format!(
            "Bu dosya medya havuzuna dosya diyaloğuyla eklenmemiş, export'ta kullanılamaz: {}",
            value
        ));
    }
    if policy.check_files_exist && !path.is_file() {
        return deny(format!("Girdi dosyası bulunamadı: {}", value));
    }
    Ok(())
}

/// Splits `text` on `separator` outside single quotes and parentheses. A backslash keeps the next character with the
/// current part, so `\'` and `\:` never open a quote or split.
fn split_top_level(text: &str, separator: char) -> Result<Vec<String>, GuardError> {
    let mut parts = Vec::new();
    let mut current = String::new();
    let mut depth: i32 = 0;
    let mut quoted = false;
    let mut chars = text.chars();
    while let Some(ch) = chars.next() {
        if ch == '\\' {
            current.push(ch);
            if let Some(next) = chars.next() {
                current.push(next);
            }
            continue;
        }
        if ch == '\'' {
            quoted = !quoted;
        }
        if !quoted {
            if ch == '(' {
                depth += 1;
            }
            if ch == ')' {
                depth -= 1;
            }
            if ch == separator && depth == 0 {
                parts.push(std::mem::take(&mut current));
                continue;
            }
        }
        current.push(ch);
    }
    if quoted {
        return deny("Filtre grafında kapanmamış tırnak var.");
    }
    parts.push(current);
    Ok(parts)
}

fn is_label_text(text: &str) -> bool {
    !text.is_empty() && text.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == ':')
}

/// `[a][b]scale=...` -> `scale=...`
fn strip_leading_labels(segment: &str) -> &str {
    let mut rest = segment.trim_start();
    while rest.starts_with('[') {
        match rest.find(']') {
            Some(close) if is_label_text(&rest[1..close]) => rest = rest[close + 1..].trim_start(),
            _ => break,
        }
    }
    rest
}

/// `scale=1:1[out]` -> `scale=1:1`
fn strip_trailing_labels(element: &str) -> &str {
    let mut rest = element.trim_end();
    while rest.ends_with(']') {
        match rest.rfind('[') {
            Some(open) if is_label_text(&rest[open + 1..rest.len() - 1]) => rest = rest[..open].trim_end(),
            _ => break,
        }
    }
    rest
}

pub fn check_filter_graph(graph: &str) -> Result<(), GuardError> {
    if graph.len() > MAX_FILTER_GRAPH_BYTES {
        return deny("Filtre grafı çok büyük.");
    }
    for segment in split_top_level(graph, ';')? {
        let chain = strip_leading_labels(&segment);
        if chain.is_empty() {
            return deny("Filtre grafında boş bir bölüm var.");
        }
        for element in split_top_level(chain, ',')? {
            let element = strip_trailing_labels(strip_leading_labels(&element));
            check_filter(element)?;
        }
    }
    Ok(())
}

fn check_filter(element: &str) -> Result<(), GuardError> {
    let name_end = element
        .find(|c: char| !(c.is_ascii_alphanumeric() || c == '_'))
        .unwrap_or(element.len());
    let name = &element[..name_end];
    if name.is_empty() {
        return deny(format!("Filtre adı okunamadı: {}", truncate(element)));
    }
    if !ALLOWED_FILTERS.contains(&name) {
        return deny(format!("İzin verilmeyen FFmpeg filtresi: {}", name));
    }

    let rest = &element[name_end..];
    if rest.is_empty() {
        return Ok(());
    }
    let options = match rest.strip_prefix('=') {
        Some(options) => options,
        None => return deny(format!("'{}' filtresinden sonra beklenmeyen metin.", name)),
    };

    for option in split_top_level(options, ':')? {
        let Some((key, value)) = option.split_once('=') else {
            continue; // positional value such as `scale=1080:1920`
        };
        let key = key.trim().to_lowercase();
        if key == "fontfile" {
            check_font_file(value)?;
        } else if FILE_OPTIONS.contains(&key.as_str()) {
            return deny(format!("'{}' filtresinde dosya okuyan '{}' seçeneği kullanılamaz.", name, key));
        }
    }
    Ok(())
}

fn check_font_file(value: &str) -> Result<(), GuardError> {
    let unquoted = value.trim().trim_matches('\'');
    let normalized = normalize_path(&unquoted.replace('\\', ""));
    if normalized.starts_with(FONT_DIRECTORY_PREFIX) && !normalized.contains("..") {
        Ok(())
    } else {
        deny(format!("Yazı tipi yalnızca {} altından alınabilir.", "C:/Windows/Fonts"))
    }
}

fn truncate(text: &str) -> String {
    text.chars().take(40).collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[derive(serde::Deserialize)]
    struct Scenario {
        name: String,
        args: Vec<String>,
    }

    #[derive(serde::Deserialize)]
    struct Fixture {
        inputs: Vec<String>,
        output: String,
        scenarios: Vec<Scenario>,
    }

    fn fixture() -> Fixture {
        serde_json::from_str(include_str!("../tests/fixtures/export_args.json")).expect("export_args.json okunamadı")
    }

    fn allowed(inputs: &[String]) -> HashSet<String> {
        inputs.iter().map(|p| normalize_path(p)).collect()
    }

    fn policy<'a>(allowed: &'a HashSet<String>, output: &'a Path) -> Policy<'a> {
        Policy { allowed_inputs: allowed, output, check_files_exist: false }
    }

    fn base_args(graph: &str) -> Vec<String> {
        ["-y", "-i", "C:/media/a.mp4", "-filter_complex", graph, "-map", "[v]", "-c:v", "libx264", "-t", "5.00", "C:/out/export.mp4"]
            .iter()
            .map(|s| s.to_string())
            .collect()
    }

    fn check(args: &[String]) -> Result<(), GuardError> {
        let allowed = allowed(&["C:/media/a.mp4".to_string()]);
        let output = PathBuf::from("C:/out/export.mp4");
        validate(args, &policy(&allowed, &output))
    }

    #[test]
    fn every_builder_scenario_passes() {
        let f = fixture();
        let allowed = allowed(&f.inputs);
        let output = PathBuf::from(&f.output);
        for scenario in &f.scenarios {
            let result = validate(&scenario.args, &policy(&allowed, &output));
            assert!(result.is_ok(), "{}: {:?}", scenario.name, result);
        }
    }

    #[test]
    fn minimal_command_passes() {
        assert_eq!(check(&base_args("color=c=#000000:s=1080x1920:r=30:d=5.00[v]")), Ok(()));
    }

    #[test]
    fn rejects_an_input_that_was_not_picked() {
        let mut args = base_args("color=c=black:s=16x16[v]");
        args[2] = "C:/Users/x/secret.docx".to_string();
        assert!(check(&args).unwrap_err().0.contains("medya havuzuna"));
    }

    #[test]
    fn rejects_parent_directory_and_relative_inputs() {
        let mut args = base_args("color=c=black:s=16x16[v]");
        args[2] = "C:/media/../secret.mp4".to_string();
        assert!(check(&args).is_err());
        args[2] = "media/a.mp4".to_string();
        assert!(check(&args).is_err());
        args[2] = "-f".to_string();
        assert!(check(&args).is_err());
    }

    #[test]
    fn rejects_other_output_paths() {
        let mut args = base_args("color=c=black:s=16x16[v]");
        let last = args.len() - 1;
        args[last] = "C:/Users/x/Desktop/other.mp4".to_string();
        assert!(check(&args).unwrap_err().0.contains("Çıktı yolu"));
    }

    #[test]
    fn rejects_system_folders_and_wrong_extensions_as_output() {
        let allowed = allowed(&["C:/media/a.mp4".to_string()]);
        for bad in ["C:/Windows/System32/x.mp4", "C:/out/export.exe", "C:/out/export"] {
            let output = PathBuf::from(bad);
            let mut args = base_args("color=c=black:s=16x16[v]");
            let last = args.len() - 1;
            args[last] = bad.to_string();
            assert!(validate(&args, &policy(&allowed, &output)).is_err(), "{}", bad);
        }
    }

    #[test]
    fn rejects_unknown_flags_and_values() {
        let mut args = base_args("color=c=black:s=16x16[v]");
        args.splice(1..1, ["-f".to_string(), "rawvideo".to_string()]);
        assert!(check(&args).unwrap_err().0.contains("-f"));

        let mut args = base_args("color=c=black:s=16x16[v]");
        args.splice(1..1, ["-protocol_whitelist".to_string(), "file,http".to_string()]);
        assert!(check(&args).is_err());

        let mut args = base_args("color=c=black:s=16x16[v]");
        args[8] = "libx265".to_string();
        assert!(check(&args).is_err());
    }

    #[test]
    fn media_foundation_encoder_needs_a_sane_bitrate() {
        let mut args = base_args("color=c=black:s=16x16[v]");
        args[8] = "h264_mf".to_string();
        args.splice(9..9, ["-b:v".to_string(), "8000k".to_string()]);
        assert_eq!(check(&args), Ok(()));
        for bad in ["8000", "0k", "999999k", "-1k", "8M", "k", "8000k;x"] {
            args[10] = bad.to_string();
            assert!(check(&args).is_err(), "{}", bad);
        }
    }

    #[test]
    fn rejects_a_flag_without_value_and_missing_parts() {
        assert!(check(&["-y".to_string(), "C:/out/export.mp4".to_string()]).is_err());
        assert!(check(&["C:/out/export.mp4".to_string()]).is_err());
        let args: Vec<String> = ["-i", "C:/media/a.mp4", "-t", "C:/out/export.mp4"].iter().map(|s| s.to_string()).collect();
        assert!(check(&args).is_err());
    }

    #[test]
    fn rejects_filters_that_read_files() {
        for graph in [
            "movie=C\\:/secret.mp4[v]",
            "amovie=C\\:/secret.mp3[v]",
            "color=c=black:s=16x16[b]; [b]subtitles=C\\:/x.srt[v]",
            "color=c=black:s=16x16[b]; [b]lut3d=C\\:/x.cube[v]",
            "color=c=black:s=16x16[b]; [b]sendcmd=f=x[v]",
        ] {
            assert!(check(&base_args(graph)).is_err(), "{}", graph);
        }
    }

    #[test]
    fn rejects_file_options_on_allowed_filters() {
        let graph = "color=c=black:s=16x16[b]; [b]drawtext=textfile=C\\:/secret.txt:fontsize=20[v]";
        assert!(check(&base_args(graph)).unwrap_err().0.contains("textfile"));
    }

    #[test]
    fn font_files_must_come_from_the_windows_font_folder() {
        let good = "color=c=black:s=16x16[b]; [b]drawtext=text='a':fontfile='C\\:/Windows/Fonts/impact.ttf':fontsize=20[v]";
        assert_eq!(check(&base_args(good)), Ok(()));
        let bad = "color=c=black:s=16x16[b]; [b]drawtext=text='a':fontfile='C\\:/Users/x/evil.ttf':fontsize=20[v]";
        assert!(check(&base_args(bad)).unwrap_err().0.contains("Yazı tipi"));
        let traversal = "color=c=black:s=16x16[b]; [b]drawtext=text='a':fontfile='C\\:/Windows/Fonts/../../evil.ttf'[v]";
        assert!(check(&base_args(traversal)).is_err());
    }

    #[test]
    fn a_quoted_filter_name_inside_text_is_only_text() {
        // The text contains `,movie=C:/x` but sits inside quotes, so it is not a filter
        let graph = "color=c=black:s=16x16[b]; [b]drawtext=text='a,movie=C\\:/x;b':fontsize=20[v]";
        assert_eq!(check(&base_args(graph)), Ok(()));
    }

    #[test]
    fn an_unclosed_quote_is_rejected() {
        let graph = "color=c=black:s=16x16[b]; [b]drawtext=text='abc:fontsize=20[v]";
        assert!(check(&base_args(graph)).unwrap_err().0.contains("tırnak"));
    }

    #[test]
    fn rejects_oversized_input() {
        let big = "a".repeat(MAX_FILTER_GRAPH_BYTES + 1);
        assert!(check_filter_graph(&big).is_err());
        let many: Vec<String> = (0..MAX_ARGS + 1).map(|_| "-y".to_string()).collect();
        assert!(check(&many).is_err());
    }

    #[test]
    fn two_filter_graphs_are_rejected() {
        let mut args = base_args("color=c=black:s=16x16[v]");
        args.splice(3..3, ["-filter_complex".to_string(), "color=c=red:s=16x16[w]".to_string()]);
        assert!(check(&args).is_err());
    }
}
