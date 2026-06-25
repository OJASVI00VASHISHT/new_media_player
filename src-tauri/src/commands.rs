// src-tauri/src/commands.rs
// Nova Player - Tauri command handlers

use std::sync::Mutex;
use tauri::State;
use serde::{Deserialize, Serialize};

use crate::state::{AppState, PlaybackStatus};
use crate::mpv::MpvPlayer;

/// Full snapshot of player state sent to the frontend
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PlayerSnapshot {
    pub status: PlaybackStatus,
    pub current_file: Option<String>,
    pub position: f64,
    pub duration: f64,
    pub volume: i64,
    pub is_fullscreen: bool,
    pub is_muted: bool,
    pub filename: Option<String>,
    pub speed: f64,
    pub playlist_size: usize,
    pub playlist_index: Option<usize>,
}

// ── Helper ──────────────────────────────────────────────────────────────────

fn basename(path: &str) -> String {
    std::path::Path::new(path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(path)
        .to_string()
}

fn get_media_files_in_dir(dir: &std::path::Path) -> Vec<String> {
    let mut files = Vec::new();
    let supported_exts = [
        "mp4", "mkv", "avi", "mov", "webm", "wmv", "flv", 
        "mp3", "flac", "ogg", "wav", "aac", "m4a", "m4v", "ts"
    ];
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries {
            if let Ok(entry) = entry {
                let p = entry.path();
                if p.is_file() {
                    if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                        let ext_lower = ext.to_lowercase();
                        if supported_exts.contains(&ext_lower.as_str()) {
                            if let Some(path_str) = p.to_str() {
                                files.push(path_str.to_string());
                            }
                        }
                    }
                }
            }
        }
    }
    // Sort alphabetically (case-insensitive)
    files.sort_by(|a, b| a.to_lowercase().cmp(&b.to_lowercase()));
    files
}

// ── Commands ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn open_file(
    path: String,
    state: State<Mutex<AppState>>,
    mpv_state: State<Mutex<MpvPlayer>>,
    window: tauri::WebviewWindow,
) -> Result<PlayerSnapshot, String> {
    crate::log_to_file(&format!("open_file command invoked with path: {}", path));
    let mpv = mpv_state.lock().map_err(|e| e.to_string())?;

    // Determine if it's a file or folder
    let path_buf = std::path::PathBuf::from(&path);
    let mut playlist = Vec::new();
    let mut playlist_index = None;
    let mut file_to_play = path.clone();

    if path_buf.is_dir() {
        playlist = get_media_files_in_dir(&path_buf);
        if playlist.is_empty() {
            return Err("No supported media files found in directory".to_string());
        }
        file_to_play = playlist[0].clone();
        playlist_index = Some(0);
    } else {
        if let Some(parent) = path_buf.parent() {
            playlist = get_media_files_in_dir(parent);
            if !playlist.is_empty() {
                playlist_index = playlist.iter().position(|p| {
                    std::path::Path::new(p) == std::path::Path::new(&path)
                });
            }
        }
        if playlist.is_empty() {
            playlist = vec![path.clone()];
            playlist_index = Some(0);
        }
    }

    mpv.load_file(&file_to_play).map_err(|e| e.to_string())?;

    let is_fullscreen = window.is_fullscreen().unwrap_or(false);
    if let Ok(size) = window.inner_size() {
        let scale_factor = window.scale_factor().unwrap_or(1.0);
        if let Err(e) = mpv.update_margins(size.height, scale_factor, is_fullscreen) {
            log::error!("Failed to update margins on file open: {:?}", e);
        }
    }

    let mut app = state.lock().map_err(|e| e.to_string())?;
    app.current_file = Some(file_to_play.clone());
    app.status = PlaybackStatus::Playing;
    app.position = 0.0;
    app.playlist = playlist;
    app.playlist_index = playlist_index;
    app.speed = 1.0;
    let _ = mpv.set_speed(1.0);

    Ok(PlayerSnapshot {
        status: app.status.clone(),
        current_file: app.current_file.clone(),
        filename: Some(basename(&file_to_play)),
        position: app.position,
        duration: app.duration,
        volume: app.volume,
        is_fullscreen: app.is_fullscreen,
        is_muted: app.is_muted,
        speed: app.speed,
        playlist_size: app.playlist.len(),
        playlist_index: app.playlist_index,
    })
}

#[tauri::command]
pub fn play(
    state: State<Mutex<AppState>>,
    mpv_state: State<Mutex<MpvPlayer>>,
) -> Result<(), String> {
    let mpv = mpv_state.lock().map_err(|e| e.to_string())?;
    
    // Replay from beginning if video is finished
    let pos = mpv.get_position();
    let dur = mpv.get_duration();
    if dur > 0.0 && pos >= dur - 0.5 {
        let _ = mpv.seek(0.0);
    }

    mpv.play().map_err(|e| e.to_string())?;

    let mut app = state.lock().map_err(|e| e.to_string())?;
    app.status = PlaybackStatus::Playing;
    Ok(())
}

#[tauri::command]
pub fn pause(
    state: State<Mutex<AppState>>,
    mpv_state: State<Mutex<MpvPlayer>>,
) -> Result<(), String> {
    let mpv = mpv_state.lock().map_err(|e| e.to_string())?;
    mpv.pause().map_err(|e| e.to_string())?;

    let mut app = state.lock().map_err(|e| e.to_string())?;
    app.status = PlaybackStatus::Paused;
    Ok(())
}

#[tauri::command]
pub fn toggle_play_pause(
    state: State<Mutex<AppState>>,
    mpv_state: State<Mutex<MpvPlayer>>,
) -> Result<PlaybackStatus, String> {
    let mpv = mpv_state.lock().map_err(|e| e.to_string())?;
    
    // Replay from beginning if video is finished
    let pos = mpv.get_position();
    let dur = mpv.get_duration();
    let is_paused = mpv.is_paused();
    
    if is_paused {
        if dur > 0.0 && pos >= dur - 0.5 {
            let _ = mpv.seek(0.0);
        }
        mpv.play().map_err(|e| e.to_string())?;
    } else {
        mpv.pause().map_err(|e| e.to_string())?;
    }

    let mut app = state.lock().map_err(|e| e.to_string())?;
    app.status = if mpv.is_paused() {
        PlaybackStatus::Paused
    } else {
        PlaybackStatus::Playing
    };
    Ok(app.status.clone())
}

#[tauri::command]
pub fn seek(
    seconds: f64,
    state: State<Mutex<AppState>>,
    mpv_state: State<Mutex<MpvPlayer>>,
) -> Result<(), String> {
    let mpv = mpv_state.lock().map_err(|e| e.to_string())?;
    mpv.seek(seconds).map_err(|e| e.to_string())?;

    let mut app = state.lock().map_err(|e| e.to_string())?;
    app.position = seconds;
    Ok(())
}

#[tauri::command]
pub fn set_volume(
    volume: i64,
    state: State<Mutex<AppState>>,
    mpv_state: State<Mutex<MpvPlayer>>,
) -> Result<(), String> {
    let mpv = mpv_state.lock().map_err(|e| e.to_string())?;
    let clamped = volume.clamp(0, 200);
    mpv.set_volume(clamped).map_err(|e| e.to_string())?;

    let mut app = state.lock().map_err(|e| e.to_string())?;
    app.volume = clamped;
    Ok(())
}

#[tauri::command]
pub fn get_position(mpv_state: State<Mutex<MpvPlayer>>) -> f64 {
    let mpv = mpv_state.lock().unwrap();
    mpv.get_position()
}

#[tauri::command]
pub fn get_duration(mpv_state: State<Mutex<MpvPlayer>>) -> f64 {
    let mpv = mpv_state.lock().unwrap();
    mpv.get_duration()
}

#[tauri::command]
pub fn get_state(
    state: State<Mutex<AppState>>,
    mpv_state: State<Mutex<MpvPlayer>>,
) -> Result<PlayerSnapshot, String> {
    let mpv = mpv_state.lock().map_err(|e| e.to_string())?;
    let mut app = state.lock().map_err(|e| e.to_string())?;

    // Sync position/duration/speed from mpv
    app.position = mpv.get_position();
    app.duration = mpv.get_duration();
    app.speed = mpv.get_speed();

    let filename = app.current_file.as_deref().map(basename);

    Ok(PlayerSnapshot {
        status: app.status.clone(),
        current_file: app.current_file.clone(),
        filename,
        position: app.position,
        duration: app.duration,
        volume: app.volume,
        is_fullscreen: app.is_fullscreen,
        is_muted: app.is_muted,
        speed: app.speed,
        playlist_size: app.playlist.len(),
        playlist_index: app.playlist_index,
    })
}

#[tauri::command]
pub fn next_video(
    state: State<Mutex<AppState>>,
    mpv_state: State<Mutex<MpvPlayer>>,
    window: tauri::WebviewWindow,
) -> Result<PlayerSnapshot, String> {
    let mut app = state.lock().map_err(|e| e.to_string())?;
    if app.playlist.is_empty() {
        return Err("Playlist is empty".to_string());
    }
    
    let current_idx = app.playlist_index.unwrap_or(0);
    let next_idx = (current_idx + 1) % app.playlist.len();
    let file_to_play = app.playlist[next_idx].clone();

    let mpv = mpv_state.lock().map_err(|e| e.to_string())?;
    mpv.load_file(&file_to_play).map_err(|e| e.to_string())?;

    let is_fullscreen = window.is_fullscreen().unwrap_or(false);
    if let Ok(size) = window.inner_size() {
        let scale_factor = window.scale_factor().unwrap_or(1.0);
        let _ = mpv.update_margins(size.height, scale_factor, is_fullscreen);
    }

    app.current_file = Some(file_to_play.clone());
    app.playlist_index = Some(next_idx);
    app.status = PlaybackStatus::Playing;
    app.position = 0.0;
    app.speed = 1.0;
    let _ = mpv.set_speed(1.0);

    Ok(PlayerSnapshot {
        status: app.status.clone(),
        current_file: app.current_file.clone(),
        filename: Some(basename(&file_to_play)),
        position: app.position,
        duration: app.duration,
        volume: app.volume,
        is_fullscreen: app.is_fullscreen,
        is_muted: app.is_muted,
        speed: app.speed,
        playlist_size: app.playlist.len(),
        playlist_index: app.playlist_index,
    })
}

#[tauri::command]
pub fn previous_video(
    state: State<Mutex<AppState>>,
    mpv_state: State<Mutex<MpvPlayer>>,
    window: tauri::WebviewWindow,
) -> Result<PlayerSnapshot, String> {
    let mut app = state.lock().map_err(|e| e.to_string())?;
    if app.playlist.is_empty() {
        return Err("Playlist is empty".to_string());
    }
    
    let current_idx = app.playlist_index.unwrap_or(0);
    let prev_idx = if current_idx == 0 {
        app.playlist.len() - 1
    } else {
        current_idx - 1
    };
    let file_to_play = app.playlist[prev_idx].clone();

    let mpv = mpv_state.lock().map_err(|e| e.to_string())?;
    mpv.load_file(&file_to_play).map_err(|e| e.to_string())?;

    let is_fullscreen = window.is_fullscreen().unwrap_or(false);
    if let Ok(size) = window.inner_size() {
        let scale_factor = window.scale_factor().unwrap_or(1.0);
        let _ = mpv.update_margins(size.height, scale_factor, is_fullscreen);
    }

    app.current_file = Some(file_to_play.clone());
    app.playlist_index = Some(prev_idx);
    app.status = PlaybackStatus::Playing;
    app.position = 0.0;
    app.speed = 1.0;
    let _ = mpv.set_speed(1.0);

    Ok(PlayerSnapshot {
        status: app.status.clone(),
        current_file: app.current_file.clone(),
        filename: Some(basename(&file_to_play)),
        position: app.position,
        duration: app.duration,
        volume: app.volume,
        is_fullscreen: app.is_fullscreen,
        is_muted: app.is_muted,
        speed: app.speed,
        playlist_size: app.playlist.len(),
        playlist_index: app.playlist_index,
    })
}

#[tauri::command]
pub fn set_speed(
    speed: f64,
    state: State<Mutex<AppState>>,
    mpv_state: State<Mutex<MpvPlayer>>,
) -> Result<f64, String> {
    let mpv = mpv_state.lock().map_err(|e| e.to_string())?;
    let clamped = speed.clamp(0.25, 4.0);
    mpv.set_speed(clamped).map_err(|e| e.to_string())?;

    let mut app = state.lock().map_err(|e| e.to_string())?;
    app.speed = clamped;
    Ok(clamped)
}

#[tauri::command]
pub fn stop(
    state: State<Mutex<AppState>>,
    mpv_state: State<Mutex<MpvPlayer>>,
) -> Result<(), String> {
    let mpv = mpv_state.lock().map_err(|e| e.to_string())?;
    mpv.stop().map_err(|e| e.to_string())?;

    let mut app = state.lock().map_err(|e| e.to_string())?;
    app.reset_playback();
    Ok(())
}

#[tauri::command]
pub fn set_fullscreen(
    fullscreen: bool,
    state: State<Mutex<AppState>>,
    mpv_state: State<Mutex<MpvPlayer>>,
    window: tauri::WebviewWindow,
) -> Result<(), String> {
    let mut app = state.lock().map_err(|e| e.to_string())?;

    if fullscreen {
        // If maximized, unmaximize first so the Windows OS hides the taskbar properly
        let is_max = window.is_maximized().unwrap_or(false);
        app.was_maximized = is_max;
        if is_max {
            let _ = window.unmaximize();
        }
    }

    window.set_fullscreen(fullscreen).map_err(|e| e.to_string())?;
    
    // Set always-on-top in fullscreen to overlay the taskbar on Windows
    window.set_always_on_top(fullscreen).map_err(|e| e.to_string())?;

    if !fullscreen && app.was_maximized {
        let _ = window.maximize();
        app.was_maximized = false;
    }

    // Immediately update margins on fullscreen transition
    let mpv = mpv_state.lock().map_err(|e| e.to_string())?;
    if let Ok(size) = window.inner_size() {
        let scale_factor = window.scale_factor().unwrap_or(1.0);
        let _ = mpv.update_margins(size.height, scale_factor, fullscreen);
    }

    app.is_fullscreen = fullscreen;
    Ok(())
}

#[tauri::command]
pub fn get_startup_file(
    state: State<Mutex<AppState>>,
) -> Option<String> {
    let mut app = state.lock().unwrap();
    app.startup_file.take()
}

#[tauri::command]
pub fn set_mpv_property(
    name: String,
    value: String,
    mpv_state: State<Mutex<MpvPlayer>>,
) -> Result<(), String> {
    crate::log_to_file(&format!("set_mpv_property invoked: name={}, value={}", name, value));
    let mpv = mpv_state.lock().map_err(|e| e.to_string())?;
    let handle = mpv.handle.lock().map_err(|e| e.to_string())?;
    
    // Try setting as a string first (most compatible for choices/composite options in mpv)
    if let Err(e) = handle.set_property(&name, value.as_str()) {
        crate::log_to_file(&format!("set_property as string failed for {}, trying parsed types. Error: {:?}", name, e));
        
        if let Ok(b) = value.parse::<bool>() {
            if let Err(e2) = handle.set_property(&name, b) {
                crate::log_to_file(&format!("set_property as bool also failed: {:?}", e2));
                return Err(e.to_string());
            }
        } else if let Ok(i) = value.parse::<i64>() {
            if let Err(e2) = handle.set_property(&name, i) {
                crate::log_to_file(&format!("set_property as i64 also failed: {:?}", e2));
                return Err(e.to_string());
            }
        } else if let Ok(f) = value.parse::<f64>() {
            if let Err(e2) = handle.set_property(&name, f) {
                crate::log_to_file(&format!("set_property as f64 also failed: {:?}", e2));
                return Err(e.to_string());
            }
        } else {
            return Err(e.to_string());
        }
    }
    
    Ok(())
}

/// Dedicated loop/repeat command using mpv's `set` command API.
/// This is far more reliable than set_property for loop-file when media is playing,
/// because it goes through mpv's script command parser which handles flag types correctly.
#[tauri::command]
pub fn set_loop_mode(
    mode: String, // "no" | "1" | "2" | "inf"
    mpv_state: State<Mutex<MpvPlayer>>,
) -> Result<(), String> {
    crate::log_to_file(&format!("set_loop_mode invoked: mode={}", mode));
    let mpv = mpv_state.lock().map_err(|e| e.to_string())?;
    let handle = mpv.handle.lock().map_err(|e| e.to_string())?;

    // Use the mpv command API "set" which is what the mpv scripting interface uses.
    // This correctly handles the special Flag/Choice type of loop-file.
    let result = handle.command("set", &["loop-file", &mode]);
    match result {
        Ok(_) => {
            crate::log_to_file(&format!("set_loop_mode success: loop-file={}", mode));
            Ok(())
        }
        Err(e) => {
            crate::log_to_file(&format!("set_loop_mode via command failed: {:?}, falling back to set_property", e));
            // Fallback: try set_property as string
            handle.set_property("loop-file", mode.as_str()).map_err(|e2| {
                crate::log_to_file(&format!("set_loop_mode fallback set_property also failed: {:?}", e2));
                format!("set loop failed: {:?} / {:?}", e, e2)
            })
        }
    }
}

#[tauri::command]
pub fn log_from_frontend(
    level: String,
    message: String,
) {
    crate::log_to_file(&format!("[FRONTEND {}] {}", level, message));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_loop_properties() {
        let player = MpvPlayer::new().expect("Failed to create MpvPlayer");
        let handle = player.handle.lock().expect("Failed to lock handle");
        
        assert!(handle.set_property("loop-file", "no").is_ok(), "Setting loop-file to no failed");
        assert!(handle.set_property("loop-file", "1").is_ok(), "Setting loop-file to 1 failed");
        assert!(handle.set_property("loop-file", "2").is_ok(), "Setting loop-file to 2 failed");
        assert!(handle.set_property("loop-file", "inf").is_ok(), "Setting loop-file to inf failed");
    }
}


