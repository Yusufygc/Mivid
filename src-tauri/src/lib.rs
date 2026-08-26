use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Command, Stdio};
use tauri::{AppHandle, Emitter};

fn find_ffmpeg_executable() -> String {
    let candidate_paths = [
        "C:\\ffmpeg\\bin\\ffmpeg.exe",
        "C:\\ffmpeg\\ffmpeg.exe",
        ".\\ffmpeg.exe",
        "..\\ffmpeg.exe",
    ];

    for path_str in candidate_paths {
        if Path::new(path_str).exists() {
            println!("[Tauri IPC] Found FFmpeg at: {}", path_str);
            return path_str.to_string();
        }
    }

    "ffmpeg".to_string()
}

#[derive(Clone, serde::Serialize)]
struct ExportProgressPayload {
    progress: f32,
    time_str: String,
    status: String,
}

#[tauri::command]
fn select_media_files() -> Vec<String> {
    let files = rfd::FileDialog::new()
        .add_filter("Tüm Medyalar", &["mp4", "mov", "avi", "mkv", "webm", "mp3", "wav", "aac", "m4a", "ogg", "flac", "png", "jpg", "jpeg", "webp"])
        .add_filter("Videolar (*.mp4, *.mov, *.avi, *.mkv)", &["mp4", "mov", "avi", "mkv", "webm"])
        .add_filter("Sesler (*.mp3, *.wav, *.aac, *.m4a)", &["mp3", "wav", "aac", "m4a", "ogg", "flac"])
        .add_filter("Resimler (*.png, *.jpg, *.jpeg)", &["png", "jpg", "jpeg", "webp"])
        .set_title("Medya Dosyası Seçin")
        .pick_files();

    match files {
        Some(paths) => paths
            .into_iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect(),
        None => Vec::new(),
    }
}

#[tauri::command]
fn open_file_location(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let win_path = path.replace('/', "\\");
        println!("[Tauri IPC] Opening explorer with file selected: {}", win_path);
        
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

#[tauri::command]
async fn run_ffmpeg_export(
    app: AppHandle,
    args: Vec<String>,
    output_path: String,
    total_duration: Option<f64>,
) -> Result<String, String> {
    let ffmpeg_bin = find_ffmpeg_executable();
    println!("[Tauri IPC] Using FFmpeg executable: {}", ffmpeg_bin);
    println!("[Tauri IPC] Output path: {}", output_path);
    println!("[Tauri IPC] Total duration: {:?}", total_duration);
    println!("[Tauri IPC] Arguments: {:?}", args);

    // Ensure output directory exists
    let path = Path::new(&output_path);
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Kayıt klasörü oluşturulamadı ({}): {}", parent.display(), e))?;
        }
    }

    let mut child = Command::new(&ffmpeg_bin)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| {
            format!(
                "FFmpeg çalıştırılamadı (Denenen yol: '{}'). Sisteminizde FFmpeg kurulu mu? Hata: {}",
                ffmpeg_bin, e
            )
        })?;

    let total_secs = total_duration.unwrap_or(30.0).max(0.1);
    let mut all_stderr = String::new();

    if let Some(stderr) = child.stderr.take() {
        let reader = BufReader::new(stderr);
        for line in reader.lines() {
            if let Ok(l) = line {
                all_stderr.push_str(&l);
                all_stderr.push('\n');

                // Parse time=HH:MM:SS.dd from FFmpeg progress output
                if let Some(time_idx) = l.find("time=") {
                    let time_substr = &l[time_idx + 5..];
                    if let Some(end_idx) = time_substr.find(' ') {
                        let time_val_str = &time_substr[..end_idx];
                        let parts: Vec<&str> = time_val_str.split(':').collect();
                        if parts.len() == 3 {
                            if let (Ok(h), Ok(m), Ok(s)) = (
                                parts[0].parse::<f64>(),
                                parts[1].parse::<f64>(),
                                parts[2].parse::<f64>(),
                            ) {
                                let current_sec = h * 3600.0 + m * 60.0 + s;
                                let progress = ((current_sec / total_secs) * 100.0).min(99.0) as f32;

                                let _ = app.emit(
                                    "export-progress",
                                    ExportProgressPayload {
                                        progress,
                                        time_str: time_val_str.to_string(),
                                        status: format!("Render Yapılıyor: %{:.0} ({})", progress, time_val_str),
                                    },
                                );
                            }
                        }
                    }
                }
            }
        }
    }

    let status = child
        .wait()
        .map_err(|e| format!("FFmpeg işlemi beklenirken hata: {}", e))?;

    if status.success() {
        let _ = app.emit(
            "export-progress",
            ExportProgressPayload {
                progress: 100.0,
                time_str: "Bitti".to_string(),
                status: "Render Başarıyla Tamamlandı!".to_string(),
            },
        );
        println!("[Tauri IPC] Export succeeded!");
        Ok(output_path)
    } else {
        eprintln!("[Tauri IPC] Export failed with stderr:\n{}", all_stderr);
        Err(format!("FFmpeg Render Hatası:\n{}", all_stderr))
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            select_media_files,
            run_ffmpeg_export,
            open_file_location
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
