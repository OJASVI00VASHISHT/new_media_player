// src-tauri/src/lib.rs
// Nova Player — library entry point

mod commands;
mod mpv;
mod state;

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::Mutex;
use tauri::{Emitter, Manager};

use mpv::MpvPlayer;
use state::AppState;

pub fn log_to_file(msg: &str) {
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open("c:\\Users\\Ojasvi\\Desktop\\new_media_player\\app_debug.log")
    {
        use std::io::Write;
        let _ = writeln!(file, "{}", msg);
    }
}

fn is_supported_media_file(path: &std::path::Path) -> bool {
    if !path.is_file() {
        return false;
    }
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        let ext_lower = ext.to_lowercase();
        let supported = [
            "mp4", "mkv", "avi", "mov", "webm", "wmv", "flv", 
            "mp3", "flac", "ogg", "wav", "aac", "m4a", "m4v", "ts"
        ];
        supported.contains(&ext_lower.as_str())
    } else {
        false
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    let args: Vec<String> = std::env::args().collect();
    log_to_file(&format!("--- Nova Player Process Started ---"));
    log_to_file(&format!("Executable arguments: {:?}", args));

    let current_dir = std::env::current_dir().ok();
    log_to_file(&format!("Current working directory: {:?}", current_dir));

    // Check command line arguments for startup file
    let mut startup_file = None;
    for arg in args.iter().skip(1) {
        log_to_file(&format!("Checking startup arg: {}", arg));
        if !arg.starts_with('-') {
            let path = std::path::Path::new(arg);
            let abs_path = if path.is_absolute() {
                path.to_path_buf()
            } else if let Some(ref cd) = current_dir {
                cd.join(path)
            } else {
                path.to_path_buf()
            };
            log_to_file(&format!("Resolved startup abs_path: {}", abs_path.display()));
            if is_supported_media_file(&abs_path) {
                log_to_file(&format!("Found valid startup file: {}", abs_path.display()));
                startup_file = Some(abs_path.to_string_lossy().to_string());
                break;
            }
            // Also handle quoted paths that Windows sometimes passes
            let trimmed = arg.trim_matches('"').trim_matches('\'');
            if trimmed != arg {
                log_to_file(&format!("Checking trimmed startup arg: {}", trimmed));
                let trimmed_path = std::path::Path::new(trimmed);
                let abs_trimmed_path = if trimmed_path.is_absolute() {
                    trimmed_path.to_path_buf()
                } else if let Some(ref cd) = current_dir {
                    cd.join(trimmed_path)
                } else {
                    trimmed_path.to_path_buf()
                };
                log_to_file(&format!("Resolved trimmed startup abs_path: {}", abs_trimmed_path.display()));
                if is_supported_media_file(&abs_trimmed_path) {
                    log_to_file(&format!("Found valid trimmed startup file: {}", abs_trimmed_path.display()));
                    startup_file = Some(abs_trimmed_path.to_string_lossy().to_string());
                    break;
                }
            }
        }
    }

    // Single-instance enforcement removed to allow multiple instances.

    let mut app_state = AppState::new();
    app_state.startup_file = startup_file;

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .manage(Mutex::new(app_state))
        .manage(Mutex::new(
            MpvPlayer::new().expect("Failed to initialize mpv — is mpv-2.dll in vendor/?"),
        ))
        .invoke_handler(tauri::generate_handler![
            commands::open_file,
            commands::play,
            commands::pause,
            commands::toggle_play_pause,
            commands::seek,
            commands::set_volume,
            commands::get_position,
            commands::get_duration,
            commands::get_state,
            commands::stop,
            commands::set_fullscreen,
            commands::next_video,
            commands::previous_video,
            commands::set_speed,
            commands::get_startup_file,
            commands::set_mpv_property,
            commands::set_loop_mode,
            commands::log_from_frontend,
        ])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            log::info!("Nova Player started");

            // Single-instance listener removed.
            
            #[cfg(target_os = "windows")]
            {
                if let Ok(hwnd) = window.hwnd() {
                    let mpv_state = app.state::<Mutex<MpvPlayer>>();
                    let mpv = mpv_state.lock().unwrap();
                    if let Err(e) = mpv.attach_window(hwnd.0 as isize) {
                        log::error!("Failed to attach mpv to window: {:?}", e);
                    } else {
                        log::info!("Successfully attached mpv to window HWND: {:?}", hwnd.0);
                        // Set initial margins
                        if let Ok(size) = window.inner_size() {
                            let scale_factor = window.scale_factor().unwrap_or(1.0);
                            let is_fullscreen = window.is_fullscreen().unwrap_or(false);
                            if let Err(e) = mpv.update_margins(size.height, scale_factor, is_fullscreen) {
                                log::error!("Failed to set initial margins: {:?}", e);
                            }
                        }
                    }
                } else {
                    log::error!("Failed to get window HWND");
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Resized(size) = event {
                let mpv_state = window.state::<Mutex<MpvPlayer>>();
                let mpv = mpv_state.lock().unwrap();
                let scale_factor = window.scale_factor().unwrap_or(1.0);
                let is_fullscreen = window.is_fullscreen().unwrap_or(false);
                if let Err(e) = mpv.update_margins(size.height, scale_factor, is_fullscreen) {
                    log::error!("Failed to update margins: {:?}", e);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Nova Player");
}
