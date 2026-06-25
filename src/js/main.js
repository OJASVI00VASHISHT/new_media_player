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
  isImage,
  isGif
} from './player.js';

import { showToast } from './ui.js';

// ── Init Window Controls (minimize / maximize / close) ────────
initWindowControls();

// ── Open File Button ──────────────────────────────────────────
document.getElementById('btn-open').addEventListener('click', openFileDialog);

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
let mouseMoveTimer = null;

mpvCon.addEventListener('mousemove', () => {
  const overlay = document.getElementById('overlay');
  overlay.classList.remove('hidden');
  clearTimeout(mouseMoveTimer);
  mouseMoveTimer = setTimeout(() => overlay.classList.add('hidden'), 2500);
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
// Media
document.getElementById('menu-media-open').addEventListener('click', async () => {
  closeAllMenus();
  await openFileDialog();
});
document.getElementById('menu-media-close').addEventListener('click', async () => {
  closeAllMenus();
  await stopVideo();
});
document.getElementById('menu-media-exit').addEventListener('click', () => {
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

// Tools
document.getElementById('menu-tools-info').addEventListener('click', async () => {
  closeAllMenus();
  await showMediaInfo();
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

