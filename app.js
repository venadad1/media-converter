// =====================================================
// CLIPFORGE — Main App
// Uses ffmpeg.wasm 0.11.x (stable, proven WebAssembly)
// CDN: jsdelivr (more reliable than unpkg for WASM)
// =====================================================

// ffmpeg.wasm 0.11.x — stable API, works as UMD global. Multi-thread core (fast,
// requires SharedArrayBuffer via COOP/COEP — provided by sw.js / netlify.toml / vercel.json).
const FFMPEG_JS_URL      = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.11.6/dist/ffmpeg.min.js';
const FFMPEG_CORE_URL_MT = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js';

let ffmpeg = null;
let ffmpegLoaded = false;
let videoFile = null;
let videoDuration = 0;
let trimStart = 0;
let trimEnd = 0;
let cropEnabled = false;
let cropRatio = 'free';
let cropBox = { x: 0, y: 0, w: 0, h: 0 };
let selectedQuality = 'medium';

const QUALITY_PRESETS = {
  low:    { crf: '28', preset: 'ultrafast' },
  medium: { crf: '23', preset: 'fast' },
  high:   { crf: '18', preset: 'slow' },
};

// ── IN-APP BROWSER DETECTION ──────────────────────────
// Messenger, Instagram, Facebook, and TikTok in-app WebViews use a stripped-down
// rendering engine that frequently throttles or kills Web Workers and WASM memory
// allocation in the background — which is exactly what ffmpeg.wasm needs to run.
// Exporting on these can silently hang at 0% forever. We detect them and steer
// people to open the page in their real browser, where everything works.
function detectInAppBrowser() {
  const ua = navigator.userAgent || '';
  const isFBAN  = /FBAN|FBAV|FB_IAB|FBIOS/i.test(ua);          // Facebook app
  const isMessenger = /MESSENGER/i.test(ua);                    // Messenger app
  const isInstagram = /Instagram/i.test(ua);                    // Instagram app
  const isLine = /\bLine\//i.test(ua);
  const isTikTok = /BytedanceWebview|TikTok/i.test(ua);
  const isWeChat = /MicroMessenger/i.test(ua);
  return isFBAN || isMessenger || isInstagram || isLine || isTikTok || isWeChat;
}

function showInAppBrowserWarning() {
  const banner = document.createElement('div');
  banner.className = 'inapp-warning';
  banner.innerHTML = `
    <div class="inapp-warning-inner">
      <span class="inapp-warning-icon">⚠️</span>
      <div class="inapp-warning-text">
        <strong>Heads up:</strong> you're viewing ClipForge inside an app's built-in browser
        (Messenger, Instagram, etc). Video export can hang or fail here due to that browser's
        limitations. For a reliable export, open this page in Chrome or Safari.
      </div>
      <button class="inapp-warning-btn" id="openInBrowserBtn">Open in Browser</button>
      <button class="inapp-warning-close" id="closeInAppWarning" aria-label="Dismiss">×</button>
    </div>
  `;
  document.body.insertBefore(banner, document.body.firstChild);

  document.getElementById('closeInAppWarning')?.addEventListener('click', () => banner.remove());
  document.getElementById('openInBrowserBtn')?.addEventListener('click', () => {
    const url = window.location.href;
    const ua = navigator.userAgent || '';
    if (/android/i.test(ua)) {
      // Android intent URL forces opening in the default browser (usually Chrome)
      const intentUrl = `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;action=android.intent.action.VIEW;end`;
      window.location.href = intentUrl;
    } else {
      // iOS in-app browsers generally respect target=_blank / window.open for Safari
      window.open(url, '_blank');
    }
  });
}

if (detectInAppBrowser()) {
  // Run after DOM is ready since this script may load before <body> finishes parsing
  if (document.body) showInAppBrowserWarning();
  else document.addEventListener('DOMContentLoaded', showInAppBrowserWarning);
}

// ── HANDOFF: pick up a file passed from the landing page (/) ──────
// If the user dropped/chose a video on the homepage, it was stashed
// in IndexedDB (see js/handoff.js) and we auto-load it here so the
// flow feels the same as before the two pages were split.
(async function pickUpHandoffFile() {
  if (typeof cfTakeFile !== 'function') return; // handoff.js not loaded, skip silently
  try {
    const file = await cfTakeFile();
    if (file) loadVideo(file);
  } catch (e) {
    console.warn('[ClipForge] no handoff file to pick up', e);
  }
})();

// ── DOM REFS ──────────────────────────────────────────
const uploadZone      = document.getElementById('uploadZone');
const fileInput       = document.getElementById('fileInput');
const uploadSection   = document.getElementById('uploadSection');
const editorSection   = document.getElementById('editorSection');
const heroBadge       = document.getElementById('heroBadge');
const videoPlayer     = document.getElementById('videoPlayer');
const playBtn         = document.getElementById('playBtn');
const playIcon        = document.getElementById('playIcon');
const pauseIcon       = document.getElementById('pauseIcon');
const seekSlider      = document.getElementById('seekSlider');
const seekProgress    = document.getElementById('seekProgress');
const timeDisplay     = document.getElementById('timeDisplay');
const fileBadge       = document.getElementById('fileBadge');
const changeFileBtn   = document.getElementById('changeFileBtn');
const ffmpegOverlay   = document.getElementById('ffmpegOverlay');
const ffmpegStatus    = document.getElementById('ffmpegStatus');
const ffmpegProgressEl= document.getElementById('ffmpegProgress');
const exportPanel     = document.getElementById('exportPanel');
const progressBar     = document.getElementById('progressBar');
const exportPct       = document.getElementById('exportPct');
const exportLog       = document.getElementById('exportLog');
const exportBtn       = document.getElementById('exportBtn');
const mobileToggle    = document.getElementById('mobileToggle');
const mobileMenu      = document.getElementById('mobileMenu');

const startInput      = document.getElementById('startInput');
const endInput        = document.getElementById('endInput');
const trimDuration    = document.getElementById('trimDuration');
const trimTimeline    = document.getElementById('trimTimeline');
const trimStartThumb  = document.getElementById('trimStart');
const trimEndThumb    = document.getElementById('trimEnd');
const trimRange       = document.getElementById('trimRange');
const trimPlayhead    = document.getElementById('trimPlayhead');
const previewTrimBtn  = document.getElementById('previewTrimBtn');

const cropToggle      = document.getElementById('cropToggle');
const cropControls    = document.getElementById('cropControls');
const cropOverlayEl   = document.getElementById('cropOverlay');
const cropBoxEl       = document.getElementById('cropBox');
const cropShadeTop    = document.getElementById('cropShadeTop');
const cropShadeBottom = document.getElementById('cropShadeBottom');
const cropShadeLeft   = document.getElementById('cropShadeLeft');
const cropShadeRight  = document.getElementById('cropShadeRight');
const cropXInput      = document.getElementById('cropX');
const cropYInput      = document.getElementById('cropY');
const cropWInput      = document.getElementById('cropW');
const cropHInput      = document.getElementById('cropH');
const resetCropBtn    = document.getElementById('resetCropBtn');

const filenameInput   = document.getElementById('filenameInput');
const summaryTrim     = document.getElementById('summaryTrim');
const summaryCrop     = document.getElementById('summaryCrop');
const summaryTime     = document.getElementById('summaryTime');

// ── WAVEFORM ──────────────────────────────────────────
(function buildWaveform() {
  const bars = document.getElementById('waveformBars');
  if (!bars) return;
  for (let i = 0; i < 60; i++) {
    const bar = document.createElement('div');
    bar.className = 'waveform-bar';
    bar.style.setProperty('--dur', (0.8 + Math.random() * 0.8) + 's');
    bar.style.setProperty('--delay', (Math.random() * -1.5) + 's');
    bar.style.minHeight = (20 + Math.random() * 80) + '%';
    bar.style.transformOrigin = 'bottom center';
    bars.appendChild(bar);
  }
})();

// ── MOBILE NAV ────────────────────────────────────────
mobileToggle?.addEventListener('click', () => mobileMenu.classList.toggle('open'));

// ── DRAG & DROP ───────────────────────────────────────
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer?.files?.[0];
  if (file && file.type.startsWith('video/')) loadVideo(file);
});
uploadZone.addEventListener('click', e => { if (!e.target.closest('.upload-btn')) fileInput.click(); });
fileInput.addEventListener('change', () => { if (fileInput.files[0]) loadVideo(fileInput.files[0]); });
changeFileBtn?.addEventListener('click', () => {
  editorSection.classList.add('hidden');
  uploadSection.classList.remove('hidden');
  heroBadge.classList.remove('hidden');
  videoPlayer.src = '';
  videoFile = null;
  exportPanel.classList.add('hidden');
});

// ── LOAD VIDEO ────────────────────────────────────────
function loadVideo(file) {
  videoFile = file;
  videoPlayer.src = URL.createObjectURL(file);
  videoPlayer.onloadedmetadata = () => {
    videoDuration = videoPlayer.duration;
    trimStart = 0;
    trimEnd = videoDuration;
    startInput.value = fmt(0);
    endInput.value = fmt(videoDuration);
    fileBadge.textContent = file.name;
    uploadSection.classList.add('hidden');
    heroBadge.classList.add('hidden');
    editorSection.classList.remove('hidden');
    exportPanel.classList.add('hidden');
    initCrop();
    updateTrimUI();
    updateExportSummary();
  };
}

// ── PLAYBACK ─────────────────────────────────────────
function fmt(s) {
  s = Math.max(0, s || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec}`;
  return `${m}:${sec}`;
}
// Parses "MM:SS", "H:MM:SS", or a plain number of seconds back into seconds
function parseTime(str) {
  if (str == null) return NaN;
  str = String(str).trim();
  if (str === '') return NaN;
  if (str.includes(':')) {
    const parts = str.split(':').map(p => parseFloat(p));
    if (parts.some(isNaN)) return NaN;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return NaN;
  }
  const n = parseFloat(str);
  return isNaN(n) ? NaN : n;
}
videoPlayer.addEventListener('timeupdate', () => {
  if (!videoDuration) return;
  const p = (videoPlayer.currentTime / videoDuration) * 100;
  seekProgress.style.width = p + '%';
  seekSlider.value = p;
  trimPlayhead.style.left = p + '%';
  timeDisplay.textContent = `${fmt(videoPlayer.currentTime)} / ${fmt(videoDuration)}`;
});
videoPlayer.addEventListener('play',  () => { playIcon.classList.add('hidden'); pauseIcon.classList.remove('hidden'); });
videoPlayer.addEventListener('pause', () => { playIcon.classList.remove('hidden'); pauseIcon.classList.add('hidden'); });
videoPlayer.addEventListener('ended', () => { playIcon.classList.remove('hidden'); pauseIcon.classList.add('hidden'); });

playBtn.addEventListener('click', () => videoPlayer.paused ? videoPlayer.play() : videoPlayer.pause());
seekSlider.addEventListener('input', () => {
  if (videoDuration) videoPlayer.currentTime = (seekSlider.value / 100) * videoDuration;
});

// ── TABS ──────────────────────────────────────────────
document.querySelectorAll('.tool-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tool-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.remove('hidden');
  });
});

// ── TRIM ──────────────────────────────────────────────
function clampTrimStart(v) { return Math.max(0, Math.min(v, trimEnd - 0.1)); }
function clampTrimEnd(v)   { return Math.min(videoDuration, Math.max(v, trimStart + 0.1)); }

function updateTrimUI() {
  if (!videoDuration) return;
  const s = (trimStart / videoDuration) * 100;
  const e = (trimEnd   / videoDuration) * 100;
  trimStartThumb.style.left = s + '%';
  trimEndThumb.style.left   = e + '%';
  trimRange.style.left  = s + '%';
  trimRange.style.width = (e - s) + '%';
  trimDuration.textContent  = fmt(trimEnd - trimStart);
  startInput.value = fmt(trimStart);
  endInput.value   = fmt(trimEnd);
  updateTrimSummary();
}

function commitStartInput() {
  const parsed = parseTime(startInput.value);
  trimStart = clampTrimStart(isNaN(parsed) ? trimStart : parsed);
  updateTrimUI();
}
function commitEndInput() {
  const parsed = parseTime(endInput.value);
  trimEnd = clampTrimEnd(isNaN(parsed) ? trimEnd : parsed);
  updateTrimUI();
}
startInput.addEventListener('change', commitStartInput);
startInput.addEventListener('blur', commitStartInput);
startInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commitStartInput(); startInput.blur(); } });

endInput.addEventListener('change', commitEndInput);
endInput.addEventListener('blur', commitEndInput);
endInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commitEndInput(); endInput.blur(); } });

previewTrimBtn.addEventListener('click', () => {
  videoPlayer.currentTime = trimStart;
  videoPlayer.play();
  const check = () => {
    if (videoPlayer.currentTime >= trimEnd) { videoPlayer.pause(); videoPlayer.removeEventListener('timeupdate', check); }
  };
  videoPlayer.addEventListener('timeupdate', check);
});

// Drag trim thumbs
function makeDraggable(thumb, isStart) {
  const startDrag = e => {
    e.preventDefault?.();
    const move = ev => {
      const cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
      const rect = trimTimeline.getBoundingClientRect();
      const pct  = Math.max(0, Math.min(1, (cx - rect.left) / rect.width));
      if (isStart) trimStart = clampTrimStart(pct * videoDuration);
      else         trimEnd   = clampTrimEnd(pct * videoDuration);
      updateTrimUI();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', up);
  };
  thumb.addEventListener('mousedown', startDrag);
  thumb.addEventListener('touchstart', startDrag, { passive: false });
}
makeDraggable(trimStartThumb, true);
makeDraggable(trimEndThumb, false);

// ── CROP ──────────────────────────────────────────────
function initCrop() {
  const vw = videoPlayer.videoWidth  || 1920;
  const vh = videoPlayer.videoHeight || 1080;
  cropBox = { x: 0, y: 0, w: vw, h: vh };
  updateCropInputs();
  renderCropBox();
}

cropToggle.addEventListener('change', () => {
  cropEnabled = cropToggle.checked;
  if (cropEnabled) {
    cropOverlayEl.classList.remove('hidden');
    cropOverlayEl.classList.add('active');
    cropControls.style.opacity = '1';
    cropControls.style.pointerEvents = 'auto';
  } else {
    cropOverlayEl.classList.add('hidden');
    cropOverlayEl.classList.remove('active');
    cropControls.style.opacity = '0.4';
    cropControls.style.pointerEvents = 'none';
  }
  updateCropSummary();
});

document.querySelectorAll('.aspect-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.aspect-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    cropRatio = btn.dataset.ratio;
    if (cropRatio !== 'free') applyAspectRatio(cropRatio);
  });
});

function applyAspectRatio(ratio) {
  const [rw, rh] = ratio.split(':').map(Number);
  const vw = videoPlayer.videoWidth  || 1920;
  const vh = videoPlayer.videoHeight || 1080;
  let w = vw, h = Math.round(w * rh / rw);
  if (h > vh) { h = vh; w = Math.round(h * rw / rh); }
  cropBox = { x: Math.round((vw - w) / 2), y: Math.round((vh - h) / 2), w, h };
  updateCropInputs(); renderCropBox();
}

function updateCropInputs() {
  cropXInput.value = Math.round(cropBox.x);
  cropYInput.value = Math.round(cropBox.y);
  cropWInput.value = Math.round(cropBox.w);
  cropHInput.value = Math.round(cropBox.h);
}

[cropXInput, cropYInput, cropWInput, cropHInput].forEach(inp => {
  inp.addEventListener('input', () => {
    cropBox = {
      x: parseInt(cropXInput.value) || 0,
      y: parseInt(cropYInput.value) || 0,
      w: parseInt(cropWInput.value) || 100,
      h: parseInt(cropHInput.value) || 100,
    };
    renderCropBox(); updateCropSummary();
  });
});

resetCropBtn.addEventListener('click', initCrop);

function renderCropBox() {
  const wrap = document.getElementById('videoWrap');
  const dw = wrap.offsetWidth, dh = wrap.offsetHeight;
  const vw = videoPlayer.videoWidth  || 1920;
  const vh = videoPlayer.videoHeight || 1080;

  // Account for letterboxing (object-fit: contain)
  const videoAR = vw / vh, wrapAR = dw / dh;
  let renderW, renderH, offsetX = 0, offsetY = 0;
  if (videoAR > wrapAR) { renderW = dw; renderH = dw / videoAR; offsetY = (dh - renderH) / 2; }
  else                  { renderH = dh; renderW = dh * videoAR; offsetX = (dw - renderW) / 2; }

  const sx = renderW / vw, sy = renderH / vh;
  const rx = offsetX + cropBox.x * sx;
  const ry = offsetY + cropBox.y * sy;
  const rw = cropBox.w * sx;
  const rh = cropBox.h * sy;

  cropBoxEl.style.cssText = `left:${rx}px;top:${ry}px;width:${rw}px;height:${rh}px`;
  cropShadeTop.style.cssText    = `height:${ry}px`;
  cropShadeBottom.style.cssText = `height:${dh - ry - rh}px`;
  cropShadeLeft.style.cssText   = `width:${rx}px;top:${ry}px;height:${rh}px`;
  cropShadeRight.style.cssText  = `width:${dw - rx - rw}px;top:${ry}px;height:${rh}px`;
  updateCropInputs(); updateCropSummary();
}

// Helper: extract clientX/clientY from either a mouse or touch event
function getPointer(e) {
  if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  if (e.changedTouches && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

// Crop box drag
function startCropBoxDrag(e) {
  if (e.target !== cropBoxEl && !e.target.classList.contains('crop-crosshair') &&
      !e.target.classList.contains('crop-rule-v') && !e.target.classList.contains('crop-rule-h')) return;
  e.preventDefault();
  const p0 = getPointer(e);
  const ox = cropBox.x, oy = cropBox.y;
  const vw = videoPlayer.videoWidth || 1920, vh = videoPlayer.videoHeight || 1080;
  const wrap = document.getElementById('videoWrap');
  const dw = wrap.offsetWidth, dh = wrap.offsetHeight;
  const videoAR = vw / vh, wrapAR = dw / dh;
  let renderW, renderH;
  if (videoAR > wrapAR) { renderW = dw; renderH = dw / videoAR; }
  else                  { renderH = dh; renderW = dh * videoAR; }
  const scaleX = vw / renderW, scaleY = vh / renderH;
  const move = ev => {
    ev.preventDefault();
    const p = getPointer(ev);
    cropBox.x = Math.max(0, Math.min(vw - cropBox.w, ox + (p.x - p0.x) * scaleX));
    cropBox.y = Math.max(0, Math.min(vh - cropBox.h, oy + (p.y - p0.y) * scaleY));
    renderCropBox();
  };
  const up = () => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    window.removeEventListener('touchmove', move);
    window.removeEventListener('touchend', up);
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
  window.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('touchend', up);
}
cropBoxEl.addEventListener('mousedown', startCropBoxDrag);
cropBoxEl.addEventListener('touchstart', startCropBoxDrag, { passive: false });

// Resize handles
document.querySelectorAll('.crop-handle').forEach(handle => {
  function startHandleDrag(e) {
    e.preventDefault(); e.stopPropagation();
    const h = handle.dataset.handle;
    const p0 = getPointer(e);
    const orig = { ...cropBox };
    const vw = videoPlayer.videoWidth || 1920, vh = videoPlayer.videoHeight || 1080;
    const wrap = document.getElementById('videoWrap');
    const dw = wrap.offsetWidth, dh = wrap.offsetHeight;
    const videoAR = vw / vh, wrapAR = dw / dh;
    let renderW, renderH;
    if (videoAR > wrapAR) { renderW = dw; renderH = dw / videoAR; }
    else                  { renderH = dh; renderW = dh * videoAR; }
    const scaleX = vw / renderW, scaleY = vh / renderH;
    const [rw, rh] = cropRatio !== 'free' ? cropRatio.split(':').map(Number) : [0, 0];

    const move = ev => {
      ev.preventDefault();
      const p = getPointer(ev);
      const dx = (p.x - p0.x) * scaleX;
      const dy = (p.y - p0.y) * scaleY;
      let nw = orig.w, nh = orig.h, nx = orig.x, ny = orig.y;
      if (h.includes('l')) { nx = orig.x + dx; nw = orig.w - dx; }
      if (h.includes('r') || h === 'rc') { nw = orig.w + dx; }
      if (h.includes('t') || h === 'tc') { ny = orig.y + dy; nh = orig.h - dy; }
      if (h.includes('b') || h === 'bc') { nh = orig.h + dy; }
      if (cropRatio !== 'free' && rw && rh) { nh = nw * rh / rw; }
      nw = Math.max(40, nw); nh = Math.max(40, nh);
      nx = Math.max(0, Math.min(vw - nw, nx));
      ny = Math.max(0, Math.min(vh - nh, ny));
      cropBox = { x: nx, y: ny, w: nw, h: nh };
      renderCropBox();
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', up);
  }
  handle.addEventListener('mousedown', startHandleDrag);
  handle.addEventListener('touchstart', startHandleDrag, { passive: false });
});

window.addEventListener('resize', () => { if (cropEnabled) renderCropBox(); });

// ── EXPORT SUMMARY ────────────────────────────────────
function updateTrimSummary() {
  const full = trimStart < 0.05 && Math.abs(trimEnd - videoDuration) < 0.05;
  summaryTrim.textContent = full ? 'Full video' : `${fmt(trimStart)} – ${fmt(trimEnd)}`;
  summaryTime.textContent = '~' + Math.max(5, Math.round((trimEnd - trimStart) * 1.5)) + 's';
}
function updateCropSummary() {
  summaryCrop.textContent = cropEnabled ? `${Math.round(cropBox.w)}×${Math.round(cropBox.h)}` : 'None';
}
function updateExportSummary() { updateTrimSummary(); updateCropSummary(); }

// ── QUALITY ───────────────────────────────────────────
document.querySelectorAll('.quality-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedQuality = btn.dataset.quality;
  });
});

// ── FFMPEG LOAD ───────────────────────────────────────
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function ensureFFmpeg() {
  if (ffmpegLoaded) return;

  ffmpegOverlay.classList.remove('hidden');
  setFFmpegStatus('Loading ffmpeg.wasm…', 15);

  try {
    await loadScript(FFMPEG_JS_URL);
    setFFmpegStatus('Script loaded — initializing…', 40);

    const { createFFmpeg, fetchFile } = window.FFmpeg;
    window._ffmpegFetchFile = fetchFile;

    ffmpeg = createFFmpeg({
      corePath: FFMPEG_CORE_URL_MT,
      log: true,
      logger: ({ message }) => addLog(message),
      progress: ({ ratio }) => {
        const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
        progressBar.style.width = pct + '%';
        exportPct.textContent = pct + '%';
      },
    });

    setFFmpegStatus('Loading WebAssembly core…', 60);
    await ffmpeg.load();
    setFFmpegStatus('Engine ready ✓', 100);
    ffmpegLoaded = true;
    await sleep(300);
  } catch (err) {
    const needsIsolation = typeof SharedArrayBuffer === 'undefined' || window.crossOriginIsolated !== true;
    const msg = needsIsolation
      ? 'This browser blocked the fast video engine. Try reloading the page once, or open ClipForge in Chrome/Safari directly.'
      : 'Failed: ' + err.message;
    setFFmpegStatus(msg, 0);
    throw new Error(msg);
  } finally {
    await sleep(200);
    ffmpegOverlay.classList.add('hidden');
  }
}

function setFFmpegStatus(msg, pct) {
  ffmpegStatus.textContent = msg;
  ffmpegProgressEl.style.width = pct + '%';
}

// ── EXPORT ────────────────────────────────────────────
exportBtn.addEventListener('click', handleExport);

async function handleExport() {
  if (!videoFile) return;
  exportBtn.disabled = true;
  exportPanel.classList.remove('hidden');
  exportLog.innerHTML = '';
  progressBar.style.width = '0%';
  exportPct.textContent = '0%';

  // Watchdog: if nothing happens for a while, the page is most likely stuck
  // inside an in-app browser (Messenger/Instagram/etc.) that throttled the
  // WASM worker. Tell the user plainly instead of leaving them staring at 0%.
  let sawProgress = false;
  const watchdog = setTimeout(() => {
    if (!sawProgress) {
      addLog('⚠ Export seems stuck. If you opened this page from Messenger, Instagram, or a similar app, please open it in Chrome or Safari instead — those apps\' built-in browsers often block video processing.', 'error');
    }
  }, 12000);

  try {
    await ensureFFmpeg();
    sawProgress = true;
    await runExport();
  } catch (err) {
    addLog('✗ Export failed: ' + err.message, 'error');
    console.error('[ClipForge Export Error]', err);
  } finally {
    clearTimeout(watchdog);
  }
  exportBtn.disabled = false;
}

async function runExport() {
  const { fetchFile } = window.FFmpeg;

  addLog('Reading video into memory…');
  ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(videoFile));
  addLog('File loaded into ffmpeg FS ✓');

  const filename = (filenameInput.value.trim() || 'clipforge-export') + '.mp4';
  const { crf, preset } = QUALITY_PRESETS[selectedQuality];
  const vw = videoPlayer.videoWidth  || 1920;
  const vh = videoPlayer.videoHeight || 1080;
  const fullVideo = trimStart < 0.05 && Math.abs(trimEnd - videoDuration) < 0.05;

  const args = [];

  // Input + trim (before -i is faster for seeking)
  if (!fullVideo) {
    args.push('-ss', trimStart.toFixed(3), '-to', trimEnd.toFixed(3));
  }
  args.push('-i', 'input.mp4');

  // Filters
  const filters = [];
  if (cropEnabled) {
    let cx = Math.max(0, Math.round(cropBox.x));
    let cy = Math.max(0, Math.round(cropBox.y));
    let cw = Math.min(vw - cx, Math.round(cropBox.w));
    let ch = Math.min(vh - cy, Math.round(cropBox.h));
    // H.264 requires even dimensions
    if (cw % 2 !== 0) cw -= 1;
    if (ch % 2 !== 0) ch -= 1;
    filters.push(`crop=${cw}:${ch}:${cx}:${cy}`);
    addLog(`Crop: ${cw}×${ch} at (${cx},${cy})`);
  }

  if (filters.length) {
    args.push('-vf', filters.join(','));
  }

  // Codec
  args.push('-c:v', 'libx264', '-preset', preset, '-crf', crf);
  args.push('-c:a', 'aac', '-b:a', '128k');
  args.push('-movflags', '+faststart');
  args.push('output.mp4');

  addLog('Running: ffmpeg ' + args.join(' '));

  await ffmpeg.run(...args);

  addLog('Encoding complete — reading output…');
  const data = ffmpeg.FS('readFile', 'output.mp4');
  const blob = new Blob([data.buffer], { type: 'video/mp4' });
  const url  = URL.createObjectURL(blob);

  progressBar.style.width = '100%';
  exportPct.textContent = '100%';
  addLog(`✓ Done! Downloading "${filename}"…`, 'success');

  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);

  // Cleanup FS
  try { ffmpeg.FS('unlink', 'input.mp4'); } catch(_) {}
  try { ffmpeg.FS('unlink', 'output.mp4'); } catch(_) {}
  addLog('Temporary files cleaned ✓', 'success');
}

// ── UTILS ─────────────────────────────────────────────
function addLog(msg, type = '') {
  const div = document.createElement('div');
  div.className = 'log-line' + (type ? ' ' + type : '');
  div.textContent = msg;
  exportLog.appendChild(div);
  exportLog.scrollTop = exportLog.scrollHeight;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
