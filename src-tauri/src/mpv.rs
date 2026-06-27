// src-tauri/src/mpv.rs
// Nova Player - libmpv wrapper
//
// Uses the `libmpv2` crate which links against mpv-2.dll (libmpv-2.dll on disk).
// The vendor/ directory contains mpv-2.dll (copied from libmpv-2.dll).

use libmpv2::Mpv;
use std::sync::{Arc, Mutex};

/// Thread-safe wrapper around a libmpv Mpv handle.
pub struct MpvPlayer {
    pub handle: Arc<Mutex<Mpv>>,
}

impl MpvPlayer {
    /// Create and configure a new mpv instance for Nova Player.
    pub fn new() -> Result<Self, libmpv2::Error> {
        let mpv = Mpv::new()?;

        // Output / rendering
        mpv.set_property("vo", "gpu")?;
        mpv.set_property("gpu-api", "d3d11")?;
        mpv.set_property("hwdec", "auto")?;
        mpv.set_property("video-sync", "display-resample")?;

        // Audio
        mpv.set_property("volume", 75.0_f64)?;
        mpv.set_property("volume-max", 200.0_f64)?;  // allow boost up to 200%
        mpv.set_property("ao", "wasapi")?;

        // UI — Nova Player draws its own controls
        mpv.set_property("osc", "no")?;
        mpv.set_property("osd-level", 0_i64)?;
        mpv.set_property("keep-open", "yes")?;
        mpv.set_property("idle", "yes")?;
        
        // Image support
        mpv.set_property("image-display-duration", "inf")?;

        let log_path = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|parent| parent.join("mpv_debug.log")))
            .unwrap_or_else(|| std::path::PathBuf::from("mpv_debug.log"));
        
        if let Some(log_path_str) = log_path.to_str() {
            let _ = mpv.set_property("log-file", log_path_str);
        } else {
            let _ = mpv.set_property("log-file", "mpv_debug.log");
        }

        Ok(MpvPlayer {
            handle: Arc::new(Mutex::new(mpv)),
        })
    }

    /// Attach the mpv renderer to a native window handle (wid).
    pub fn attach_window(&self, hwnd: isize) -> Result<(), libmpv2::Error> {
        let mpv = self.handle.lock().unwrap();
        mpv.set_property("wid", hwnd as i64)?;
        Ok(())
    }

    /// Update the top and bottom margins of the video so it fits between the titlebar and control bar.
    pub fn update_margins(&self, window_height: u32, scale_factor: f64, is_fullscreen: bool) -> Result<(), libmpv2::Error> {
        let mpv = self.handle.lock().unwrap();
        
        let (top_physical, bottom_physical) = if is_fullscreen {
            (0.0, 0.0)
        } else {
            (38.0 * scale_factor, 88.0 * scale_factor)
        };
        
        let top_ratio = top_physical / window_height as f64;
        let bottom_ratio = bottom_physical / window_height as f64;
        
        log::info!(
            "update_margins: height={}, scale={}, is_fullscreen={}, top_phys={}, bottom_phys={}, top_ratio={}, bottom_ratio={}",
            window_height, scale_factor, is_fullscreen, top_physical, bottom_physical, top_ratio, bottom_ratio
        );
        
        if let Err(e) = mpv.set_property("video-margin-ratio-top", top_ratio) {
            log::error!("Error setting video-margin-ratio-top: {:?}", e);
            return Err(e);
        }
        if let Err(e) = mpv.set_property("video-margin-ratio-bottom", bottom_ratio) {
            log::error!("Error setting video-margin-ratio-bottom: {:?}", e);
            return Err(e);
        }
        Ok(())
    }

    pub fn load_file(&self, path: &str) -> Result<(), libmpv2::Error> {
        let mpv = self.handle.lock().unwrap();
        mpv.command("loadfile", &[path, "replace"])?;
        Ok(())
    }

    pub fn play(&self) -> Result<(), libmpv2::Error> {
        let mpv = self.handle.lock().unwrap();
        mpv.set_property("pause", false)?;
        Ok(())
    }

    pub fn pause(&self) -> Result<(), libmpv2::Error> {
        let mpv = self.handle.lock().unwrap();
        mpv.set_property("pause", true)?;
        Ok(())
    }

    pub fn toggle_pause(&self) -> Result<(), libmpv2::Error> {
        let mpv = self.handle.lock().unwrap();
        let paused: bool = mpv.get_property("pause")?;
        mpv.set_property("pause", !paused)?;
        Ok(())
    }

    pub fn seek(&self, seconds: f64) -> Result<(), libmpv2::Error> {
        let mpv = self.handle.lock().unwrap();
        mpv.command("seek", &[&seconds.to_string(), "absolute"])?;
        Ok(())
    }

    pub fn set_volume(&self, vol: i64) -> Result<(), libmpv2::Error> {
        let mpv = self.handle.lock().unwrap();
        mpv.set_property("volume", vol as f64)?;
        Ok(())
    }

    pub fn get_position(&self) -> f64 {
        let mpv = self.handle.lock().unwrap();
        mpv.get_property::<f64>("time-pos").unwrap_or(0.0)
    }

    pub fn get_duration(&self) -> f64 {
        let mpv = self.handle.lock().unwrap();
        mpv.get_property::<f64>("duration").unwrap_or(0.0)
    }

    pub fn is_paused(&self) -> bool {
        let mpv = self.handle.lock().unwrap();
        mpv.get_property::<bool>("pause").unwrap_or(true)
    }

    pub fn set_speed(&self, speed: f64) -> Result<(), libmpv2::Error> {
        let mpv = self.handle.lock().unwrap();
        mpv.set_property("speed", speed)?;
        Ok(())
    }

    pub fn get_speed(&self) -> f64 {
        let mpv = self.handle.lock().unwrap();
        mpv.get_property::<f64>("speed").unwrap_or(1.0)
    }

    pub fn stop(&self) -> Result<(), libmpv2::Error> {
        let mpv = self.handle.lock().unwrap();
        mpv.command("stop", &[])?;
        Ok(())
    }
}

impl Default for MpvPlayer {
    fn default() -> Self {
        Self::new().expect("Failed to initialize mpv — ensure mpv-2.dll is in vendor/")
    }
}
