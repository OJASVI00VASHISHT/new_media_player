// js/ui.js — Nova Player
// DOM helpers, animations, time formatting

'use strict';

// ── Time Formatting ──────────────────────────────────────────
export function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const mm = String(m).padStart(h > 0 ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// ── Toast Notifications ──────────────────────────────────────
let toastTimer = null;
export function showToast(msg, duration = 1800) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.classList.add('hidden'), 200);
  }, duration);
}

// ── Seek Bar ─────────────────────────────────────────────────
export class SeekBar {
  constructor({ trackEl, filledEl, thumbEl, onSeek }) {
    this.track   = trackEl;
    this.filled  = filledEl;
    this.thumb   = thumbEl;
    this.onSeek  = onSeek;
    this.isDragging = false;
    this.duration = 0;

    this._bindEvents();
  }

  setProgress(position, duration) {
    this.duration = duration;
    const pct = duration > 0 ? (position / duration) * 100 : 0;
    this.filled.style.width = `${pct}%`;
    this.thumb.style.left   = `${pct}%`;
  }

  _getSeekFromEvent(e) {
    const rect = this.track.getBoundingClientRect();
    const x = (e.clientX || (e.touches && e.touches[0].clientX) || 0) - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    return pct * this.duration;
  }

  _bindEvents() {
    this.track.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.onSeek(this._getSeekFromEvent(e));
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const pos = this._getSeekFromEvent(e);
      const pct = this.duration > 0 ? (pos / this.duration) * 100 : 0;
      this.filled.style.width = `${pct}%`;
      this.thumb.style.left   = `${pct}%`;
    });

    document.addEventListener('mouseup', (e) => {
      if (!this.isDragging) return;
      this.isDragging = false;
      this.onSeek(this._getSeekFromEvent(e));
    });
  }
}

// ── Volume Bar ───────────────────────────────────────────────
// Volume range: 0-200 (like VLC). Slider maps linearly over the full range.
export class VolumeBar {
  constructor({ trackEl, filledEl, thumbEl, onVolume }) {
    this.track    = trackEl;
    this.filled   = filledEl;
    this.thumb    = thumbEl;
    this.onVolume = onVolume;
    this.isDragging = false;
    this.MAX = 200;

    this._bindEvents();
  }

  // vol: 0–200 actual volume value.
  // 0–100 = normal zone (first half of slider, violet/cyan gradient)
  // 100–200 = boost zone (second half, amber/red fill + glow)
  setValue(vol) {
    const pct = Math.max(0, Math.min(this.MAX, vol)) / this.MAX * 100;
    this.filled.style.width = `${pct}%`;
    this.thumb.style.left   = `${pct}%`;

    // Apply boost styling when above 100
    const boosted = vol > 100;
    this.filled.classList.toggle('boosted', boosted);
    this.thumb.classList.toggle('boosted', boosted);

    const label = document.getElementById('volume-pct');
    if (label) {
      label.textContent = `${Math.round(vol)}%`;
      label.classList.toggle('boosted', boosted);
    }
  }

  _getVolumeFromEvent(e) {
    const rect = this.track.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    return Math.round(ratio * this.MAX);
  }

  _bindEvents() {
    this.track.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      const vol = this._getVolumeFromEvent(e);
      this.setValue(vol);
      this.onVolume(vol);
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const vol = this._getVolumeFromEvent(e);
      this.setValue(vol);
      this.onVolume(vol);
    });

    document.addEventListener('mouseup', () => { this.isDragging = false; });
  }
}

// ── Zoom Bar ───────────────────────────────────────────────
export class ZoomBar {
  constructor({ trackEl, filledEl, thumbEl, onZoom }) {
    this.track    = trackEl;
    this.filled   = filledEl;
    this.thumb    = thumbEl;
    this.onZoom   = onZoom;
    this.isDragging = false;
    this.MIN = 50;
    this.MAX = 500;

    this._bindEvents();
  }

  setValue(zoom) {
    const pct = Math.max(0, Math.min(100, ((zoom - this.MIN) / (this.MAX - this.MIN)) * 100));
    this.filled.style.width = `${pct}%`;
    this.thumb.style.left   = `${pct}%`;

    const label = document.getElementById('zoom-pct');
    if (label) {
      label.textContent = `${Math.round(zoom)}%`;
    }
  }

  _getZoomFromEvent(e) {
    const rect = this.track.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    return Math.round(this.MIN + ratio * (this.MAX - this.MIN));
  }

  _bindEvents() {
    this.track.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      const zoom = this._getZoomFromEvent(e);
      this.setValue(zoom);
      this.onZoom(zoom);
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      const zoom = this._getZoomFromEvent(e);
      this.setValue(zoom);
      this.onZoom(zoom);
    });

    document.addEventListener('mouseup', () => { this.isDragging = false; });
  }
}

// ── Overlay fade ─────────────────────────────────────────────
let overlayTimer = null;
export function showOverlay(el) {
  el.classList.remove('hidden');
  clearTimeout(overlayTimer);
  overlayTimer = setTimeout(() => el.classList.add('hidden'), 1800);
}
