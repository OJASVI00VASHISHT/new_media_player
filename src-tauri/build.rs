// build.rs — Nova Player
// Tells Rust/linker where to find libmpv-2.dll (in vendor/)

use std::env;
use std::path::PathBuf;

fn main() {
    // Tauri's required build step
    tauri_build::build();

    // Tell cargo where the mpv import library lives
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let vendor = manifest_dir.parent().unwrap().join("vendor");

    println!("cargo:rustc-link-search=native={}", vendor.display());
    println!("cargo:rustc-link-lib=dylib=mpv-2");

    // Re-run if vendor contents change
    println!("cargo:rerun-if-changed={}", vendor.join("mpv-2.dll").display());
    println!("cargo:rerun-if-changed={}", vendor.join("libmpv.dll.a").display());
}
