# Nova Player

A modern, beautiful desktop media player for Windows built with Rust + Tauri + mpv.

## Prerequisites

| Tool | How to install |
|---|---|
| Rust stable | https://rustup.rs |
| Node.js ≥ 18 | https://nodejs.org |
| VS Build Tools | Installed automatically via winget |
| mpv-2.dll | See below |

## Getting mpv-2.dll

1. Go to https://sourceforge.net/projects/mpv-player-windows/files/libmpv/
2. Download the latest `mpv-dev-x86_64-*.7z`
3. Extract and copy `mpv-2.dll` into the `vendor/` folder

## Running

```powershell
npm install
npm run dev
```

## Building

```powershell
npm run build
```

## Keyboard Shortcuts

| Key | Action |
|---|---|
| Space / K | Play / Pause |
| ← / → | Seek ±5s |
| Shift+← / → | Seek ±30s |
| F / F11 | Fullscreen |
| Ctrl+O | Open file |

## Architecture

- **Rust + Tauri 2**: App shell, IPC, window management
- **mpv (libmpv2)**: Video/audio decoding and rendering
- **FFmpeg**: Bundled inside mpv — no separate install needed
- **HTML/CSS/JS**: Premium dark UI, no framework required
