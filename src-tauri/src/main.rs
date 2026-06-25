// src-tauri/src/main.rs
// Nova Player - Main entry point

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    nova_player_lib::run();
}
