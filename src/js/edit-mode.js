// js/edit-mode.js — Nova Player Edit Mode Panel
'use strict';

const { invoke } = window.__TAURI__.core;

// ── Edit State ───────────────────────────────────────────────
export let editState = {
  active: false,
  filePath: null,
  
  // Transformations
  rotation: 0,       // -45 to 45 degree arbitrary rotation
  rotate90Count: 0,  // number of 90 deg steps: 0, 1 (90), 2 (180), 3 (270)
  flipH: false,
  flipV: false,
  
  // Zoom & Pan
  zoom: 100,         // 100 to 500
  panX: 0,
  panY: 0,
  
  // Adjustments
  brightness: 0,     // -100 to 100
  contrast: 0,       // -100 to 100
  exposure: 0,       // -100 to 100
  highlights: 0,     // -100 to 100
  shadows: 0,        // -100 to 100
  vignette: 0,       // 0 to 100
  
  // Selected Filter
  filter: 'none'     // none, vivid, warm, cool, mono, vintage
};

// Undo/Redo history stack
let history = [];
let historyIndex = -1;

// ── DOM References ───────────────────────────────────────────
const overlay = document.getElementById('edit-mode-overlay');
const previewImg = document.getElementById('edit-preview-img');
const imgContainer = document.getElementById('edit-img-container');
const vignetteOverlay = document.getElementById('edit-vignette-overlay');
const dimensionsDisplay = document.getElementById('edit-image-dimensions');
const tabButtons = document.querySelectorAll('.edit-tab-btn');
const panels = document.querySelectorAll('.edit-panel-tab');

// Sliders and Value Displays
const sliderBrightness = document.getElementById('slider-brightness');
const valBrightness = document.getElementById('val-brightness');
const sliderContrast = document.getElementById('slider-contrast');
const valContrast = document.getElementById('val-contrast');
const sliderExposure = document.getElementById('slider-exposure');
const valExposure = document.getElementById('val-exposure');
const sliderHighlights = document.getElementById('slider-highlights');
const valHighlights = document.getElementById('val-highlights');
const sliderShadows = document.getElementById('slider-shadows');
const valShadows = document.getElementById('val-shadows');
const sliderVignette = document.getElementById('slider-vignette');
const valVignette = document.getElementById('val-vignette');

const sliderArbitraryRotation = document.getElementById('slider-arbitrary-rotation');
const rotationDegreeVal = document.getElementById('rotation-degree-val');

// Save dropdown elements
const btnSaveOptions = document.getElementById('btn-edit-save-options');
const saveOptionsMenu = document.getElementById('save-options-menu');

// ── Functions ────────────────────────────────────────────────

// Push current state to history (for Undo/Redo)
function pushHistory() {
  if (historyIndex < history.length - 1) {
    history = history.slice(0, historyIndex + 1);
  }
  
  const snapshot = {
    rotation: editState.rotation,
    rotate90Count: editState.rotate90Count,
    flipH: editState.flipH,
    flipV: editState.flipV,
    brightness: editState.brightness,
    contrast: editState.contrast,
    exposure: editState.exposure,
    highlights: editState.highlights,
    shadows: editState.shadows,
    vignette: editState.vignette,
    filter: editState.filter
  };
  
  history.push(snapshot);
  historyIndex++;
  
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  const btnUndo = document.getElementById('btn-edit-undo');
  const btnRedo = document.getElementById('btn-edit-redo');
  
  if (btnUndo) btnUndo.classList.toggle('disabled', historyIndex <= 0);
  if (btnRedo) btnRedo.classList.toggle('disabled', historyIndex >= history.length - 1);
}

// Enter Edit Mode
export function enterEditMode(filePath) {
  if (!filePath) return;
  
  editState.active = true;
  editState.filePath = filePath;
  
  // Reset states
  editState.rotation = 0;
  editState.rotate90Count = 0;
  editState.flipH = false;
  editState.flipV = false;
  editState.zoom = 100;
  editState.panX = 0;
  editState.panY = 0;
  editState.brightness = 0;
  editState.contrast = 0;
  editState.exposure = 0;
  editState.highlights = 0;
  editState.shadows = 0;
  editState.vignette = 0;
  editState.filter = 'none';
  
  history = [];
  historyIndex = -1;
  pushHistory(); // push initial state
  
  // Set up preview image src
  const assetUrl = window.__TAURI__.core.convertFileSrc(filePath);
  previewImg.src = assetUrl;
  
  // Set initial filter cards background
  document.querySelectorAll('.filter-thumb').forEach(thumb => {
    thumb.style.backgroundImage = `url('${assetUrl}')`;
  });
  
  // Retrieve image dimensions
  previewImg.onload = () => {
    dimensionsDisplay.textContent = `${previewImg.naturalWidth} x ${previewImg.naturalHeight}`;
  };
  
  // Reset form inputs
  resetUIInputs();
  
  // Show overlay
  overlay.classList.remove('hidden');
  
  // Default to Rotate tab
  switchTab('rotate');
  
  applyStateToPreview();
}

// Reset UI Sliders to current state
function resetUIInputs() {
  sliderBrightness.value = editState.brightness;
  valBrightness.textContent = editState.brightness;
  
  sliderContrast.value = editState.contrast;
  valContrast.textContent = editState.contrast;
  
  sliderExposure.value = editState.exposure;
  valExposure.textContent = editState.exposure;
  
  sliderHighlights.value = editState.highlights;
  valHighlights.textContent = editState.highlights;
  
  sliderShadows.value = editState.shadows;
  valShadows.textContent = editState.shadows;
  
  sliderVignette.value = editState.vignette;
  valVignette.textContent = editState.vignette;
  
  sliderArbitraryRotation.value = editState.rotation;
  rotationDegreeVal.textContent = `${editState.rotation}°`;
  
  // Flip Buttons UI active state
  document.getElementById('btn-flip-h').classList.toggle('active', editState.flipH);
  document.getElementById('btn-flip-v').classList.toggle('active', editState.flipV);
  
  // Filter cards active state
  document.querySelectorAll('.filter-card').forEach(card => {
    card.classList.toggle('active', card.getAttribute('data-filter') === editState.filter);
  });
}

// Exit Edit Mode
export function exitEditMode() {
  editState.active = false;
  editState.filePath = null;
  overlay.classList.add('hidden');
  previewImg.src = "";
}

// Switch tool tabs
function switchTab(tabId) {
  tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });
  panels.forEach(panel => {
    panel.classList.toggle('active', panel.id === `panel-${tabId}`);
  });
  
  // Rotation slider only visible when rotate tab is active
  const bottomBar = document.getElementById('edit-bottom-bar-rotate');
  if (bottomBar) {
    bottomBar.classList.toggle('hidden', tabId !== 'rotate');
  }
}

// Apply current edits state to preview image using CSS filters and transforms
function applyStateToPreview() {
  // 1. Rotation and Flips and Zoom & Pan
  let totalDeg = (editState.rotate90Count * 90) + parseFloat(editState.rotation);
  let scaleX = editState.flipH ? -1 : 1;
  let scaleY = editState.flipV ? -1 : 1;
  
  // Get container and parent dimensions to auto-fit rotated bounding box
  let fitScale = 1.0;
  const imageArea = document.querySelector('.edit-image-area');
  
  if (imageArea && previewImg) {
    const areaW = imageArea.clientWidth - 64; // 32px padding on each side
    const areaH = imageArea.clientHeight - 64;
    const imgW = previewImg.offsetWidth;
    const imgH = previewImg.offsetHeight;
    
    if (imgW > 0 && imgH > 0 && areaW > 0 && areaH > 0) {
      const rad = (totalDeg * Math.PI) / 180;
      const cos = Math.abs(Math.cos(rad));
      const sin = Math.abs(Math.sin(rad));
      const rotW = imgW * cos + imgH * sin;
      const rotH = imgW * sin + imgH * cos;
      
      fitScale = Math.min(areaW / rotW, areaH / rotH);
    }
    
    // Toggle can-pan class on image area depending on user zoom
    imageArea.classList.toggle('can-pan', editState.zoom > 100);
  }
  
  let finalScale = fitScale * (editState.zoom / 100);
  
  if (imgContainer) {
    // Translation must be applied first so that panning aligns with screen-space coordinates
    imgContainer.style.transform = `translate(${editState.panX}px, ${editState.panY}px) scale(${finalScale}) rotate(${totalDeg}deg) scaleX(${scaleX}) scaleY(${scaleY})`;
  }
  
  // 2. Adjustments and Filter combos
  let filtersList = [];
  
  // Brightness: base 100% + slider%
  let b = 100 + parseInt(editState.brightness);
  filtersList.push(`brightness(${b}%)`);
  
  // Contrast: base 100% + slider%
  let c = 100 + parseInt(editState.contrast);
  filtersList.push(`contrast(${c}%)`);
  
  // Exposure: maps to brightness as well
  if (editState.exposure !== 0) {
    let exp = 100 + parseInt(editState.exposure);
    filtersList.push(`brightness(${exp}%)`);
  }
  
  // Highlights / Shadows: approximate via contrast/saturate adjustments
  if (editState.highlights !== 0 || editState.shadows !== 0) {
    let factor = 100 + ((parseInt(editState.highlights) - parseInt(editState.shadows)) * 0.3);
    filtersList.push(`saturate(${factor}%)`);
  }
  
  // Presets
  switch(editState.filter) {
    case 'vivid':
      filtersList.push('saturate(1.8) contrast(1.1)');
      break;
    case 'warm':
      filtersList.push('sepia(0.35) saturate(1.3) hue-rotate(-10deg)');
      break;
    case 'cool':
      filtersList.push('saturate(1.2) hue-rotate(20deg) contrast(0.95)');
      break;
    case 'mono':
      filtersList.push('grayscale(1) contrast(1.25)');
      break;
    case 'vintage':
      filtersList.push('sepia(0.55) contrast(0.85) brightness(1.05)');
      break;
  }
  
  previewImg.style.filter = filtersList.join(' ');
  
  // Vignette overlay
  if (vignetteOverlay) {
    if (editState.vignette > 0) {
      let opacity = editState.vignette / 100;
      vignetteOverlay.style.background = `radial-gradient(circle, transparent 40%, rgba(0,0,0,${opacity}) 100%)`;
      vignetteOverlay.style.opacity = 1;
    } else {
      vignetteOverlay.style.opacity = 0;
    }
  }
}

// ── Event Listeners ──────────────────────────────────────────

// Tab Switch
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    switchTab(btn.getAttribute('data-tab'));
  });
});

// Flip Buttons
document.getElementById('btn-flip-h').addEventListener('click', () => {
  editState.flipH = !editState.flipH;
  document.getElementById('btn-flip-h').classList.toggle('active', editState.flipH);
  pushHistory();
  applyStateToPreview();
});

document.getElementById('btn-flip-v').addEventListener('click', () => {
  editState.flipV = !editState.flipV;
  document.getElementById('btn-flip-v').classList.toggle('active', editState.flipV);
  pushHistory();
  applyStateToPreview();
});

// Rotate Buttons
document.getElementById('btn-rotate-cw').addEventListener('click', () => {
  editState.rotate90Count = (editState.rotate90Count + 1) % 4;
  pushHistory();
  applyStateToPreview();
});

document.getElementById('btn-rotate-ccw').addEventListener('click', () => {
  editState.rotate90Count = (editState.rotate90Count + 3) % 4;
  pushHistory();
  applyStateToPreview();
});

// Arbitrary rotation slider
sliderArbitraryRotation.addEventListener('input', (e) => {
  editState.rotation = parseFloat(e.target.value);
  rotationDegreeVal.textContent = `${editState.rotation}°`;
  applyStateToPreview();
});

sliderArbitraryRotation.addEventListener('change', () => {
  pushHistory();
});

// Adjustments sliders
const bindSlider = (sliderEl, valEl, prop) => {
  sliderEl.addEventListener('input', (e) => {
    editState[prop] = parseInt(e.target.value);
    valEl.textContent = e.target.value;
    applyStateToPreview();
  });
  
  sliderEl.addEventListener('change', () => {
    pushHistory();
  });
};

bindSlider(sliderBrightness, valBrightness, 'brightness');
bindSlider(sliderContrast, valContrast, 'contrast');
bindSlider(sliderExposure, valExposure, 'exposure');
bindSlider(sliderHighlights, valHighlights, 'highlights');
bindSlider(sliderShadows, valShadows, 'shadows');
bindSlider(sliderVignette, valVignette, 'vignette');

// Reset Adjustments
document.getElementById('btn-reset-adjust').addEventListener('click', () => {
  editState.brightness = 0;
  editState.contrast = 0;
  editState.exposure = 0;
  editState.highlights = 0;
  editState.shadows = 0;
  editState.vignette = 0;
  
  resetUIInputs();
  pushHistory();
  applyStateToPreview();
});

// Filters selection
document.querySelectorAll('.filter-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.filter-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    
    editState.filter = card.getAttribute('data-filter');
    pushHistory();
    applyStateToPreview();
  });
});

// Save Options Dropdown toggle
btnSaveOptions.addEventListener('click', (e) => {
  e.stopPropagation();
  saveOptionsMenu.classList.toggle('hidden');
});

document.addEventListener('click', () => {
  saveOptionsMenu.classList.add('hidden');
});

// Cancel button
document.getElementById('btn-edit-cancel').addEventListener('click', exitEditMode);

// Undo / Redo
const applyHistoryState = () => {
  const state = history[historyIndex];
  if (!state) return;
  
  editState.rotation = state.rotation;
  editState.rotate90Count = state.rotate90Count;
  editState.flipH = state.flipH;
  editState.flipV = state.flipV;
  editState.brightness = state.brightness;
  editState.contrast = state.contrast;
  editState.exposure = state.exposure;
  editState.highlights = state.highlights;
  editState.shadows = state.shadows;
  editState.vignette = state.vignette;
  editState.filter = state.filter;
  
  resetUIInputs();
  applyStateToPreview();
  updateUndoRedoButtons();
};

document.getElementById('btn-edit-undo').addEventListener('click', () => {
  if (historyIndex > 0) {
    historyIndex--;
    applyHistoryState();
  }
});

document.getElementById('btn-edit-redo').addEventListener('click', () => {
  if (historyIndex < history.length - 1) {
    historyIndex++;
    applyHistoryState();
  }
});

// Keyboard shortcuts for Undo/Redo inside Edit Mode
document.addEventListener('keydown', (e) => {
  if (!editState.active) return;
  
  if (e.ctrlKey && e.key === 'z') {
    e.preventDefault();
    document.getElementById('btn-edit-undo').click();
  } else if (e.ctrlKey && e.key === 'y') {
    e.preventDefault();
    document.getElementById('btn-edit-redo').click();
  }
});

// ── Save Logic ────────────────────────────────────────────────

// Save (Overwrite)
document.getElementById('btn-save-overwrite').addEventListener('click', async () => {
  await saveEdits(editState.filePath);
});

// Save a Copy
document.getElementById('btn-save-copy').addEventListener('click', async () => {
  try {
    const { save } = window.__TAURI__.dialog;
    
    // Suggest default name
    const parts = editState.filePath.split(/[\\/]/);
    const filename = parts.pop();
    const extParts = filename.split('.');
    const ext = extParts.pop();
    const nameWithoutExt = extParts.join('.');
    const defaultCopyPath = parts.join('/') + '/' + nameWithoutExt + '_edited.' + ext;
    
    const savePath = await save({
      defaultPath: defaultCopyPath,
      filters: [{
        name: 'Images',
        extensions: [ext]
      }]
    });
    
    if (savePath) {
      await saveEdits(savePath);
    }
  } catch (err) {
    console.error('Save a copy error:', err);
    window.__TAURI__.core.invoke('log_from_frontend', { level: 'error', message: 'Save a copy dialog failed: ' + err });
  }
});

async function saveEdits(destPath) {
  try {
    // Show saving status
    const toast = document.getElementById('toast');
    toast.textContent = "Saving image...";
    toast.classList.remove('hidden');
    
    let totalRot = (editState.rotate90Count * 90) + editState.rotation;
    
    await invoke('save_image_edits', {
      path: editState.filePath,
      destPath: destPath === editState.filePath ? null : destPath,
      rotation: totalRot,
      brightness: parseFloat(editState.brightness),
      contrast: parseFloat(editState.contrast),
      exposure: parseFloat(editState.exposure),
      highlights: parseFloat(editState.highlights),
      shadows: parseFloat(editState.shadows),
      vignette: parseFloat(editState.vignette),
      flipH: editState.flipH,
      flipV: editState.flipV,
      filter: editState.filter
    });
    
    toast.textContent = "Edits saved successfully!";
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 2000);
    
    // Exit edit mode
    exitEditMode();
    
    // Reload player with the edited file
    await invoke('open_file', { path: destPath });
    
  } catch (err) {
    console.error('Save edits error:', err);
    const toast = document.getElementById('toast');
    toast.textContent = "Failed to save edits: " + err;
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 4000);
  }
}

// ── Workspace Scroll/Gesture Zoom ──────────────────────────────
const imageArea = document.querySelector('.edit-image-area');

if (imageArea) {
  imageArea.addEventListener('wheel', (e) => {
    if (!editState.active) return;
    e.preventDefault();
    
    // Use the same factor 0.2 as the main player for consistent, responsive feel
    const zoomStep = -(e.deltaY * 0.2);
    
    const zoomOld = editState.zoom;
    const zoomNew = Math.max(50, Math.min(500, editState.zoom + zoomStep));
    
    if (zoomNew !== zoomOld) {
      // Calculate mouse coordinates relative to the center of the image area
      const rect = imageArea.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const x_screen = e.clientX - centerX;
      const y_screen = e.clientY - centerY;
      
      // Calculate new pan positions to anchor zoom at the cursor
      if (zoomNew <= 100) {
        editState.panX = 0;
        editState.panY = 0;
      } else {
        const ratio = zoomNew / zoomOld;
        editState.panX = x_screen - (x_screen - editState.panX) * ratio;
        editState.panY = y_screen - (y_screen - editState.panY) * ratio;
      }
      
      editState.zoom = zoomNew;
      applyStateToPreview();
    }
  }, { passive: false });

  // Workspace Mouse Pan (Drag)
  let isEditPanning = false;
  let editStartX = 0;
  let editStartY = 0;

  imageArea.addEventListener('mousedown', (e) => {
    if (!editState.active) return;
    if (editState.zoom > 100) {
      isEditPanning = true;
      editStartX = e.clientX;
      editStartY = e.clientY;
      imageArea.classList.add('is-panning');
      e.preventDefault();
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (isEditPanning && editState.active) {
      const dx = e.clientX - editStartX;
      const dy = e.clientY - editStartY;
      editStartX = e.clientX;
      editStartY = e.clientY;
      
      editState.panX += dx;
      editState.panY += dy;
      
      applyStateToPreview();
    }
  });

  document.addEventListener('mouseup', () => {
    if (isEditPanning) {
      isEditPanning = false;
      imageArea.classList.remove('is-panning');
    }
  });
}

// Window resize handler to dynamically adjust rotated image fitting scale
window.addEventListener('resize', () => {
  if (editState.active) {
    applyStateToPreview();
  }
});

// Reset Orientation Button
document.getElementById('btn-reset-rotate')?.addEventListener('click', () => {
  editState.rotation = 0;
  editState.rotate90Count = 0;
  editState.flipH = false;
  editState.flipV = false;
  editState.zoom = 100;
  editState.panX = 0;
  editState.panY = 0;
  
  resetUIInputs();
  pushHistory();
  applyStateToPreview();
});
