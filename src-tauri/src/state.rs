// src-tauri/src/state.rs
// Nova Player - Application state management

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum PlaybackStatus {
    Idle,
    Playing,
    Paused,
    Stopped,
}

impl Default for PlaybackStatus {
    fn default() -> Self {
        PlaybackStatus::Idle
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppState {
    pub status: PlaybackStatus,
    pub current_file: Option<String>,
    pub position: f64,   // seconds
    pub duration: f64,   // seconds
    pub volume: i64,     // 0–100
    pub is_fullscreen: bool,
    pub is_muted: bool,
    pub playlist: Vec<String>,
    pub playlist_index: Option<usize>,
    pub speed: f64,
    pub was_maximized: bool,
    pub startup_file: Option<String>,
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            status: PlaybackStatus::Idle,
            current_file: None,
            position: 0.0,
            duration: 0.0,
            volume: 75,
            is_fullscreen: false,
            is_muted: false,
            playlist: Vec::new(),
            playlist_index: None,
            speed: 1.0,
            was_maximized: false,
            startup_file: None,
        }
    }

    pub fn reset_playback(&mut self) {
        self.status = PlaybackStatus::Idle;
        self.current_file = None;
        self.position = 0.0;
        self.duration = 0.0;
        self.playlist = Vec::new();
        self.playlist_index = None;
        self.speed = 1.0;
        self.was_maximized = false;
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
