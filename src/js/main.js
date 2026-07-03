// js/main.js — Nova Player
// Entry point: wires all UI events together

'use strict';

import {
  openFileDialog,
  loadFile,
  togglePlayPause,
  seekRelative,
  toggleFullscreen,
  initWindowControls,
  nextVideo,
  previousVideo,
  changeSpeed,
  adjustSpeed,
  volumeBar,
  muteToggle,
  stopVideo,
  setAspectRatio,
  setSubtitleSize,
  showMediaInfo,
  changeTheme,
  changeVolumeByDelta,
  changeZoomByDelta,
  isImage,
  isGif,
  currentFile,
  toggleMediaInfo,
  updateMediaInfoDisplay
} from './player.js';

import { showToast } from './ui.js';
import { enterEditMode, editState } from './edit-mode.js';

// ── Init Window Controls (minimize / maximize / close) ────────
initWindowControls();

// ── Open File Button ──────────────────────────────────────────
document.getElementById('btn-open').addEventListener('click', openFileDialog);
document.getElementById('btn-info').addEventListener('click', toggleMediaInfo);

document.addEventListener('wheel', async (e) => {
  if (isImage || isGif || e.ctrlKey) {
    e.preventDefault();
    // Use a small multiplier for smooth zoom on trackpads, which fire many small deltaY events
    const zoomStep = -(e.deltaY * 0.2);
    await changeZoomByDelta(zoomStep);
  }
}, { passive: false });

// ── Play / Pause ──────────────────────────────────────────────
document.getElementById('btn-play-pause').addEventListener('click', togglePlayPause);

// Click on video overlay also toggles play/pause
document.getElementById('overlay').addEventListener('click', togglePlayPause);
document.getElementById('mpv-container').addEventListener('dblclick', togglePlayPause);

// ── Next / Previous buttons ───────────────────────────────────
document.getElementById('btn-prev').addEventListener('click', previousVideo);
document.getElementById('btn-next').addEventListener('click', nextVideo);

// ── Skip buttons ──────────────────────────────────────────────
document.getElementById('btn-skip-back').addEventListener('click', () => seekRelative(-5));
document.getElementById('btn-skip-forward').addEventListener('click', () => seekRelative(5));

// ── Fullscreen ────────────────────────────────────────────────
document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);

// ── Mute Button ───────────────────────────────────────────────
document.getElementById('btn-mute').addEventListener('click', () => muteToggle());

// ── Drag and Drop ─────────────────────────────────────────────
const dropZone = document.getElementById('drop-zone');

document.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

document.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget || e.relatedTarget === document.body) {
    dropZone.classList.remove('drag-over');
  }
});

document.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');

  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    const file = files[0];
    // Tauri gives us access to the real path via webkitRelativePath or path
    // In Tauri 2, file.path is available for dropped files
    const path = file.path || file.webkitRelativePath || file.name;
    if (path) {
      await loadFile(path);
    }
  }
});

// ── Keyboard Shortcuts ────────────────────────────────────────
document.addEventListener('keydown', async (e) => {
  // Don't fire when typing in an input
  if (e.target.tagName === 'INPUT') return;
  // Don't fire player shortcuts when edit mode is active
  if (editState.active) return;

  switch (e.key) {
    case ' ':
    case 'k':
      e.preventDefault();
      await togglePlayPause();
      break;
    case 'ArrowLeft':
      e.preventDefault();
      if (isImage || isGif) {
        await previousVideo();
      } else {
        await seekRelative(e.shiftKey ? -30 : -5);
      }
      break;
    case 'ArrowRight':
      e.preventDefault();
      if (isImage || isGif) {
        await nextVideo();
      } else {
        await seekRelative(e.shiftKey ? 30 : 5);
      }
      break;
    case 'ArrowUp':
      e.preventDefault();
      await changeVolumeByDelta(10);
      break;
    case 'ArrowDown':
      e.preventDefault();
      await changeVolumeByDelta(-10);
      break;
    case 'f':
    case 'F11':
      e.preventDefault();
      await toggleFullscreen();
      break;
    case 'o':
      if (e.ctrlKey) { e.preventDefault(); await openFileDialog(); }
      break;
    case 'Escape':
      if (document.body.classList.contains('fullscreen-mode')) {
        e.preventDefault();
        await toggleFullscreen();
      }
      break;
    case 'n':
      e.preventDefault();
      await nextVideo();
      break;
    case 'p':
      e.preventDefault();
      await previousVideo();
      break;
    case '[':
      e.preventDefault();
      await adjustSpeed(-0.25);
      break;
    case ']':
      e.preventDefault();
      await adjustSpeed(0.25);
      break;
    case 'Backspace':
      e.preventDefault();
      await changeSpeed(1.0);
      break;
  }
});

// ── Mouse show/hide overlay on video ─────────────────────────
const mpvCon = document.getElementById('mpv-container');
const vidCon = document.getElementById('video-container');
let mouseMoveTimer = null;

mpvCon.addEventListener('mousemove', () => {
  const overlay = document.getElementById('overlay');
  overlay.classList.remove('hidden');
  clearTimeout(mouseMoveTimer);
  mouseMoveTimer = setTimeout(() => overlay.classList.add('hidden'), 2500);
});

vidCon.addEventListener('mouseleave', () => {
  const overlay = document.getElementById('overlay');
  overlay.classList.add('hidden');
});

// ── Custom Context Menu ───────────────────────────────────────
const ctxMenu = document.getElementById('context-menu');

document.addEventListener('contextmenu', (e) => {
  // Don't show custom menu on title bar or control bar
  if (e.target.closest('#title-bar') || e.target.closest('#control-bar')) {
    return;
  }
  
  e.preventDefault();
  
  const menuW = 220;
  const menuH = 260;
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  
  let posX = e.clientX;
  let posY = e.clientY;
  
  if (posX + menuW > winW) posX = winW - menuW - 10;
  if (posY + menuH > winH) posY = winH - menuH - 10;
  
  ctxMenu.style.left = `${posX}px`;
  ctxMenu.style.top = `${posY}px`;
  ctxMenu.classList.remove('hidden');
});

document.addEventListener('click', (e) => {
  if (!ctxMenu.contains(e.target)) {
    ctxMenu.classList.add('hidden');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    ctxMenu.classList.add('hidden');
  }
});

document.getElementById('ctx-play-pause').addEventListener('click', async () => {
  ctxMenu.classList.add('hidden');
  await togglePlayPause();
});

document.getElementById('ctx-prev').addEventListener('click', async () => {
  ctxMenu.classList.add('hidden');
  await previousVideo();
});

document.getElementById('ctx-next').addEventListener('click', async () => {
  ctxMenu.classList.add('hidden');
  await nextVideo();
});

document.getElementById('ctx-fullscreen').addEventListener('click', async () => {
  ctxMenu.classList.add('hidden');
  await toggleFullscreen();
});

document.getElementById('ctx-speed-05').addEventListener('click', async () => {
  ctxMenu.classList.add('hidden');
  await changeSpeed(0.5);
});
document.getElementById('ctx-speed-075').addEventListener('click', async () => {
  ctxMenu.classList.add('hidden');
  await changeSpeed(0.75);
});
document.getElementById('ctx-speed-10').addEventListener('click', async () => {
  ctxMenu.classList.add('hidden');
  await changeSpeed(1.0);
});
document.getElementById('ctx-speed-125').addEventListener('click', async () => {
  ctxMenu.classList.add('hidden');
  await changeSpeed(1.25);
});
document.getElementById('ctx-speed-15').addEventListener('click', async () => {
  ctxMenu.classList.add('hidden');
  await changeSpeed(1.5);
});
document.getElementById('ctx-speed-20').addEventListener('click', async () => {
  ctxMenu.classList.add('hidden');
  await changeSpeed(2.0);
});
document.getElementById('ctx-speed-up').addEventListener('click', async () => {
  ctxMenu.classList.add('hidden');
  await adjustSpeed(0.25);
});
document.getElementById('ctx-speed-down').addEventListener('click', async () => {
  ctxMenu.classList.add('hidden');
  await adjustSpeed(-0.25);
});

// ── Startup File Check ────────────────────────────────────────
(async () => {
  await updateMediaInfoDisplay();
  try {
    const { invoke } = window.__TAURI__.core;
    const startupFile = await invoke('get_startup_file');
    if (startupFile) {
      await loadFile(startupFile);
    }
  } catch (e) {
    console.error('Failed to load startup file:', e);
  }
})();

// ── Single Instance Listener ──────────────────────────────────
(async () => {
  try {
    const { listen } = window.__TAURI__.event;
    await listen('open-file', async (event) => {
      console.log('Single instance open-file event received:', event);
      const filePath = event.payload;
      if (filePath) {
        await loadFile(filePath);
      }
    });
  } catch (e) {
    console.error('Failed to register open-file listener:', e);
  }
})();

// ── Top Menu Dropdown Navigation Logic ────────────────────────
const menuTriggers = document.querySelectorAll('.menu-trigger');
const menuDropdowns = document.querySelectorAll('.menu-dropdown');
let activeMenuTrigger = null;

function closeAllMenus() {
  menuDropdowns.forEach(dropdown => dropdown.classList.add('hidden'));
  menuTriggers.forEach(trigger => trigger.classList.remove('active'));
  activeMenuTrigger = null;
}

menuTriggers.forEach(trigger => {
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    const menuName = trigger.getAttribute('data-menu');
    const dropdown = document.getElementById(`dropdown-${menuName}`);
    const isAlreadyOpen = !dropdown.classList.contains('hidden');

    closeAllMenus();

    if (!isAlreadyOpen) {
      dropdown.classList.remove('hidden');
      trigger.classList.add('active');
      activeMenuTrigger = trigger;
      if (menuName === 'options') {
        updateOptionsDropdownState();
      }
    }
  });

  trigger.addEventListener('mouseenter', () => {
    if (activeMenuTrigger && activeMenuTrigger !== trigger) {
      const menuName = trigger.getAttribute('data-menu');
      const dropdown = document.getElementById(`dropdown-${menuName}`);
      closeAllMenus();
      dropdown.classList.remove('hidden');
      trigger.classList.add('active');
      activeMenuTrigger = trigger;
      if (menuName === 'options') {
        updateOptionsDropdownState();
      }
    }
  });
});

// Click outside close menus
document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu-trigger-container')) {
    closeAllMenus();
  }
});

// ESC key closes menus
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeAllMenus();
  }
});

// ── Top Options Menu Action Handlers ──────────────────────────
// Options
document.getElementById('menu-options-dialog').addEventListener('click', async () => {
  closeAllMenus();
  openOptionsWindow('');
});
document.getElementById('menu-options-styles').addEventListener('click', async () => {
  closeAllMenus();
  openOptionsWindow('#subtitles');
});
document.getElementById('menu-options-reload').addEventListener('click', async () => {
  closeAllMenus();
  try {
    await window.__TAURI__.core.invoke('reload_subtitles');
    showToast('🔄 Subtitles reloaded');
  } catch (e) {
    console.error('reload subtitles error', e);
  }
});
document.getElementById('menu-options-hide').addEventListener('click', async () => {
  closeAllMenus();
  try {
    const active = await window.__TAURI__.core.invoke('get_mpv_property', { name: 'sub-visibility' });
    const nextVal = active === 'yes' ? 'no' : 'yes';
    await window.__TAURI__.core.invoke('set_mpv_property', { name: 'sub-visibility', value: nextVal });
    showToast(nextVal === 'yes' ? '👁️ Subtitles visible' : '👁️ Subtitles hidden');
  } catch (e) {
    console.error('toggle sub visibility error', e);
  }
});
document.getElementById('menu-options-override-default').addEventListener('click', async () => {
  closeAllMenus();
  try {
    const override = await window.__TAURI__.core.invoke('get_mpv_property', { name: 'sub-ass-override' });
    const nextVal = override === 'yes' ? 'no' : 'yes';
    await window.__TAURI__.core.invoke('set_mpv_property', { name: 'sub-ass-override', value: nextVal });
    showToast(nextVal === 'yes' ? '✔️ Default styles overridden' : '❌ Respect file styles');
  } catch (e) {
    console.error(e);
  }
});
document.getElementById('menu-options-override-all').addEventListener('click', async () => {
  closeAllMenus();
  try {
    const override = await window.__TAURI__.core.invoke('get_mpv_property', { name: 'sub-ass-override' });
    const nextVal = override === 'force' ? 'no' : 'force';
    await window.__TAURI__.core.invoke('set_mpv_property', { name: 'sub-ass-override', value: nextVal });
    showToast(nextVal === 'force' ? '✔️ All styles forced override' : '❌ Respect file styles');
  } catch (e) {
    console.error(e);
  }
});

// File Loader retained under Options
document.getElementById('menu-options-open').addEventListener('click', async () => {
  closeAllMenus();
  await openFileDialog();
});
document.getElementById('menu-options-close').addEventListener('click', async () => {
  closeAllMenus();
  await stopVideo();
});
document.getElementById('menu-options-exit').addEventListener('click', () => {
  const { getCurrentWindow } = window.__TAURI__.window;
  getCurrentWindow().close();
});

// Playback
document.getElementById('menu-playback-play').addEventListener('click', async () => {
  closeAllMenus();
  await togglePlayPause();
});
document.getElementById('menu-playback-stop').addEventListener('click', async () => {
  closeAllMenus();
  await stopVideo();
});
document.getElementById('menu-speed-05').addEventListener('click', async () => {
  closeAllMenus();
  await changeSpeed(0.5);
});
document.getElementById('menu-speed-075').addEventListener('click', async () => {
  closeAllMenus();
  await changeSpeed(0.75);
});
document.getElementById('menu-speed-10').addEventListener('click', async () => {
  closeAllMenus();
  await changeSpeed(1.0);
});
document.getElementById('menu-speed-15').addEventListener('click', async () => {
  closeAllMenus();
  await changeSpeed(1.5);
});
document.getElementById('menu-speed-20').addEventListener('click', async () => {
  closeAllMenus();
  await changeSpeed(2.0);
});
document.getElementById('menu-playback-forward').addEventListener('click', async () => {
  closeAllMenus();
  await seekRelative(5);
});
document.getElementById('menu-playback-backward').addEventListener('click', async () => {
  closeAllMenus();
  await seekRelative(-5);
});

// Audio
document.getElementById('menu-audio-mute').addEventListener('click', async () => {
  closeAllMenus();
  await muteToggle();
});
document.getElementById('menu-audio-volup').addEventListener('click', async () => {
  closeAllMenus();
  await changeVolumeByDelta(20); // +10% (out of 200 max)
});
document.getElementById('menu-audio-voldown').addEventListener('click', async () => {
  closeAllMenus();
  await changeVolumeByDelta(-20); // -10% (out of 200 max)
});

// Video
document.getElementById('menu-video-fs').addEventListener('click', async () => {
  closeAllMenus();
  await toggleFullscreen();
});
document.getElementById('menu-aspect-default').addEventListener('click', async () => {
  closeAllMenus();
  await setAspectRatio('-1');
});
document.getElementById('menu-aspect-169').addEventListener('click', async () => {
  closeAllMenus();
  await setAspectRatio('16:9');
});
document.getElementById('menu-aspect-43').addEventListener('click', async () => {
  closeAllMenus();
  await setAspectRatio('4:3');
});
document.getElementById('menu-aspect-235').addEventListener('click', async () => {
  closeAllMenus();
  await setAspectRatio('2.35:1');
});

// Subtitle
document.getElementById('menu-sub-small').addEventListener('click', async () => {
  closeAllMenus();
  await setSubtitleSize('0.8');
});
document.getElementById('menu-sub-normal').addEventListener('click', async () => {
  closeAllMenus();
  await setSubtitleSize('1.0');
});
document.getElementById('menu-sub-large').addEventListener('click', async () => {
  closeAllMenus();
  await setSubtitleSize('1.5');
});

// Edit
document.getElementById('btn-menu-edit')?.addEventListener('click', () => {
  closeAllMenus();
  if (!currentFile) {
    showToast('No media playing.');
    return;
  }
  if (!isImage) {
    showToast('Editing is only supported for images.');
    return;
  }
  enterEditMode(currentFile);
});

// View
document.getElementById('menu-theme-violet').addEventListener('click', () => {
  closeAllMenus();
  changeTheme('violet');
});
document.getElementById('menu-theme-gray').addEventListener('click', () => {
  closeAllMenus();
  changeTheme('gray');
});
document.getElementById('menu-theme-emerald').addEventListener('click', () => {
  closeAllMenus();
  changeTheme('emerald');
});

// ── Repeat Mode Dropdown Logic ────────────────────────────────
const btnRepeat = document.getElementById('btn-repeat');
const repeatDropdown = document.getElementById('repeat-dropdown');
const repeatItems = document.querySelectorAll('.repeat-item');

btnRepeat.addEventListener('click', (e) => {
  e.stopPropagation();
  repeatDropdown.classList.toggle('hidden');
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.repeat-group')) {
    repeatDropdown.classList.add('hidden');
  }
});

let currentRepeatMode = 'no';
async function setRepeatMode(mode) {
  currentRepeatMode = mode;
  let mpvValue = 'no';
  let toastMsg = '🔁 Repeat: Disabled';

  if (mode === 'once') {
    mpvValue = '1';
    toastMsg = '🔁 Repeat: Once';
  } else if (mode === 'twice') {
    mpvValue = '2';
    toastMsg = '🔁 Repeat: Twice';
  } else if (mode === 'forever') {
    mpvValue = 'inf';
    toastMsg = '🔁 Repeat: Forever';
  }

  try {
    const { invoke } = window.__TAURI__.core;
    // Use dedicated set_loop_mode which uses mpv's command API — far more
    // reliable than set_property for loop-file when media is actively playing.
    await invoke('set_loop_mode', { mode: mpvValue });
    showToast(toastMsg);

    repeatItems.forEach(item => {
      const active = item.getAttribute('data-repeat') === mode;
      item.classList.toggle('active', active);
    });

    const badge = document.getElementById('repeat-badge');
    if (mode === 'no') {
      btnRepeat.classList.remove('active');
      badge.classList.add('hidden');
    } else {
      btnRepeat.classList.add('active');
      badge.classList.remove('hidden');
      if (mode === 'once') badge.textContent = '1';
      else if (mode === 'twice') badge.textContent = '2';
      else if (mode === 'forever') badge.textContent = '∞';
    }
  } catch (e) {
    console.error('Failed to set repeat mode:', e);
    showToast('Failed to set repeat mode');
  }
}

repeatItems.forEach(item => {
  item.addEventListener('click', async () => {
    const mode = item.getAttribute('data-repeat');
    await setRepeatMode(mode);
    repeatDropdown.classList.add('hidden');
  });
});

// ── Options Window & Subtitle Tracks Actions ──────────────────
async function openOptionsWindow(hash = '') {
  const { WebviewWindow } = window.__TAURI__.webviewWindow;
  const allWindows = await WebviewWindow.getAll();
  const existing = allWindows.find(w => w.label === 'options');
  if (existing) {
    if (hash) {
      existing.evaluateJavaScript(`window.location.hash = "${hash}"; window.dispatchEvent(new HashChangeEvent("hashchange"));`);
    }
    await existing.setFocus();
  } else {
    new WebviewWindow('options', {
      url: `options.html${hash}`,
      title: 'Nova Player - Options',
      width: 920,
      height: 700,
      minWidth: 700,
      minHeight: 500,
      decorations: true,
      resizable: true,
      center: true,
    });
  }
}

async function updateOptionsDropdownState() {
  const { invoke } = window.__TAURI__.core;
  
  // 1. Update checkmarks for override/visibility
  try {
    const subVis = await invoke('get_mpv_property', { name: 'sub-visibility' });
    const override = await invoke('get_mpv_property', { name: 'sub-ass-override' });
    
    document.querySelector('#menu-options-hide .menu-icon').textContent = subVis === 'no' ? '✓' : '';
    document.querySelector('#menu-options-override-default .menu-icon').textContent = override === 'yes' ? '✓' : '';
    document.querySelector('#menu-options-override-all .menu-icon').textContent = override === 'force' ? '✓' : '';
  } catch (e) {
    console.error('Failed to get options states:', e);
  }

  // 2. Fetch and populate subtitle tracks
  try {
    const tracks = await invoke('get_subtitle_tracks');
    const listEl = document.getElementById('menu-options-tracks-list');
    listEl.innerHTML = '';
    
    if (tracks.length === 0) {
      const emptyItem = document.createElement('div');
      emptyItem.className = 'menu-item disabled';
      emptyItem.innerHTML = '<span class="menu-icon"></span><span class="menu-text">No subtitle tracks</span>';
      listEl.appendChild(emptyItem);
      return;
    }
    
    // Add disable subtitles item
    const noSubItem = document.createElement('div');
    noSubItem.className = 'menu-item';
    const isNoSubSelected = !tracks.some(t => t.selected);
    noSubItem.innerHTML = `<span class="menu-icon">${isNoSubSelected ? '✓' : ''}</span><span class="menu-text">Disable Subtitles</span>`;
    noSubItem.addEventListener('click', async () => {
      closeAllMenus();
      await invoke('set_mpv_property', { name: 'sid', value: 'no' });
      showToast('👁️ Subtitles disabled');
    });
    listEl.appendChild(noSubItem);
    
    // Divider
    const div = document.createElement('div');
    div.className = 'menu-divider';
    listEl.appendChild(div);
    
    // Add each track
    tracks.forEach(track => {
      const item = document.createElement('div');
      item.className = 'menu-item';
      
      const langLabel = track.lang ? track.lang.toUpperCase() : 'UNKNOWN';
      const titleLabel = track.title ? ` - ${track.title}` : '';
      const codecLabel = track.codec ? ` [${track.codec}]` : '';
      const label = `${langLabel}${titleLabel}${codecLabel}`;
      
      item.innerHTML = `<span class="menu-icon">${track.selected ? '✓' : ''}</span><span class="menu-text">S: ${label}</span>`;
      item.addEventListener('click', async () => {
        closeAllMenus();
        await invoke('set_mpv_property', { name: 'sid', value: track.id.toString() });
        showToast(`🗣️ Subtitle track set: ${langLabel}`);
      });
      
      listEl.appendChild(item);
    });
  } catch (e) {
    console.error('Failed to get subtitle tracks:', e);
  }
}

// Listen to options-changed events from separate options window
if (window.__TAURI__ && window.__TAURI__.event) {
  window.__TAURI__.event.listen('options-changed', async () => {
    try {
      const { invoke } = window.__TAURI__.core;
      const vol = await invoke('get_mpv_property', { name: 'volume' });
      if (volumeBar) {
        volumeBar.setValue(Math.round(parseFloat(vol)));
      }
    } catch (e) {
      console.error('options-changed sync error', e);
    }
  });
}


