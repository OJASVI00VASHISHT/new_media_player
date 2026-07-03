// js/options.js — Nova Player Preferences Controller
'use strict';

const { invoke } = window.__TAURI__.core;
const { emit } = window.__TAURI__.event;
const { getCurrentWindow } = window.__TAURI__.window;

// ── Tab Navigation ───────────────────────────────────────────
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetTab = btn.getAttribute('data-tab');
    
    tabButtons.forEach(b => b.classList.toggle('active', b === btn));
    tabPanels.forEach(p => p.classList.toggle('active', p.id === `tab-${targetTab}`));
  });
});

// ── Sub-tabs for Subtitles ────────────────────────────────────
const subTabButtons = document.querySelectorAll('.sub-tab-btn');
const subTabPanels = document.querySelectorAll('.sub-tab-panel');

subTabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetSubtab = btn.getAttribute('data-subtab');
    
    subTabButtons.forEach(b => b.classList.toggle('active', b === btn));
    subTabPanels.forEach(p => p.classList.toggle('active', p.id === `sub-panel-${targetSubtab}`));
  });
});

// ── Helper Color Conversions ──────────────────────────────────
// MPV colors are typically "#RRGGBBAA" where AA is alpha.
// HTML <input type="color"> takes "#RRGGBB".
function parseMpvColor(mpvColor) {
  if (!mpvColor) return { color: '#ffffff', opacity: 100 };
  let color = mpvColor.trim();
  if (color.startsWith('\'') || color.startsWith('"')) {
    color = color.slice(1, -1);
  }
  if (!color.startsWith('#')) {
    color = '#' + color;
  }
  
  if (color.length === 9) {
    // #RRGGBBAA
    const rgb = color.substring(0, 7);
    const alphaHex = color.substring(7, 9);
    const opacity = Math.round((parseInt(alphaHex, 16) / 255) * 100);
    return { color: rgb, opacity: isNaN(opacity) ? 100 : opacity };
  } else if (color.length === 7) {
    return { color: color, opacity: 100 };
  }
  
  return { color: '#ffffff', opacity: 100 };
}

function toMpvColor(hexColor, opacityPct) {
  const alphaVal = Math.round((opacityPct / 100) * 255);
  const alphaHex = alphaVal.toString(16).padStart(2, '0').toUpperCase();
  return `${hexColor}${alphaHex}`;
}

// ── Load & Initialize Values ──────────────────────────────────
async function loadSettings() {
  try {
    // Local settings from LocalStorage
    document.getElementById('play-resume').checked = localStorage.getItem('play-resume') === 'true';
    document.getElementById('play-pause-minimize').checked = localStorage.getItem('play-pause-minimize') !== 'false';
    document.getElementById('play-auto-next').checked = localStorage.getItem('play-auto-next') !== 'false';
    document.getElementById('play-remember-speed').checked = localStorage.getItem('play-remember-speed') === 'true';
    document.getElementById('play-seek-forward').value = localStorage.getItem('play-seek-forward') || '5';
    document.getElementById('play-seek-backward').value = localStorage.getItem('play-seek-backward') || '5';
    
    // Subtitles override step
    document.getElementById('sub-delay-step').value = localStorage.getItem('sub-delay-step') || '500';

    // ── Fetch from MPV Backend ──
    const getProperty = async (name, fallback = '') => {
      try {
        return await invoke('get_mpv_property', { name });
      } catch (e) {
        return fallback;
      }
    };

    // --- Playback ---
    const speed = await getProperty('speed', '1.0');
    document.getElementById('play-default-speed').value = parseFloat(speed).toFixed(2);
    
    const loop = await getProperty('loop-file', 'no');
    document.getElementById('play-loop-mode').value = loop;

    // --- Audio ---
    const vol = await getProperty('volume', '100');
    const volVal = Math.round(parseFloat(vol));
    document.getElementById('audio-volume').value = volVal;
    document.getElementById('audio-volume-display').textContent = `${volVal}%`;

    const channels = await getProperty('ad-channels', 'auto');
    document.getElementById('audio-channels').value = channels;

    const maxAmp = await getProperty('volume-max', '200');
    document.getElementById('audio-max-amp').value = Math.round(parseFloat(maxAmp));

    // Audio delay
    const audioDelay = await getProperty('audio-delay', '0.0');
    const delayMs = Math.round(parseFloat(audioDelay) * 1000);
    document.getElementById('audio-delay-ms').value = Math.abs(delayMs);
    document.getElementById('audio-delay-enable').checked = delayMs !== 0;

    // Audio Devices List
    const deviceListStr = await getProperty('audio-device-list', '[]');
    const activeDevice = await getProperty('audio-device', 'auto');
    try {
      const devices = JSON.parse(deviceListStr);
      const devSelect = document.getElementById('audio-device');
      devSelect.innerHTML = '<option value="auto">Default System Output</option>';
      devices.forEach(d => {
        if (d.name !== 'auto') {
          const opt = document.createElement('option');
          opt.value = d.name;
          opt.textContent = d.description || d.name;
          devSelect.appendChild(opt);
        }
      });
      devSelect.value = activeDevice;
    } catch (e) {
      console.error('Failed to parse audio device list:', e);
    }

    // Parse Audio Filters (af)
    const afStr = await getProperty('af', '');
    document.getElementById('audio-crossfeed').checked = afStr.includes('bs2b');
    document.getElementById('audio-normalize').checked = afStr.includes('dynaudnorm');
    
    // Crossfeed params
    if (afStr.includes('bs2b')) {
      const cutoffMatch = afStr.match(/bs2b=f=(\d+)/);
      const levelMatch = afStr.match(/bs2b=.*d=([\d.]+)/);
      if (cutoffMatch) {
        document.getElementById('audio-crossfeed-cutoff').value = cutoffMatch[1];
        document.getElementById('audio-crossfeed-cutoff-val').textContent = `${cutoffMatch[1]} Hz`;
      }
      if (levelMatch) {
        document.getElementById('audio-crossfeed-level').value = levelMatch[1];
        document.getElementById('audio-crossfeed-level-val').textContent = `${levelMatch[1]} dB`;
      }
    }

    // Audio boost
    if (afStr.includes('volume=volume=')) {
      const boostMatch = afStr.match(/volume=volume=(\d+)dB/);
      if (boostMatch) {
        document.getElementById('audio-boost').value = boostMatch[1];
        document.getElementById('audio-boost-val').textContent = `${boostMatch[1]} dB`;
      }
    }

    // --- Video ---
    const hwdec = await getProperty('hwdec', 'auto');
    document.getElementById('video-hwdec').value = hwdec;

    const vo = await getProperty('vo', 'gpu');
    document.getElementById('video-renderer').value = vo;

    const vsync = await getProperty('video-sync', 'display-resample');
    document.getElementById('video-sync').value = vsync;

    // Color attributes
    const bright = await getProperty('brightness', '0');
    document.getElementById('video-brightness').value = parseInt(bright);
    document.getElementById('video-brightness-val').textContent = bright;

    const contrast = await getProperty('contrast', '0');
    document.getElementById('video-contrast').value = parseInt(contrast);
    document.getElementById('video-contrast-val').textContent = contrast;

    const sat = await getProperty('saturation', '0');
    document.getElementById('video-saturation').value = parseInt(sat);
    document.getElementById('video-saturation-val').textContent = sat;

    const gamma = await getProperty('gamma', '0');
    document.getElementById('video-gamma').value = parseInt(gamma);
    document.getElementById('video-gamma-val').textContent = gamma;

    // Aspect & zoom/pan
    const aspect = await getProperty('video-aspect-override', 'no');
    document.getElementById('video-aspect').value = aspect;

    const rotate = await getProperty('video-rotate', '0');
    document.getElementById('video-rotate').value = rotate;

    const zoom = await getProperty('video-zoom', '1.0');
    document.getElementById('video-zoom').value = parseFloat(zoom);
    document.getElementById('video-zoom-val').textContent = `${parseFloat(zoom).toFixed(1)}x`;

    const panX = await getProperty('video-pan-x', '0.0');
    document.getElementById('video-pan-x').value = parseFloat(panX);
    document.getElementById('video-pan-x-val').textContent = parseFloat(panX).toFixed(2);

    const panY = await getProperty('video-pan-y', '0.0');
    document.getElementById('video-pan-y').value = parseFloat(panY);
    document.getElementById('video-pan-y-val').textContent = parseFloat(panY).toFixed(2);

    // Video Filters (vf)
    const vfStr = await getProperty('vf', '');
    document.getElementById('vf-deinterlace').checked = await getProperty('deinterlace', 'no') === 'yes';
    document.getElementById('vf-deband').checked = await getProperty('deband', 'no') === 'yes';
    document.getElementById('vf-denoise').checked = vfStr.includes('hqdn3d');
    document.getElementById('vf-sharpen').checked = vfStr.includes('unsharp');
    document.getElementById('vf-vignette').checked = vfStr.includes('vignette');
    document.getElementById('vf-greyscale').checked = vfStr.includes('format=gray');
    document.getElementById('vf-negative').checked = vfStr.includes('negate');
    document.getElementById('vf-blur').checked = vfStr.includes('boxblur');
    document.getElementById('vf-sepia').checked = vfStr.includes('colorchannelmixer');
    document.getElementById('vf-night').checked = vfStr.includes('eq=gamma_b');

    // --- Subtitles General ---
    const subPos = await getProperty('sub-pos', '100');
    const hasSubPos = await getProperty('sub-pos', '') !== '';
    document.getElementById('sub-override-pos').checked = hasSubPos && subPos !== '100';
    document.getElementById('sub-pos-v').value = parseInt(subPos);
    document.getElementById('sub-pos-h').value = 50; // default horizontal centering
    
    // Sub pictures buffer
    const subBuffer = await getProperty('sub-margin-y', '36'); // placeholder or margin
    // Max texture resolution
    // Animate options
    const subDelayStep = localStorage.getItem('sub-delay-step') || '500';
    document.getElementById('sub-delay-step').value = subDelayStep;

    // --- Subtitles Default Style ---
    const subFont = await getProperty('sub-font', 'Calibri');
    document.getElementById('style-font').value = subFont;

    const subSpacing = await getProperty('sub-spacing', '0.0');
    document.getElementById('style-spacing').value = parseFloat(subSpacing);

    const subBorder = await getProperty('sub-border-size', '2.0');
    document.getElementById('style-border-width').value = parseFloat(subBorder);

    const subShadow = await getProperty('sub-shadow-offset', '3.0');
    document.getElementById('style-shadow-width').value = parseFloat(subShadow);

    const subScaleX = await getProperty('sub-scale-x', '100');
    document.getElementById('style-scale-x').value = parseInt(subScaleX);
    const subScaleY = await getProperty('sub-scale-y', '100');
    document.getElementById('style-scale-y').value = parseInt(subScaleY);

    const subBox = await getProperty('sub-box', 'no');
    document.getElementById('border-opaque-box').checked = subBox === 'yes';
    document.getElementById('border-outline').checked = subBox !== 'yes';

    const subAss = await getProperty('sub-ass', 'yes');
    document.getElementById('style-libass').checked = subAss === 'yes';

    // Alignment
    const subAlign = await getProperty('sub-align', '2');
    const alignRadio = document.getElementById(`align-${subAlign}`);
    if (alignRadio) alignRadio.checked = true;

    // Margins
    document.getElementById('style-margin-l').value = await getProperty('sub-margin-x', '20');
    document.getElementById('style-margin-r').value = await getProperty('sub-margin-x', '20');
    document.getElementById('style-margin-t').value = await getProperty('sub-margin-y', '20');
    document.getElementById('style-margin-b').value = await getProperty('sub-margin-y', '20');

    // Subtitle Colors
    const primaryInfo = parseMpvColor(await getProperty('sub-color', '#FFFFFFFF'));
    document.getElementById('style-color-pri').value = primaryInfo.color;
    document.getElementById('style-alpha-pri').value = primaryInfo.opacity;
    document.getElementById('style-alpha-pri-txt').textContent = `${primaryInfo.opacity}%`;

    const secondaryInfo = parseMpvColor(await getProperty('sub-color', '#FFFF00FF')); // secondary color
    document.getElementById('style-color-sec').value = secondaryInfo.color;
    document.getElementById('style-alpha-sec').value = secondaryInfo.opacity;
    document.getElementById('style-alpha-sec-txt').textContent = `${secondaryInfo.opacity}%`;

    const borderInfo = parseMpvColor(await getProperty('sub-border-color', '#000000FF'));
    document.getElementById('style-color-out').value = borderInfo.color;
    document.getElementById('style-alpha-out').value = borderInfo.opacity;
    document.getElementById('style-alpha-out-txt').textContent = `${borderInfo.opacity}%`;

    const shadowInfo = parseMpvColor(await getProperty('sub-shadow-color', '#00000080'));
    document.getElementById('style-color-sha').value = shadowInfo.color;
    document.getElementById('style-alpha-sha').value = shadowInfo.opacity;
    document.getElementById('style-alpha-sha-txt').textContent = `${shadowInfo.opacity}%`;

    // Misc
    const slang = await getProperty('slang', 'auto');
    document.getElementById('play-remember-speed').checked = localStorage.getItem('play-remember-speed') === 'true';

    // Position overrides style toggle
    togglePosInputs();
  } catch (e) {
    console.error('Error loading options:', e);
  }
}

// ── UI Interactions ──────────────────────────────────────────
// Volume slider
const volSlider = document.getElementById('audio-volume');
const volDisplay = document.getElementById('audio-volume-display');
volSlider.addEventListener('input', () => {
  volDisplay.textContent = `${volSlider.value}%`;
});

// Cut-off frequency slider
const cutoffSlider = document.getElementById('audio-crossfeed-cutoff');
const cutoffDisplay = document.getElementById('audio-crossfeed-cutoff-val');
cutoffSlider.addEventListener('input', () => {
  cutoffDisplay.textContent = `${cutoffSlider.value} Hz`;
});

// Feed level slider
const feedSlider = document.getElementById('audio-crossfeed-level');
const feedDisplay = document.getElementById('audio-crossfeed-level-val');
feedSlider.addEventListener('input', () => {
  feedDisplay.textContent = `${parseFloat(feedSlider.value).toFixed(1)} dB`;
});

// Boost slider
const boostSlider = document.getElementById('audio-boost');
const boostDisplay = document.getElementById('audio-boost-val');
boostSlider.addEventListener('input', () => {
  boostDisplay.textContent = `${boostSlider.value} dB`;
});

// Colors alpha sliders
const alphas = ['pri', 'sec', 'out', 'sha'];
alphas.forEach(id => {
  const slider = document.getElementById(`style-alpha-${id}`);
  const display = document.getElementById(`style-alpha-${id}-txt`);
  slider.addEventListener('input', () => {
    display.textContent = `${slider.value}%`;
  });
});

// Color picker inputs hex mirrors (quick-updates)
const colorPickers = ['style-color-pri', 'style-color-sec', 'style-color-out', 'style-color-sha'];
// Image-adjustments displays
const videoSliders = ['brightness', 'contrast', 'saturation', 'gamma'];
videoSliders.forEach(id => {
  const slider = document.getElementById(`video-${id}`);
  const valDisp = document.getElementById(`video-${id}-val`);
  slider.addEventListener('input', () => {
    valDisp.textContent = slider.value;
  });
});

// Zoom & Pan Displays
const zoomSlider = document.getElementById('video-zoom');
const zoomVal = document.getElementById('video-zoom-val');
zoomSlider.addEventListener('input', () => {
  zoomVal.textContent = `${parseFloat(zoomSlider.value).toFixed(1)}x`;
});

const panXSlider = document.getElementById('video-pan-x');
const panXVal = document.getElementById('video-pan-x-val');
panXSlider.addEventListener('input', () => {
  panXVal.textContent = parseFloat(panXSlider.value).toFixed(2);
});

const panYSlider = document.getElementById('video-pan-y');
const panYVal = document.getElementById('video-pan-y-val');
panYSlider.addEventListener('input', () => {
  panYVal.textContent = parseFloat(panYSlider.value).toFixed(2);
});

// Crossfeed Presets
document.getElementById('btn-crossfeed-moy').addEventListener('click', () => {
  cutoffSlider.value = 700;
  cutoffDisplay.textContent = '700 Hz';
  feedSlider.value = 6.0;
  feedDisplay.textContent = '6.0 dB';
});
document.getElementById('btn-crossfeed-meier').addEventListener('click', () => {
  cutoffSlider.value = 650;
  cutoffDisplay.textContent = '650 Hz';
  feedSlider.value = 9.5;
  feedDisplay.textContent = '9.5 dB';
});

// Autoload reset
document.getElementById('btn-autoload-reset').addEventListener('click', () => {
  document.getElementById('misc-autoload').value = '.\\subtitles;.\\subs';
});

// Placement override toggle
const overridePosCheck = document.getElementById('sub-override-pos');
const posInputsContainer = document.querySelector('.pos-override-inputs');
overridePosCheck.addEventListener('change', togglePosInputs);

function togglePosInputs() {
  if (overridePosCheck.checked) {
    posInputsContainer.classList.remove('disabled-style');
  } else {
    posInputsContainer.classList.add('disabled-style');
  }
}

// ── Save & Apply Logic ────────────────────────────────────────
async function applySettings() {
  try {
    const setProp = async (name, value) => {
      try {
        await invoke('set_mpv_property', { name, value: value.toString() });
      } catch (e) {
        console.error(`Error setting property ${name} to ${value}:`, e);
      }
    };

    // --- Save Local Settings ---
    localStorage.setItem('play-resume', document.getElementById('play-resume').checked.toString());
    localStorage.setItem('play-pause-minimize', document.getElementById('play-pause-minimize').checked.toString());
    localStorage.setItem('play-auto-next', document.getElementById('play-auto-next').checked.toString());
    localStorage.setItem('play-remember-speed', document.getElementById('play-remember-speed').checked.toString());
    
    const forwardSec = document.getElementById('play-seek-forward').value;
    const backwardSec = document.getElementById('play-seek-backward').value;
    localStorage.setItem('play-seek-forward', forwardSec);
    localStorage.setItem('play-seek-backward', backwardSec);

    const stepMs = document.getElementById('sub-delay-step').value;
    localStorage.setItem('sub-delay-step', stepMs);

    // --- Set MPV Properties ---
    // Playback
    const speed = document.getElementById('play-default-speed').value;
    await setProp('speed', speed);

    const loop = document.getElementById('play-loop-mode').value;
    await setProp('loop-file', loop);

    // Audio
    const vol = document.getElementById('audio-volume').value;
    await setProp('volume', vol);

    const channels = document.getElementById('audio-channels').value;
    await setProp('ad-channels', channels);

    const maxAmp = document.getElementById('audio-max-amp').value;
    await setProp('volume-max', maxAmp);

    const dev = document.getElementById('audio-device').value;
    await setProp('audio-device', dev);

    // Audio Time Shift (Delay)
    const delayEnable = document.getElementById('audio-delay-enable').checked;
    const delayMs = parseInt(document.getElementById('audio-delay-ms').value) || 0;
    const delaySec = delayEnable ? (delayMs / 1000.0).toString() : '0.0';
    await setProp('audio-delay', delaySec);

    // Audio Filter Chain
    let afFilters = [];
    if (document.getElementById('audio-crossfeed').checked) {
      const cutoff = cutoffSlider.value;
      const level = feedSlider.value;
      afFilters.push(`lavfi=[bs2b=f=${cutoff}:d=${level}]`);
    }
    if (document.getElementById('audio-normalize').checked) {
      afFilters.push('lavfi=[dynaudnorm]');
    }
    const boostVal = boostSlider.value;
    if (parseInt(boostVal) > 0) {
      afFilters.push(`volume=volume=${boostVal}dB`);
    }
    await setProp('af', afFilters.join(','));

    // Video Renderer & VSync
    // NOTE: 'vo' (video output driver) cannot be changed at runtime when mpv is embedded
    // via the wid/HWND approach — doing so causes mpv to detach from the window and blank
    // the video output. It is set once at startup in mpv.rs.
    const hwdec = document.getElementById('video-hwdec').value;

    const sync = document.getElementById('video-sync').value;
    await setProp('video-sync', sync);

    // Color adjust
    await setProp('brightness', document.getElementById('video-brightness').value);
    await setProp('contrast', document.getElementById('video-contrast').value);
    await setProp('saturation', document.getElementById('video-saturation').value);
    await setProp('gamma', document.getElementById('video-gamma').value);

    // Aspect & zoom/pan
    const aspect = document.getElementById('video-aspect').value;
    await setProp('video-aspect-override', aspect);

    const rotate = document.getElementById('video-rotate').value;
    await setProp('video-rotate', rotate);

    await setProp('video-zoom', document.getElementById('video-zoom').value);
    await setProp('video-pan-x', document.getElementById('video-pan-x').value);
    await setProp('video-pan-y', document.getElementById('video-pan-y').value);

    // Video Filter Chain
    let vfFilters = [];
    const deinterlace = document.getElementById('vf-deinterlace').checked ? 'yes' : 'no';
    await setProp('deinterlace', deinterlace);
    const deband = document.getElementById('vf-deband').checked ? 'yes' : 'no';
    await setProp('deband', deband);

    if (document.getElementById('vf-denoise').checked) vfFilters.push('lavfi=[hqdn3d]');
    if (document.getElementById('vf-sharpen').checked) vfFilters.push('lavfi=[unsharp]');
    if (document.getElementById('vf-vignette').checked) vfFilters.push('lavfi=[vignette]');
    if (document.getElementById('vf-greyscale').checked) vfFilters.push('format=gray');
    if (document.getElementById('vf-negative').checked) vfFilters.push('lavfi=[negate]');
    if (document.getElementById('vf-blur').checked) vfFilters.push('lavfi=[boxblur]');
    if (document.getElementById('vf-sepia').checked) {
      vfFilters.push('lavfi=[colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131]');
    }
    if (document.getElementById('vf-night').checked) {
      vfFilters.push('lavfi=[eq=gamma_b=0.8:gamma_r=1.1]');
    }
    await setProp('vf', vfFilters.join(','));

    // Automatically manage hardware decoding (hwdec):
    // Disable hwdec (set to 'no') if custom video filters are active or rotation is non-zero,
    // as mpv requires software decoding path to apply custom libavfilter chains or video rotation in windowed mode.
    if (vfFilters.length > 0 || rotate !== '0') {
      await setProp('hwdec', 'no');
    } else {
      await setProp('hwdec', hwdec);
    }

    // Subtitles Placement Override
    if (overridePosCheck.checked) {
      const vMargin = document.getElementById('sub-pos-v').value;
      await setProp('sub-pos', vMargin);
    } else {
      await setProp('sub-pos', '100'); // reset
    }

    // Subtitles Styling
    const subFont = document.getElementById('style-font').value;
    await setProp('sub-font', subFont);

    const subSpacing = document.getElementById('style-spacing').value;
    await setProp('sub-spacing', subSpacing);

    const subBorder = document.getElementById('style-border-width').value;
    await setProp('sub-border-size', subBorder);

    const subShadow = document.getElementById('style-shadow-width').value;
    await setProp('sub-shadow-offset', subShadow);

    const scaleX = document.getElementById('style-scale-x').value;
    await setProp('sub-scale-x', scaleX);
    const scaleY = document.getElementById('style-scale-y').value;
    await setProp('sub-scale-y', scaleY);

    const useBox = document.getElementById('border-opaque-box').checked ? 'yes' : 'no';
    await setProp('sub-box', useBox);

    const useLibass = document.getElementById('style-libass').checked ? 'yes' : 'no';
    await setProp('sub-ass', useLibass);

    // Selected Alignment Dot
    const checkedAlign = document.querySelector('input[name="align-dot"]:checked');
    if (checkedAlign) {
      await setProp('sub-align', checkedAlign.value);
    }

    // Margins (we apply bottom margin to sub-margin-y, and left margin to sub-margin-x)
    const marginB = document.getElementById('style-margin-b').value;
    await setProp('sub-margin-y', marginB);
    const marginL = document.getElementById('style-margin-l').value;
    await setProp('sub-margin-x', marginL);

    // Colors & Opacity
    const colorPri = toMpvColor(
      document.getElementById('style-color-pri').value,
      document.getElementById('style-alpha-pri').value
    );
    await setProp('sub-color', colorPri);

    const colorSec = toMpvColor(
      document.getElementById('style-color-sec').value,
      document.getElementById('style-alpha-sec').value
    );
    // Note: secondary color is set to sub-color? Wait, mpv has no secondary color property directly except via ASS. 
    // Mpv default subtitle outline/shadow color:
    const colorOut = toMpvColor(
      document.getElementById('style-color-out').value,
      document.getElementById('style-alpha-out').value
    );
    await setProp('sub-border-color', colorOut);

    const colorSha = toMpvColor(
      document.getElementById('style-color-sha').value,
      document.getElementById('style-alpha-sha').value
    );
    await setProp('sub-shadow-color', colorSha);

    // Subtitle Autoload Paths
    const autoload = document.getElementById('misc-autoload').value;
    await setProp('sub-auto', autoload);

    // Emit event back to main window
    await emit('options-changed', { timestamp: Date.now() });
    console.log('Preferences applied successfully');
  } catch (e) {
    console.error('Error applying settings:', e);
  }
}

// Mirror triggers
document.getElementById('btn-mirror-h').addEventListener('click', async () => {
  try {
    const vfStr = await invoke('get_mpv_property', { name: 'vf' });
    let vfFilters = vfStr ? vfStr.split(',').filter(f => f.trim().length > 0) : [];
    if (vfFilters.includes('hflip')) {
      vfFilters = vfFilters.filter(f => f !== 'hflip');
    } else {
      vfFilters.push('hflip');
    }
    await invoke('set_mpv_property', { name: 'vf', value: vfFilters.join(',') });
  } catch (e) {
    console.error(e);
  }
});

document.getElementById('btn-mirror-v').addEventListener('click', async () => {
  try {
    const vfStr = await invoke('get_mpv_property', { name: 'vf' });
    let vfFilters = vfStr ? vfStr.split(',').filter(f => f.trim().length > 0) : [];
    if (vfFilters.includes('vflip')) {
      vfFilters = vfFilters.filter(f => f !== 'vflip');
    } else {
      vfFilters.push('vflip');
    }
    await invoke('set_mpv_property', { name: 'vf', value: vfFilters.join(',') });
  } catch (e) {
    console.error(e);
  }
});

// OK / Cancel / Apply hooks
document.getElementById('btn-apply').addEventListener('click', applySettings);

document.getElementById('btn-ok').addEventListener('click', async () => {
  await applySettings();
  getCurrentWindow().close();
});

document.getElementById('btn-cancel').addEventListener('click', () => {
  getCurrentWindow().close();
});

// Load on launch
document.addEventListener('DOMContentLoaded', loadSettings);
