# Nova Player — PROJECT_STATE.md

## Current Stage
**Stage 2 — Playlist Navigation, Context Menu & Speed Controls**

## Status
🟢 Active — Stage 2 completed. Playlist navigation (next/prev video based on folder), speed controls, right-click option panel, and video margin scaling fixes are fully implemented.

---

## Architecture

| Layer | Technology |
|---|---|
| Language | Rust (stable) |
| UI Framework | Tauri 2.x |
| Playback Engine | mpv (via libmpv2 crate) |
| Media Decoder | FFmpeg (bundled with mpv) |
| Frontend | HTML / CSS / JS (no framework) |
| Storage | JSON (Stage 1 & 2), SQLite (Stage 3+) |
| Build System | Cargo + npm |

---

## Completed Features
- [x] Project scaffold — directory structure
- [x] Tauri 2 configuration (frameless window, 1280×720)
- [x] Custom title bar (minimize / maximize / close)
- [x] Premium dark UI — violet/cyan palette, Inter font, glassmorphism
- [x] Drag-and-drop file loading (supports files and folders)
- [x] Open file dialog
- [x] mpv wrapper (`MpvPlayer`) — hwdec=auto, vo=gpu, d3d11 backend
- [x] Tauri commands: open_file (with folder scan), play, pause, toggle_play_pause, seek, set_volume, get_state, stop, set_fullscreen, next_video, previous_video, set_speed
- [x] Progress bar (seek by drag)
- [x] Volume control
- [x] Fullscreen toggle
- [x] Keyboard shortcuts (Space/K=play, Arrow=seek, F/F11=fullscreen, Ctrl+O=open, N=next, P=prev, [ ]=speed, Backspace=reset speed)
- [x] Position polling every 500ms
- [x] Toast notifications
- [x] MSVC compiler environment check & linking (`mpv-2.lib` generated from exports)
- [x] Tauri 2 conventions refactor (bin/lib separation)
- [x] Folder-based automatic playlist scanning (Next/Prev video)
- [x] Right-click option panel (custom context menu with play/pause, next/prev, speed controls)
- [x] DPI-aware and fullscreen-aware margins (fixed video overlap and screen cropping)

---

## Pending
- [ ] Stage 3: Playlist management panel (sidebar UI, drag-reorder list, queue)

---

## Known Issues
- None.

---

## File Structure
```
new_media_player/
├── Cargo.toml              # Workspace manifest
├── package.json            # npm scripts
├── PROJECT_STATE.md        # This file
├── README.md
├── vendor/
│   └── mpv-2.dll           # ← REQUIRED (download separately)
├── src/                    # Frontend
│   ├── index.html
│   ├── styles/main.css
│   └── js/
│       ├── main.js
│       ├── player.js
│       └── ui.js
└── src-tauri/
    ├── Cargo.toml
    ├── build.rs
    ├── tauri.conf.json
    ├── icons/              # App icons
    └── src/
        ├── main.rs
        ├── commands.rs
        ├── mpv.rs
        └── state.rs
```

---

## Next Recommended Task
**Stage 1 completion**: Install Rust + run `cargo tauri dev` to verify first launch.

After that, **Stage 2**: Playlist management panel (sidebar, drag-reorder, queue).

---

## Dependencies
| Crate | Version | Purpose |
|---|---|---|
| tauri | 2.0 | App framework |
| tauri-plugin-dialog | 2.0 | File open dialog |
| tauri-plugin-shell | 2.0 | Shell integration |
| libmpv2 | 2.0 | mpv playback binding |
| serde / serde_json | 1.0 | Serialization |
| tokio | 1 | Async runtime |
| log / env_logger | latest | Logging |
