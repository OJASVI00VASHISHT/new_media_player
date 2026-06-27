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
    let mut files_with_time: Vec<(String, std::time::SystemTime)> = Vec::new();
    let supported_exts = [
        "mp4", "mkv", "avi", "mov", "webm", "wmv", "flv", 
        "mp3", "flac", "ogg", "wav", "aac", "m4a", "m4v", "ts",
        "jpg", "jpeg", "png", "gif", "webp", "bmp", "avif", "heic"
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
                                let modified_time = entry
                                    .metadata()
                                    .and_then(|m| m.modified())
                                    .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
                                files_with_time.push((path_str.to_string(), modified_time));
                            }
                        }
                    }
                }
            }
        }
    }
    // Sort by Modified Time descending (newest first)
    files_with_time.sort_by(|a, b| b.1.cmp(&a.1));
    files_with_time.into_iter().map(|(path, _)| path).collect()
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

#[tauri::command]
pub fn rotate_image_permanently(path: String) -> Result<(), String> {
    use little_exif::metadata::Metadata;
    use little_exif::exif_tag::ExifTag;

    let path_obj = std::path::Path::new(&path);
    
    // Read current metadata to find existing orientation
    let mut current_orientation = 1;
    let mut metadata = match Metadata::new_from_path(path_obj) {
        Ok(m) => {
            for tag in m.clone().into_iter() {
                if let ExifTag::Orientation(v) = tag {
                    if !v.is_empty() {
                        current_orientation = v[0];
                    }
                }
            }
            m
        },
        Err(_) => Metadata::new(),
    };

    // 90 deg CW mapping
    let new_orientation = match current_orientation {
        1 => 6,
        6 => 3,
        3 => 8,
        8 => 1,
        2 => 7,
        7 => 4,
        4 => 5,
        5 => 2,
        _ => 6,
    };

    metadata.set_tag(ExifTag::Orientation(vec![new_orientation]));
    
    match metadata.write_to_file(path_obj) {
        Ok(_) => {
            crate::log_to_file(&format!("Rotated image losslessly via EXIF: {}", path));
            return Ok(());
        },
        Err(e) => {
            crate::log_to_file(&format!("EXIF rotation failed, falling back to pixel rotation: {}", e));
        }
    }

    // Fallback: Pixel rotation using `image` crate (strips EXIF automatically, so orientation resets to 1)
    let img = image::open(&path).map_err(|e| e.to_string())?;
    let rotated = img.rotate90();
    rotated.save(&path).map_err(|e| e.to_string())?;
    crate::log_to_file(&format!("Rotated image via pixels: {}", path));

    Ok(())
}

fn rotate_about_center(img: &image::DynamicImage, angle_degrees: f32) -> image::DynamicImage {
    let angle_rad = angle_degrees.to_radians();
    let cos_a = angle_rad.cos();
    let sin_a = angle_rad.sin();
    
    let (w, h) = (img.width(), img.height());
    let (cx, cy) = (w as f32 / 2.0, h as f32 / 2.0);
    
    // Compute new dimensions to fit the rotated image
    let new_w = (w as f32 * cos_a.abs() + h as f32 * sin_a.abs()).round() as u32;
    let new_h = (w as f32 * sin_a.abs() + h as f32 * cos_a.abs()).round() as u32;
    
    let ncx = new_w as f32 / 2.0;
    let ncy = new_h as f32 / 2.0;
    
    let src_rgba = img.to_rgba8();
    let mut new_img = image::ImageBuffer::new(new_w, new_h);
    
    for ny in 0..new_h {
        for nx in 0..new_w {
            let dx = nx as f32 - ncx;
            let dy = ny as f32 - ncy;
            
            let ox = dx * cos_a + dy * sin_a + cx;
            let oy = -dx * sin_a + dy * cos_a + cy;
            
            if ox >= 0.0 && ox < w as f32 && oy >= 0.0 && oy < h as f32 {
                let px = ox.floor() as u32;
                let py = oy.floor() as u32;
                if px < w && py < h {
                    new_img.put_pixel(nx, ny, *src_rgba.get_pixel(px, py));
                }
            } else {
                new_img.put_pixel(nx, ny, image::Rgba([0, 0, 0, 0]));
            }
        }
    }
    image::DynamicImage::ImageRgba8(new_img)
}

// ── CSS Filter Helpers ───────────────────────────────────────────────────────

fn hue_rotate_pixel(r: f32, g: f32, b: f32, angle_deg: f32) -> (f32, f32, f32) {
    let theta = angle_deg.to_radians();
    let cosval = theta.cos();
    let sinval = theta.sin();
    
    // Formula from W3C Filter Effects Specification
    let r_r = 0.213 + 0.787 * cosval - 0.213 * sinval;
    let r_g = 0.715 - 0.715 * cosval - 0.715 * sinval;
    let r_b = 0.072 - 0.072 * cosval + 0.928 * sinval;
    
    let g_r = 0.213 - 0.213 * cosval + 0.143 * sinval;
    let g_g = 0.715 + 0.285 * cosval + 0.140 * sinval;
    let g_b = 0.072 - 0.072 * cosval - 0.283 * sinval;
    
    let b_r = 0.213 - 0.213 * cosval - 0.787 * sinval;
    let b_g = 0.715 - 0.715 * cosval + 0.715 * sinval;
    let b_b = 0.072 + 0.928 * cosval + 0.072 * sinval;
    
    let rx = r_r * r + r_g * g + r_b * b;
    let gx = g_r * r + g_g * g + g_b * b;
    let bx = b_r * r + b_g * g + b_b * b;
    
    (rx, gx, bx)
}

fn saturate_pixel(r: f32, g: f32, b: f32, amount: f32) -> (f32, f32, f32) {
    let luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    (
        luma + (r - luma) * amount,
        luma + (g - luma) * amount,
        luma + (b - luma) * amount,
    )
}

fn sepia_pixel(r: f32, g: f32, b: f32, amount: f32) -> (f32, f32, f32) {
    let r_sepia = 0.393 * r + 0.769 * g + 0.189 * b;
    let g_sepia = 0.349 * r + 0.686 * g + 0.168 * b;
    let b_sepia = 0.272 * r + 0.534 * g + 0.131 * b;
    (
        r * (1.0 - amount) + r_sepia * amount,
        g * (1.0 - amount) + g_sepia * amount,
        b * (1.0 - amount) + b_sepia * amount,
    )
}

fn grayscale_pixel(r: f32, g: f32, b: f32, amount: f32) -> (f32, f32, f32) {
    let luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    (
        r * (1.0 - amount) + luma * amount,
        g * (1.0 - amount) + luma * amount,
        b * (1.0 - amount) + luma * amount,
    )
}

#[tauri::command]
pub fn save_image_edits(
    path: String,
    dest_path: Option<String>,
    rotation: f32,
    brightness: f32,
    contrast: f32,
    exposure: f32,
    highlights: f32,
    shadows: f32,
    vignette: f32,
    flip_h: bool,
    flip_v: bool,
    filter: String,
) -> Result<(), String> {
    crate::log_to_file(&format!(
        "save_image_edits: path={}, dest={:?}, rot={}, br={}, co={}, ex={}, hl={}, sd={}, vig={}, fh={}, fv={}, filter={}",
        path, dest_path, rotation, brightness, contrast, exposure, highlights, shadows, vignette, flip_h, flip_v, filter
    ));

    // Load original image
    let mut img = image::open(&path).map_err(|e| e.to_string())?;

    // Apply flip horizontal / vertical
    if flip_h {
        img = img.fliph();
    }
    if flip_v {
        img = img.flipv();
    }

    // Apply rotation
    let rot = rotation % 360.0;
    if rot.abs() > 0.01 {
        if (rot - 90.0).abs() < 0.01 {
            img = img.rotate90();
        } else if (rot - 180.0).abs() < 0.01 || (rot + 180.0).abs() < 0.01 {
            img = img.rotate180();
        } else if (rot - 270.0).abs() < 0.01 || (rot + 90.0).abs() < 0.01 {
            img = img.rotate270();
        } else {
            img = rotate_about_center(&img, rot);
        }
    }

    // Apply pixel adjustments: brightness, contrast, exposure, highlights, shadows, vignette, preset filter
    if brightness.abs() > 0.01
        || contrast.abs() > 0.01
        || exposure.abs() > 0.01
        || highlights.abs() > 0.01
        || shadows.abs() > 0.01
        || vignette.abs() > 0.01
        || filter != "none"
    {
        let mut rgba_img = img.to_rgba8();
        let (w, h) = rgba_img.dimensions();
        let cx = w as f32 / 2.0;
        let cy = h as f32 / 2.0;
        let max_dist = (cx.powi(2) + cy.powi(2)).sqrt();

        // 1. Brightness factor (matches CSS brightness(X%))
        let brightness_factor = (100.0 + brightness) / 100.0;

        // 2. Contrast factor (matches CSS contrast(X%))
        let contrast_factor = (100.0 + contrast) / 100.0;

        // 3. Exposure factor (matches CSS exposure preview mapping to brightness)
        let exposure_factor = (100.0 + exposure) / 100.0;

        // 4. Highlights / Shadows (represented as saturate)
        let has_hl_sd = highlights.abs() > 0.01 || shadows.abs() > 0.01;
        let sat_factor = if has_hl_sd {
            (100.0 + (highlights - shadows) * 0.3) / 100.0
        } else {
            1.0
        };

        // 5. Vignette intensity
        let vignette_strength = vignette / 100.0;

        for y in 0..h {
            for x in 0..w {
                let pixel = rgba_img.get_pixel_mut(x, y);
                let mut r = pixel[0] as f32;
                let mut g = pixel[1] as f32;
                let mut b = pixel[2] as f32;
                let a = pixel[3];

                // Step 1: Brightness
                r *= brightness_factor;
                g *= brightness_factor;
                b *= brightness_factor;

                // Step 2: Contrast
                r = (r - 127.5) * contrast_factor + 127.5;
                g = (g - 127.5) * contrast_factor + 127.5;
                b = (b - 127.5) * contrast_factor + 127.5;

                // Step 3: Exposure
                r *= exposure_factor;
                g *= exposure_factor;
                b *= exposure_factor;

                // Step 4: Highlights / Shadows (saturate)
                if has_hl_sd {
                    let (rx, gx, bx) = saturate_pixel(r, g, b, sat_factor);
                    r = rx; g = gx; b = bx;
                }

                // Step 5: Preset Filters
                match filter.as_str() {
                    "vivid" => {
                        // saturate(1.8) contrast(1.1)
                        let (rx, gx, bx) = saturate_pixel(r, g, b, 1.8);
                        r = (rx - 127.5) * 1.1 + 127.5;
                        g = (gx - 127.5) * 1.1 + 127.5;
                        b = (bx - 127.5) * 1.1 + 127.5;
                    }
                    "warm" => {
                        // sepia(0.35) saturate(1.3) hue-rotate(-10deg)
                        let (rx, gx, bx) = sepia_pixel(r, g, b, 0.35);
                        let (rx, gx, bx) = saturate_pixel(rx, gx, bx, 1.3);
                        let (rx, gx, bx) = hue_rotate_pixel(rx, gx, bx, -10.0);
                        r = rx; g = gx; b = bx;
                    }
                    "cool" => {
                        // saturate(1.2) hue-rotate(20deg) contrast(0.95)
                        let (rx, gx, bx) = saturate_pixel(r, g, b, 1.2);
                        let (rx, gx, bx) = hue_rotate_pixel(rx, gx, bx, 20.0);
                        r = (rx - 127.5) * 0.95 + 127.5;
                        g = (gx - 127.5) * 0.95 + 127.5;
                        b = (bx - 127.5) * 0.95 + 127.5;
                    }
                    "mono" => {
                        // grayscale(1) contrast(1.25)
                        let (rx, gx, bx) = grayscale_pixel(r, g, b, 1.0);
                        r = (rx - 127.5) * 1.25 + 127.5;
                        g = (gx - 127.5) * 1.25 + 127.5;
                        b = (bx - 127.5) * 1.25 + 127.5;
                    }
                    "vintage" => {
                        // sepia(0.55) contrast(0.85) brightness(1.05)
                        let (rx, gx, bx) = sepia_pixel(r, g, b, 0.55);
                        let rx = (rx - 127.5) * 0.85 + 127.5;
                        let gx = (gx - 127.5) * 0.85 + 127.5;
                        let bx = (bx - 127.5) * 0.85 + 127.5;
                        r = rx * 1.05;
                        g = gx * 1.05;
                        b = bx * 1.05;
                    }
                    _ => {}
                }

                // Step 6: Vignette (overlay radial gradient starting at 40% distance)
                if vignette_strength > 0.0 {
                    let dx = x as f32 - cx;
                    let dy = y as f32 - cy;
                    let dist = (dx.powi(2) + dy.powi(2)).sqrt();
                    let d = dist / max_dist;
                    if d > 0.4 {
                        let overlay_opacity = (((d - 0.4) / 0.6) * vignette_strength).clamp(0.0, 1.0);
                        r *= 1.0 - overlay_opacity;
                        g *= 1.0 - overlay_opacity;
                        b *= 1.0 - overlay_opacity;
                    }
                }

                pixel[0] = r.clamp(0.0, 255.0) as u8;
                pixel[1] = g.clamp(0.0, 255.0) as u8;
                pixel[2] = b.clamp(0.0, 255.0) as u8;
                pixel[3] = a;
            }
        }
        img = image::DynamicImage::ImageRgba8(rgba_img);
    }

    let save_path = dest_path.unwrap_or(path);
    img.save(&save_path).map_err(|e| e.to_string())?;

    crate::log_to_file(&format!("Successfully saved image edits to: {}", save_path));
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MediaInfo {
    pub dimensions: Option<String>,
    pub file_size: Option<String>,
}

#[tauri::command]
pub fn get_media_info(
    path: String,
    mpv_state: State<Mutex<MpvPlayer>>,
) -> Result<MediaInfo, String> {
    let path_buf = std::path::Path::new(&path);
    if !path_buf.exists() {
        return Err("File does not exist".to_string());
    }

    // 1. Get file size
    let file_size = if let Ok(meta) = std::fs::metadata(path_buf) {
        let bytes = meta.len();
        if bytes < 1024 {
            Some(format!("{} B", bytes))
        } else if bytes < 1024 * 1024 {
            Some(format!("{:.1} KB", bytes as f32 / 1024.0))
        } else {
            Some(format!("{:.1} MB", bytes as f32 / (1024.0 * 1024.0)))
        }
    } else {
        None
    };

    // 2. Get dimensions
    let mut dimensions = None;

    // Check extension
    if let Some(ext) = path_buf.extension().and_then(|e| e.to_str()) {
        let ext_lower = ext.to_lowercase();
        let is_img = ["jpg", "jpeg", "png", "webp", "bmp", "avif", "heic"].contains(&ext_lower.as_str());
        if is_img {
            if let Ok((w, h)) = image::image_dimensions(path_buf) {
                dimensions = Some(format!("{} x {}", w, h));
            }
        }
    }

    // Fallback: If dimensions still None, try to get from MPV properties
    if dimensions.is_none() {
        if let Ok(mpv_lock) = mpv_state.lock() {
            let handle = mpv_lock.handle.lock().unwrap();
            // Try video-params/w and video-params/h first
            let w: Result<i64, _> = handle.get_property("video-params/w");
            let h: Result<i64, _> = handle.get_property("video-params/h");
            if let (Ok(w_val), Ok(h_val)) = (w, h) {
                if w_val > 0 && h_val > 0 {
                    dimensions = Some(format!("{} x {}", w_val, h_val));
                }
            } else {
                // Try width and height properties
                let w: Result<i64, _> = handle.get_property("width");
                let h: Result<i64, _> = handle.get_property("height");
                if let (Ok(w_val), Ok(h_val)) = (w, h) {
                    if w_val > 0 && h_val > 0 {
                        dimensions = Some(format!("{} x {}", w_val, h_val));
                    }
                }
            }
        }
    }

    Ok(MediaInfo {
        dimensions,
        file_size,
    })
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SubtitleTrack {
    pub id: i64,
    pub title: Option<String>,
    pub lang: Option<String>,
    pub codec: Option<String>,
    pub selected: bool,
}

#[tauri::command]
pub fn get_subtitle_tracks(
    mpv_state: State<Mutex<MpvPlayer>>,
) -> Result<Vec<SubtitleTrack>, String> {
    let mpv = mpv_state.lock().map_err(|e| e.to_string())?;
    let handle = mpv.handle.lock().map_err(|e| e.to_string())?;
    
    let count: i64 = handle.get_property("track-list/count").unwrap_or(0);
    let mut tracks = Vec::new();
    
    for i in 0..count {
        let track_type: String = handle.get_property(&format!("track-list/{}/type", i)).unwrap_or_default();
        if track_type == "sub" {
            let id: i64 = handle.get_property(&format!("track-list/{}/id", i)).unwrap_or(0);
            let title: Option<String> = handle.get_property(&format!("track-list/{}/title", i)).ok();
            let lang: Option<String> = handle.get_property(&format!("track-list/{}/lang", i)).ok();
            let codec: Option<String> = handle.get_property(&format!("track-list/{}/codec", i)).ok();
            let selected: bool = handle.get_property(&format!("track-list/{}/selected", i)).unwrap_or(false);
            
            tracks.push(SubtitleTrack {
                id,
                title,
                lang,
                codec,
                selected,
            });
        }
    }
    
    Ok(tracks)
}

#[tauri::command]
pub fn get_mpv_property(
    name: String,
    mpv_state: State<Mutex<MpvPlayer>>,
) -> Result<String, String> {
    let mpv = mpv_state.lock().map_err(|e| e.to_string())?;
    let handle = mpv.handle.lock().map_err(|e| e.to_string())?;
    
    if let Ok(val) = handle.get_property::<String>(&name) {
        return Ok(val);
    }
    if let Ok(val) = handle.get_property::<bool>(&name) {
        return Ok(val.to_string());
    }
    if let Ok(val) = handle.get_property::<i64>(&name) {
        return Ok(val.to_string());
    }
    if let Ok(val) = handle.get_property::<f64>(&name) {
        return Ok(val.to_string());
    }
    
    Err(format!("Property {} not found or unsupported type", name))
}

#[tauri::command]
pub fn reload_subtitles(
    mpv_state: State<Mutex<MpvPlayer>>,
) -> Result<(), String> {
    let mpv = mpv_state.lock().map_err(|e| e.to_string())?;
    let handle = mpv.handle.lock().map_err(|e| e.to_string())?;
    handle.command("sub-reload", &[]).map_err(|e| e.to_string())?;
    Ok(())
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


