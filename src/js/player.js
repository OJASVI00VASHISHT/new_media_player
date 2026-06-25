// js/player.js — Nova Player
// Tauri invoke bridge → all backend command calls live here

'use strict';

import { formatTime, showToast, SeekBar, VolumeBar, showOverlay } from './ui.js';

const { invoke } = window.__TAURI__.core;

// ── State ────────────────────────────────────────────────────
let isPlaying    = false;
let isFullscreen = false;
let duration     = 0;
let positionPoller = null;

// Volume state — single source of truth
let currentVolume  = 75;  // 0-200
let isMuted        = false;
let premuteVolume  = 75;  // saved before mute

// Image/GIF state
let isImage = false;
let isGif = false;

// ── DOM Refs ─────────────────────────────────────────────────
const dropZone       = document.getElementById('drop-zone');
const mpvContainer   = document.getElementById('mpv-container');
const overlay        = document.getElementById('overlay');
const playIcon       = document.getElementById('play-icon');
const pauseIcon      = document.getElementById('pause-icon');
const overlayPlayBtn = document.getElementById('overlay-play-btn');
const timeCurrent    = document.getElementById('time-current');
const timeTotal      = document.getElementById('time-total');
const titleBarFile   = document.getElementById('title-bar-filename');
const volWave1       = document.getElementById('vol-wave1');
const volWave2       = document.getElementById('vol-wave2');
const volumeIcon     = document.getElementById('volume-icon');
const muteIcon       = document.getElementById('mute-icon');
const fsIcon         = document.getElementById('fullscreen-icon');
const exitFsIcon     = document.getElementById('exit-fullscreen-icon');
const progressRow    = document.querySelector('.progress-row');
const btnPlayPause   = document.getElementById('btn-play-pause');
const btnSkipBack    = document.getElementById('btn-skip-back');
const btnSkipForward = document.getElementById('btn-skip-forward');

// ── Seek Bar ─────────────────────────────────────────────────
const seekBar = new SeekBar({
  trackEl:  document.getElementById('seek-track'),
  filledEl: document.getElementById('seek-filled'),
  thumbEl:  document.getElementById('seek-thumb'),
  onSeek: async (seconds) => {
    try {
      await invoke('seek', { seconds });
    } catch (e) { console.error('seek error', e); }
  }
});

// ── Volume Bar ───────────────────────────────────────────────
export const volumeBar = new VolumeBar({
  trackEl:  document.getElementById('volume-track'),
  filledEl: document.getElementById('volume-filled'),
  thumbEl:  document.getElementById('volume-thumb'),
  onVolume: async (volume) => {
    try {
      currentVolume = volume;
      // If user drags while muted, treat as unmute
      if (isMuted && volume > 0) {
        isMuted = false;
        if (volumeIcon) volumeIcon.classList.remove('hidden');
        if (muteIcon)   muteIcon.classList.add('hidden');
      }
      await invoke('set_volume', { volume });
      _syncVolumeUI(volume);
    } catch (e) { console.error('volume error', e); }
  }
});
// Set initial display
volumeBar.setValue(currentVolume);

// ── Helpers ──────────────────────────────────────────────────
function setPlaying(playing) {
  isPlaying = playing;
  playIcon.classList.toggle('hidden', playing);
  pauseIcon.classList.toggle('hidden', !playing);
}

// ── Volume helpers ───────────────────────────────────────────
// Updates wave SVG paths and boost slider classes (no invoke)
function _syncVolumeUI(vol) {
  const muted = vol === 0;
  if (volWave1) volWave1.style.opacity = muted ? '0' : '1';
  if (volWave2) volWave2.style.opacity = (!muted && vol >= 100) ? '1' : '0';
  volumeBar.setValue(vol);
}

function updateVolumeIcon(vol) {
  const muted = vol === 0;
  if (volumeIcon) volumeIcon.classList.toggle('hidden', muted);
  if (muteIcon)   muteIcon.classList.toggle('hidden', !muted);
  _syncVolumeUI(vol);
}

// Exported mute toggle — reliable, uses JS state not DOM
export async function muteToggle() {
  try {
    if (!isMuted) {
      // Mute: save current volume and silence
      premuteVolume = currentVolume > 0 ? currentVolume : 75;
      isMuted = true;
      currentVolume = 0;
      updateVolumeIcon(0);
      await invoke('set_volume', { volume: 0 });
    } else {
      // Unmute: restore saved volume
      isMuted = false;
      currentVolume = premuteVolume;
      updateVolumeIcon(currentVolume);
      await invoke('set_volume', { volume: currentVolume });
    }
  } catch (e) {
    console.error('mute toggle error', e);
  }
}

function showPlayer(filename) {
  dropZone.classList.remove('active');
  mpvContainer.classList.remove('hidden');
  titleBarFile.textContent = filename || '';
  document.title = `${filename || ''} — Nova Player`;
}

export function updatePlaylistUI(snap) {
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');
  const ctxPrev = document.getElementById('ctx-prev');
  const ctxNext = document.getElementById('ctx-next');
  
  const hasMultiple = snap.playlist_size > 1;
  
  if (btnPrev) btnPrev.disabled = !hasMultiple;
  if (btnNext) btnNext.disabled = !hasMultiple;
  
  if (btnPrev) btnPrev.classList.toggle('disabled', !hasMultiple);
  if (btnNext) btnNext.classList.toggle('disabled', !hasMultiple);
  if (ctxPrev) ctxPrev.classList.toggle('disabled', !hasMultiple);
  if (ctxNext) ctxNext.classList.toggle('disabled', !hasMultiple);
}

// ── Position Polling ─────────────────────────────────────────
function startPolling() {
  if (positionPoller) return;
  positionPoller = setInterval(async () => {
    if (!isPlaying) return;
    try {
      const snap = await invoke('get_state');
      duration = snap.duration || 0;

      if (!isImage && !isGif) {
        seekBar.setProgress(snap.position, duration);
        timeCurrent.textContent = formatTime(snap.position);
        timeTotal.textContent   = formatTime(duration);
      }
      updatePlaylistUI(snap);
    } catch (_) {}
  }, 500);
}

function stopPolling() {
  clearInterval(positionPoller);
  positionPoller = null;
}

// ── Open File ─────────────────────────────────────────────────
export async function openFileDialog() {
  try {
    const { open } = window.__TAURI__.dialog;
    const selected = await open({
      multiple: false,
      filters: [{
        name: 'Media',
        extensions: ['mp4','mkv','avi','mov','webm','wmv','flv',
                     'mp3','flac','ogg','wav','aac','m4a','m4v','ts',
                     'jpg','jpeg','png','gif','webp','bmp','avif','heic']
      }]
    });
    if (!selected) return;
    await loadFile(selected);
  } catch (e) {
    console.error('open dialog error', e);
    showToast('Failed to open file');
  }
}

export async function loadFile(path) {
  try {
    const snap = await invoke('open_file', { path });
    const filename = snap.filename || path.split(/[\\/]/).pop();
    showPlayer(filename);
    
    // Check if image or GIF
    const ext = filename.split('.').pop().toLowerCase();
    isImage = ['jpg','jpeg','png','webp','bmp','avif','heic'].includes(ext);
    isGif = ext === 'gif';

    if (isImage || isGif) {
      progressRow.classList.add('hidden');
      if (isImage) {
        btnPlayPause.classList.add('hidden');
      } else {
        btnPlayPause.classList.remove('hidden');
      }
      btnSkipBack.classList.add('hidden');
      btnSkipForward.classList.add('hidden');
      
      if (isGif) {
        await invoke('set_loop_mode', { mode: 'inf' });
      }
    } else {
      progressRow.classList.remove('hidden');
      btnPlayPause.classList.remove('hidden');
      btnSkipBack.classList.remove('hidden');
      btnSkipForward.classList.remove('hidden');
    }

    setPlaying(true);
    duration = snap.duration || 0;
    if (!isImage && !isGif) {
      timeTotal.textContent = formatTime(duration);
    }
    updatePlaylistUI(snap);
    startPolling();
    showToast('▶ Now playing');
  } catch (e) {
    console.error('open_file error', e);
    showToast('Could not open file: ' + e);
  }
}

// ── Playback Controls ─────────────────────────────────────────
export async function togglePlayPause() {
  try {
    const status = await invoke('toggle_play_pause');
    setPlaying(status === 'Playing');
    showOverlay(overlay);
  } catch (e) {
    console.error('toggle error', e);
  }
}

export async function seekRelative(deltaSecs) {
  try {
    const snap = await invoke('get_state');
    const target = Math.max(0, Math.min((snap.duration || 0), snap.position + deltaSecs));
    await invoke('seek', { seconds: target });
    showToast(deltaSecs > 0 ? `⏩ +${deltaSecs}s` : `⏪ ${deltaSecs}s`);
  } catch (e) {
    console.error('seek rel error', e);
  }
}

export async function toggleFullscreen() {
  isFullscreen = !isFullscreen;
  try {
    await invoke('set_fullscreen', { fullscreen: isFullscreen });
    fsIcon.classList.toggle('hidden', isFullscreen);
    exitFsIcon.classList.toggle('hidden', !isFullscreen);
    document.body.classList.toggle('fullscreen-mode', isFullscreen);
  } catch (e) {
    console.error('fullscreen error', e);
  }
}

// ── Playlist Navigation ───────────────────────────────────────
export async function nextVideo() {
  try {
    const snap = await invoke('next_video');
    showPlayer(snap.filename);
    setPlaying(true);
    duration = snap.duration || 0;
    timeTotal.textContent = formatTime(duration);
    updatePlaylistUI(snap);
    startPolling();
    showToast('⏭ Next video');
  } catch (e) {
    console.error('next video error', e);
    showToast('No next video: ' + e);
  }
}

export async function previousVideo() {
  try {
    const snap = await invoke('previous_video');
    showPlayer(snap.filename);
    setPlaying(true);
    duration = snap.duration || 0;
    timeTotal.textContent = formatTime(duration);
    updatePlaylistUI(snap);
    startPolling();
    showToast('⏮ Previous video');
  } catch (e) {
    console.error('prev video error', e);
    showToast('No previous video: ' + e);
  }
}

// ── Speed Controls ───────────────────────────────────────────
export async function changeSpeed(speed) {
  try {
    const newSpeed = await invoke('set_speed', { speed });
    showToast(`⚡ Speed: ${newSpeed.toFixed(2)}x`);
    return newSpeed;
  } catch (e) {
    console.error('set speed error', e);
    showToast('Failed to set speed');
  }
}

export async function adjustSpeed(delta) {
  try {
    const snap = await invoke('get_state');
    const currentSpeed = snap.speed || 1.0;
    const newSpeed = await changeSpeed(currentSpeed + delta);
    return newSpeed;
  } catch (e) {
    console.error('adjust speed error', e);
  }
}

// ── Window Controls ───────────────────────────────────────────
export function initWindowControls() {
  const { getCurrentWindow } = window.__TAURI__.window;
  const win = getCurrentWindow();

  document.getElementById('btn-minimize').addEventListener('click', () => win.minimize());
  document.getElementById('btn-maximize').addEventListener('click', async () => {
    const maximized = await win.isMaximized();
    maximized ? win.unmaximize() : win.maximize();
  });
  document.getElementById('btn-close').addEventListener('click', () => win.close());
}

export async function stopVideo() {
  try {
    await invoke('stop');
    setPlaying(false);
    seekBar.setProgress(0, 0);
    timeCurrent.textContent = '0:00';
    timeTotal.textContent = '0:00';
    titleBarFile.textContent = '';
    document.title = 'Nova Player';
    dropZone.classList.add('active');
    mpvContainer.classList.add('hidden');
    showToast('■ Media stopped');
  } catch (e) {
    console.error('stop error', e);
  }
}

export async function setAspectRatio(ratio) {
  try {
    await invoke('set_mpv_property', { name: 'aspect', value: ratio });
    showToast(`📐 Aspect Ratio: ${ratio === '-1' ? 'Default' : ratio}`);
  } catch (e) {
    console.error('aspect ratio error', e);
  }
}

export async function setSubtitleSize(size) {
  try {
    await invoke('set_mpv_property', { name: 'sub-scale', value: size });
    let label = 'Normal';
    if (size === '0.8') label = 'Smaller';
    else if (size === '1.5') label = 'Larger';
    showToast(`📝 Subtitle Size: ${label}`);
  } catch (e) {
    console.error('subtitle scale error', e);
  }
}

export async function showMediaInfo() {
  try {
    const snap = await invoke('get_state');
    if (snap.current_file) {
      const filename = snap.filename || snap.current_file.split(/[\\/]/).pop();
      const speed = snap.speed || 1.0;
      const vol = snap.volume || 0;
      showToast(`ℹ ${filename} | Vol: ${vol}% | Speed: ${speed.toFixed(2)}x`, 3000);
    } else {
      showToast('ℹ No media loaded');
    }
  } catch (e) {
    console.error('media info error', e);
  }
}

export function changeTheme(themeName) {
  document.body.classList.remove('theme-gray', 'theme-emerald');
  if (themeName === 'gray') {
    document.body.classList.add('theme-gray');
  } else if (themeName === 'emerald') {
    document.body.classList.add('theme-emerald');
  }
  showToast(`🎨 Theme: ${themeName.charAt(0).toUpperCase() + themeName.slice(1)}`);
}

export async function changeVolumeByDelta(delta) {
  try {
    const target = Math.max(0, Math.min(200, currentVolume + delta));
    currentVolume = target;
    if (isMuted && target > 0) {
      isMuted = false;
      if (volumeIcon) volumeIcon.classList.remove('hidden');
      if (muteIcon)   muteIcon.classList.add('hidden');
    }
    await invoke('set_volume', { volume: target });
    _syncVolumeUI(target);
    showToast(`🔊 Volume: ${target}%`);
  } catch (e) {
    console.error('change volume error', e);
  }
}

export { setPlaying, isPlaying, duration, isImage, isGif };
