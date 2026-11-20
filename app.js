'use strict';
(function () {
  // ===================================================================
  // helpers
  // ===================================================================
  const $ = (s) => document.querySelector(s);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isArabic = (s) => /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(s || '');
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

  const IDLE_GUEST_MS = 90 * 1000;     // camera / message screen -> back to welcome
  const IDLE_ADMIN_MS = 3 * 60 * 1000; // admin screen -> back to welcome
  const THANKS_MS = 6000;

  // theme colours (cake: buttercream, deep-green script, dusty-pink flowers)
  const C = {
    cream: '#fbf6e8', cream2: '#f5ecd3', ink: '#34362d', muted: '#7f7b6b',
    rose: '#d3a3a2', roseEdge: '#b9827f', roseDark: '#a5696c', leaf: '#3f6a43', stem: '#3a6540',
  };

  // ===================================================================
  // settings (localStorage)
  // ===================================================================
  const SETTINGS_KEY = 'pb-settings';
  const DEFAULTS = {
    coupleNames: 'Safa & Mahmoud',
    welcome: 'Welcome to the engagement of',
    dateText: '05 . 12 . 2026',
    pin: '1234',
    accent: '#2f5f3a',
    showRecent: true,
    mirror: true,
  };
  function loadSettings() {
    let s;
    try { s = Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); }
    catch (e) { s = Object.assign({}, DEFAULTS); }
    // migrate values from the first (Arabic / gold) version
    if (s.accent === '#b08d57') s.accent = DEFAULTS.accent;
    if (s.welcome === 'أهلاً بيكم في خطوبة') s.welcome = DEFAULTS.welcome;
    if (s.coupleNames === 'Ahmed & Sara' || s.coupleNames === 'Sara & Ahmed') {
      s.coupleNames = DEFAULTS.coupleNames;
      if (!s.dateText) s.dateText = DEFAULTS.dateText;
    }
    return s;
  }
  function hasSavedSettings() {
    try { return localStorage.getItem(SETTINGS_KEY) !== null; } catch (e) { return false; }
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); return true; }
    catch (e) { toast('Could not save settings'); return false; }
  }
  let settings = loadSettings();
  let firstRun = !hasSavedSettings();

  // ===================================================================
  // IndexedDB
  // ===================================================================
  const DB = (() => {
    let dbp = null;
    function open() {
      if (!dbp) {
        dbp = new Promise((res, rej) => {
          const r = indexedDB.open('photobooth', 1);
          r.onupgradeneeded = () => {
            const db = r.result;
            if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'id' });
          };
          r.onsuccess = () => res(r.result);
          r.onerror = () => { dbp = null; rej(r.error); };
        });
      }
      return dbp;
    }
    async function tx(mode, fn) {
      const db = await open();
      return new Promise((res, rej) => {
        const t = db.transaction('entries', mode);
        const req = fn(t.objectStore('entries'));
        let out;
        if (req) req.onsuccess = () => { out = req.result; };
        t.oncomplete = () => res(out);
        t.onerror = () => rej(t.error);
        t.onabort = () => rej(t.error || new Error('transaction aborted'));
      });
    }
    return {
      put: (e) => tx('readwrite', (s) => s.put(e)),
      get: (id) => tx('readonly', (s) => s.get(id)),
      del: (id) => tx('readwrite', (s) => s.delete(id)),
      all: () => tx('readonly', (s) => s.getAll()).then((a) => (a || []).sort((x, y) => x.id - y.id)),
      clear: () => tx('readwrite', (s) => s.clear()),
    };
  })();

  // ===================================================================
  // floral spray (dusty-pink flowers, pearl centres, green stems) — used on
  // screen and drawn onto the card
  // ===================================================================
  function svgFlower(x, y, s) {
    let p = '';
    for (let i = 0; i < 5; i++) {
      p += '<ellipse cx="0" cy="-8.6" rx="6.4" ry="8.9" fill="' + C.rose + '" stroke="' + C.roseEdge + '" stroke-width=".9" transform="rotate(' + (i * 72) + ')"/>';
    }
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + s + ')">' + p +
      '<circle r="3.8" fill="#fffaf0" stroke="#e3d3b4" stroke-width=".8"/><circle cx="-1.1" cy="-1.2" r="1.2" fill="#fff"/></g>';
  }
  function svgLeaf(x, y, a, s) {
    s = s || 1;
    return '<path d="M0 0 C ' + (5 * s) + ' ' + (-4 * s) + ', ' + (13 * s) + ' ' + (-4 * s) + ', ' + (18 * s) + ' 0 C ' + (13 * s) + ' ' + (4 * s) + ', ' + (5 * s) + ' ' + (4 * s) + ', 0 0 Z" fill="' + C.leaf + '" transform="translate(' + x + ' ' + y + ') rotate(' + a + ')"/>';
  }
  function svgBaby(x, y) {
    const pts = [[0, 0], [5, -3], [-4, -4], [2, 5], [-5, 3]];
    return pts.map((p) => '<circle cx="' + (x + p[0]) + '" cy="' + (y + p[1]) + '" r="2.3" fill="#fffbf2" stroke="#e2d4b6" stroke-width=".6"/>').join('');
  }
  const FLORAL_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 260" width="260" height="260">' +
    '<g fill="none" stroke="' + C.stem + '" stroke-width="2.4" stroke-linecap="round">' +
    '<path d="M16 24 C 70 34, 130 28, 214 52"/>' +
    '<path d="M24 16 C 34 70, 28 130, 52 214"/>' +
    '<path d="M70 34 C 82 48, 86 60, 84 76"/>' +
    '<path d="M34 70 C 48 82, 60 86, 76 84"/>' +
    '<path d="M136 30 C 146 18, 158 14, 170 16"/>' +
    '<path d="M30 136 C 18 146, 14 158, 16 170"/>' +
    '</g>' +
    svgLeaf(100, 31, -20, 1.1) + svgLeaf(118, 30, 30, 0.9) + svgLeaf(170, 40, -15, 1) + svgLeaf(186, 46, 35, 0.8) +
    svgLeaf(31, 100, 110, 1.1) + svgLeaf(30, 118, 60, 0.9) + svgLeaf(40, 170, 105, 1) + svgLeaf(46, 186, 55, 0.8) +
    svgLeaf(84, 76, 70, 0.9) + svgLeaf(76, 84, 20, 0.9) +
    svgBaby(128, 52) + svgBaby(52, 128) + svgBaby(200, 64) + svgBaby(64, 200) + svgBaby(110, 96) +
    svgFlower(44, 44, 1.75) +
    svgFlower(92, 82, 1.25) +
    svgFlower(104, 22, 1.05) + svgFlower(22, 104, 1.05) +
    svgFlower(158, 38, 0.95) + svgFlower(38, 158, 0.95) +
    svgFlower(214, 52, 0.7) + svgFlower(52, 214, 0.7) +
    svgFlower(170, 16, 0.6) + svgFlower(16, 170, 0.6) +
    '</svg>';

  const floralImg = new Promise((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(FLORAL_SVG);
  });
  document.querySelectorAll('.spray').forEach((el) => { el.innerHTML = FLORAL_SVG; });

  // ===================================================================
  // elements
  // ===================================================================
  const video = $('#video');
  const still = $('#still');
  const camMsg = $('#cam-msg');
  const countdownEl = $('#countdown');
  const flashEl = $('#flash');
  const fileFallback = $('#file-fallback');
  const inName = $('#in-name');
  const inQuote = $('#in-quote');

  // ===================================================================
  // UI basics
  // ===================================================================
  let current = null;
  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + id));
    current = id;
    $('#admin-hotspot').hidden = id === 'admin';
    resetIdle();
  }

  let toastTimer;
  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }
  function busy(on) { $('#busy').classList.toggle('on', !!on); }

  function applySettings() {
    document.documentElement.style.setProperty('--accent', settings.accent);
    const couple = $('#w-couple');
    couple.textContent = settings.coupleNames;
    couple.className = 'couple ' + (isArabic(settings.coupleNames) ? 'ar' : 'lat');
    $('#w-welcome').textContent = settings.welcome;
    $('#w-date').textContent = settings.dateText;
    video.classList.toggle('mirror', !!settings.mirror);
    document.title = settings.coupleNames + ' · Photo Booth';
  }

  // ===================================================================
  // idle reset
  // ===================================================================
  let idleTimer;
  function resetIdle() {
    clearTimeout(idleTimer);
    let ms = 0;
    if (current === 'camera' || current === 'message') ms = IDLE_GUEST_MS;
    else if (current === 'admin') ms = IDLE_ADMIN_MS;
    if (!ms) return;
    idleTimer = setTimeout(() => {
      if (saving || shooting || exporting) { resetIdle(); return; }
      goWelcome();
    }, ms);
  }
  ['pointerdown', 'keydown', 'input', 'touchstart', 'scroll'].forEach((ev) =>
    document.addEventListener(ev, resetIdle, { passive: true, capture: true }));

  // ===================================================================
  // keep screen awake, persistent storage, service worker
  // ===================================================================
  async function keepAwake() {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') await navigator.wakeLock.request('screen');
    } catch (e) { /* not supported / not allowed */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') keepAwake();
  });
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  // ===================================================================
  // fonts (needed before drawing text on canvas)
  // ===================================================================
  const CARD_FONTS = [
    'italic 500 40px "Cormorant Garamond"', '500 40px "Cormorant Garamond"',
    '700 40px "Dancing Script"', '400 40px "Jost"', '500 40px "Jost"',
    '400 40px "Amiri"', '400 40px "Aref Ruqaa"',
  ];
  function loadFonts(text) {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    const all = Promise.all(CARD_FONTS.map((f) => document.fonts.load(f, text).catch(() => {})));
    return Promise.race([all, sleep(3000)]);
  }
  loadFonts('Welcome Ab 123 أهلاً');

  // ===================================================================
  // canvas helpers
  // ===================================================================
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  // iOS Safari has a hard cap on total canvas memory; release explicitly.
  function freeCanvas(c) { if (c) { c.width = 0; c.height = 0; } }
  function toBlob(canvas, type, q) {
    return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), type, q));
  }
  function frameFrom(src, w, h, mirror) {
    const MAX = 2048;
    const k = Math.min(1, MAX / Math.max(w, h));
    const cw = Math.round(w * k), ch = Math.round(h * k);
    const c = makeCanvas(cw, ch);
    const x = c.getContext('2d');
    if (mirror) { x.translate(cw, 0); x.scale(-1, 1); }
    x.drawImage(src, 0, 0, cw, ch);
    return c;
  }
  function squareFrom(src, size = 1080) {
    const s = Math.min(src.width, src.height);
    const c = makeCanvas(size, size);
    c.getContext('2d').drawImage(src, (src.width - s) / 2, (src.height - s) / 2, s, s, 0, 0, size, size);
    return c;
  }
  function scaled(src, w) {
    const h = Math.round(src.height * w / src.width);
    const c = makeCanvas(w, h);
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(src, 0, 0, w, h);
    return c;
  }
  function setDir(c, x, dir) {
    c.setAttribute('dir', dir);
    try { x.direction = dir; } catch (e) {}
  }
  function setSpacing(x, px) { try { x.letterSpacing = px + 'px'; } catch (e) {} }
  function wrapText(x, text, maxW) {
    const lines = [];
    text.split(/\r?\n/).forEach((para) => {
      const words = para.split(/\s+/).filter(Boolean);
      let line = '';
      words.forEach((w) => {
        const test = line ? line + ' ' + w : w;
        if (!line || x.measureText(test).width <= maxW) line = test;
        else { lines.push(line); line = w; }
      });
      if (line) lines.push(line);
    });
    return lines;
  }
  // thin double-line frame: green outside, dusty pink inside
  function drawFrame(x, W, H, green) {
    x.save();
    x.globalAlpha = 0.5; x.strokeStyle = green; x.lineWidth = 3;
    x.strokeRect(28, 28, W - 56, H - 56);
    x.globalAlpha = 0.9; x.strokeStyle = C.rose; x.lineWidth = 2;
    x.strokeRect(44, 44, W - 88, H - 88);
    x.restore();
  }
  function drawFlower(x, cx, cy, s) {
    x.save();
    x.translate(cx, cy); x.scale(s, s);
    x.fillStyle = C.rose; x.strokeStyle = C.roseEdge; x.lineWidth = 0.9;
    for (let i = 0; i < 5; i++) {
      x.save(); x.rotate(i * Math.PI * 2 / 5);
      x.beginPath(); x.ellipse(0, -8.6, 6.4, 8.9, 0, 0, Math.PI * 2); x.fill(); x.stroke();
      x.restore();
    }
    x.beginPath(); x.arc(0, 0, 3.8, 0, Math.PI * 2); x.fillStyle = '#fffaf0'; x.fill();
    x.strokeStyle = '#e3d3b4'; x.lineWidth = 0.8; x.stroke();
    x.restore();
  }

  // ===================================================================
  // the keepsake card
  // ===================================================================
  async function composeCard(square, name, quote) {
    const W = 1200, H = 1740, PX = 84, PS = 1032, cx = W / 2, maxW = 940;
    const green = settings.accent;
    await loadFonts([name, quote, settings.coupleNames, settings.dateText, '“'].join(' '));
    const flowers = await floralImg;

    const c = makeCanvas(W, H);
    const x = c.getContext('2d');

    // buttercream background + piped border
    const bg = x.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#fdf9ee'); bg.addColorStop(1, C.cream2);
    x.fillStyle = bg; x.fillRect(0, 0, W, H);
    drawFrame(x, W, H, green);

    // photo on a white mat
    x.save();
    x.shadowColor = 'rgba(60,50,20,.2)'; x.shadowBlur = 24; x.shadowOffsetY = 8;
    x.fillStyle = '#fff'; x.fillRect(PX - 12, PX - 12, PS + 24, PS + 24);
    x.restore();
    x.drawImage(square, PX, PX, PS, PS);

    // flowers on the top-left corner (like the cake)
    if (flowers) x.drawImage(flowers, 4, 4, 300, 300);

    x.textAlign = 'center';
    x.textBaseline = 'middle';

    let nameY = 1330, nameSize = 52;
    if (quote) {
      setDir(c, x, 'ltr');
      x.save();
      x.globalAlpha = 0.5; x.fillStyle = green;
      x.font = '500 150px "Cormorant Garamond", Georgia, serif';
      x.fillText('“', cx, 1212);
      x.restore();

      const ar = isArabic(quote);
      setDir(c, x, ar ? 'rtl' : 'ltr');
      const top = 1222, bottom = 1452, zone = bottom - top;
      let size = 60, lh = 0, lines = [];
      for (; size >= 28; size -= 2) {
        x.font = ar ? '400 ' + (size - 6) + 'px "Amiri", serif' : 'italic 500 ' + size + 'px "Cormorant Garamond", Georgia, serif';
        lh = size * 1.32;
        lines = wrapText(x, quote, maxW);
        if (lines.length * lh <= zone) break;
      }
      x.fillStyle = C.ink;
      let y = top + (zone - lines.length * lh) / 2 + lh / 2;
      lines.forEach((l) => { x.fillText(l, cx, y, maxW); y += lh; });
      nameY = 1500; nameSize = 30;
    }

    // guest name
    const nameAr = isArabic(name);
    setDir(c, x, nameAr ? 'rtl' : 'ltr');
    x.fillStyle = C.roseDark;
    x.font = (nameAr ? '700 ' + (nameSize + 6) + 'px "Amiri", serif' : '500 ' + nameSize + 'px "Jost", sans-serif');
    setSpacing(x, nameAr ? 0 : 5);
    x.fillText(nameAr ? name : name.toUpperCase(), cx, nameY, maxW);
    setSpacing(x, 0);

    // divider with a little flower
    x.save();
    x.strokeStyle = C.rose; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(cx - 130, 1552); x.lineTo(cx - 26, 1552); x.moveTo(cx + 26, 1552); x.lineTo(cx + 130, 1552); x.stroke();
    x.restore();
    drawFlower(x, cx, 1552, 1.1);

    // couple's names in green script (like "engaged" on the cake)
    const coupleAr = isArabic(settings.coupleNames);
    setDir(c, x, coupleAr ? 'rtl' : 'ltr');
    x.fillStyle = green;
    x.font = coupleAr ? '400 56px "Aref Ruqaa", "Amiri", serif' : '700 76px "Dancing Script", cursive';
    x.fillText(settings.coupleNames, cx, 1614, 760);

    if (settings.dateText) {
      setDir(c, x, isArabic(settings.dateText) ? 'rtl' : 'ltr');
      x.fillStyle = C.muted;
      x.font = '400 24px "Jost", sans-serif';
      setSpacing(x, 6);
      x.fillText(settings.dateText, cx, 1672, 700);
      setSpacing(x, 0);
    }

    // flowers on the bottom-right corner
    if (flowers) {
      x.save();
      x.translate(W - 4, H - 4); x.rotate(Math.PI);
      x.drawImage(flowers, 0, 0, 230, 230);
      x.restore();
    }
    return c;
  }

  // ===================================================================
  // camera
  // ===================================================================
  let stream = null;
  let camUnavailable = false;
  let shooting = false;
  let shot = null; // { full: canvas, square: canvas }

  async function ensureCamera() {
    const live = stream && stream.getVideoTracks().some((t) => t.readyState === 'live');
    if (!live) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('no getUserMedia');
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1440 } },
      });
      video.srcObject = stream;
    }
    try { await Promise.race([video.play(), sleep(1500)]); } catch (e) {}
    for (let i = 0; i < 60 && !video.videoWidth; i++) await sleep(50);
    if (!video.videoWidth) throw new Error('camera not ready');
  }

  function setCamState(state) {
    $('#cam-live-ctrl').hidden = state !== 'live';
    $('#cam-review-ctrl').hidden = state !== 'review';
    still.hidden = state !== 'review';
    video.style.visibility = state === 'review' ? 'hidden' : 'visible';
    $('#cam-hint').textContent =
      state === 'review' ? 'Love it?' :
      state === 'countdown' ? 'Get ready…' : 'Look at the camera & smile!';
  }

  async function openCamera() {
    show('camera');
    setCamState('live');
    camMsg.hidden = true;
    keepAwake();
    try {
      await ensureCamera();
      camUnavailable = false;
    } catch (e) {
      console.warn(e);
      camUnavailable = true;
      camMsg.innerHTML = 'The camera isn’t available here.<br>Tap the button below to open the device camera.';
      camMsg.hidden = false;
    }
  }

  async function runCountdown() {
    for (const n of [3, 2, 1]) {
      countdownEl.textContent = n;
      countdownEl.classList.remove('pop');
      void countdownEl.offsetWidth;
      countdownEl.classList.add('pop');
      await sleep(950);
    }
    countdownEl.textContent = '';
    countdownEl.classList.remove('pop');
  }
  function flash() {
    flashEl.classList.remove('go');
    void flashEl.offsetWidth;
    flashEl.classList.add('go');
  }

  function releaseShot() {
    if (shot) { freeCanvas(shot.full); freeCanvas(shot.square); }
    shot = null;
    still.removeAttribute('src');
  }
  function setShot(full) {
    releaseShot();
    shot = { full, square: squareFrom(full) };
    still.src = shot.square.toDataURL('image/jpeg', 0.85);
    setCamState('review');
  }

  async function capture() {
    if (shooting) return;
    if (camUnavailable) { fileFallback.click(); return; }
    shooting = true;
    try {
      setCamState('countdown');
      await ensureCamera();
      await runCountdown();
      const full = frameFrom(video, video.videoWidth, video.videoHeight, settings.mirror);
      flash();
      setShot(full);
    } catch (e) {
      console.error(e);
      toast('Camera problem — please try again');
      setCamState('live');
    } finally {
      shooting = false;
    }
  }

  fileFallback.addEventListener('change', () => {
    const f = fileFallback.files && fileFallback.files[0];
    fileFallback.value = '';
    if (!f) return;
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      const full = frameFrom(img, img.naturalWidth, img.naturalHeight, false);
      URL.revokeObjectURL(url);
      camMsg.hidden = true;
      if (current !== 'camera') show('camera');
      setShot(full);
    };
    img.onerror = () => { URL.revokeObjectURL(url); toast('Could not open that photo'); };
    img.src = url;
  });

  // ===================================================================
  // guest flow
  // ===================================================================
  let saving = false;
  let thanksTimer = null;
  let thanksUrl = null;

  function resetSession() {
    releaseShot();
    $('#msg-form').reset();
    $('#q-count').textContent = '0';
    $('#msg-photo').removeAttribute('src');
    countdownEl.textContent = '';
  }
  function goWelcome() {
    clearTimeout(thanksTimer);
    if (thanksUrl) { URL.revokeObjectURL(thanksUrl); thanksUrl = null; }
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    resetSession();
    show('welcome');
    renderRecent();
  }

  function goMessage() {
    if (!shot) return;
    $('#msg-photo').src = still.src;
    show('message');
  }

  async function saveEntry(ev) {
    ev.preventDefault();
    if (saving) return;
    const name = inName.value.trim().replace(/\s+/g, ' ');
    const quote = inQuote.value.trim();
    if (!name) { inName.focus(); toast('Please write your name first'); return; }
    if (!shot) { show('camera'); setCamState('live'); return; }

    saving = true;
    busy(true);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    let card = null, thumb = null;
    try {
      card = await composeCard(shot.square, name, quote);
      thumb = scaled(card, 360);
      const cardBlob = await toBlob(card, 'image/jpeg', 0.9);
      const photoBlob = await toBlob(shot.full, 'image/jpeg', 0.92);
      const thumbBlob = await toBlob(thumb, 'image/jpeg', 0.8);
      const now = new Date();
      await DB.put({
        id: now.getTime(),
        createdAt: now.toISOString(),
        name, quote,
        card: cardBlob, photo: photoBlob, thumb: thumbBlob,
      });
      showThanks(cardBlob, name);
    } catch (e) {
      console.error(e);
      alert('Sorry, the photo was not saved. Please try again.\n' + ((e && e.message) || e));
    } finally {
      freeCanvas(card); freeCanvas(thumb);
      saving = false;
      busy(false);
    }
  }

  function showThanks(cardBlob, name) {
    if (thanksUrl) URL.revokeObjectURL(thanksUrl);
    thanksUrl = URL.createObjectURL(cardBlob);
    $('#thanks-card').src = thanksUrl;
    $('#thanks-name').textContent = name;
    releaseShot();
    show('thanks');
    clearTimeout(thanksTimer);
    thanksTimer = setTimeout(goWelcome, THANKS_MS);
  }

  // ---- recent strip on the welcome screen
  let recentUrls = [];
  async function renderRecent() {
    const box = $('#recent');
    recentUrls.forEach((u) => URL.revokeObjectURL(u));
    recentUrls = [];
    box.innerHTML = '';
    if (!settings.showRecent) return;
    try {
      const entries = (await DB.all()).slice(-6).reverse();
      entries.forEach((e) => {
        const u = URL.createObjectURL(e.thumb);
        recentUrls.push(u);
        const img = document.createElement('img');
        img.src = u; img.alt = '';
        box.appendChild(img);
      });
    } catch (e) { console.warn(e); }
  }

  // ===================================================================
  // admin
  // ===================================================================
  let hotspotTaps = [];
  $('#admin-hotspot').addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    const t = Date.now();
    hotspotTaps = hotspotTaps.filter((x) => t - x < 3000);
    hotspotTaps.push(t);
    if (hotspotTaps.length >= 5) { hotspotTaps = []; openPin(); }
  });

  function openPin() {
    const m = $('#pin-modal');
    $('#pin-input').value = '';
    m.classList.add('open');
    setTimeout(() => $('#pin-input').focus(), 50);
  }
  function closePin() { $('#pin-modal').classList.remove('open'); $('#pin-input').blur(); }
  $('#pin-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if ($('#pin-input').value === String(settings.pin)) { closePin(); openAdmin(); }
    else {
      const box = $('#pin-form');
      box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
      $('#pin-input').value = '';
    }
  });
  $('#pin-cancel').addEventListener('click', closePin);

  function openAdmin() {
    clearTimeout(thanksTimer);
    $('#set-couple').value = settings.coupleNames;
    $('#set-welcome').value = settings.welcome;
    $('#set-date').value = settings.dateText;
    $('#set-pin').value = settings.pin;
    $('#set-accent').value = settings.accent;
    $('#set-recent').checked = !!settings.showRecent;
    $('#set-mirror').checked = !!settings.mirror;
    $('#first-run').hidden = !firstRun;
    $('#export-ready').hidden = true;
    $('#export-status').textContent = '';
    exportFile = null;
    show('admin');
    $('#screen-admin').scrollTop = 0;
    renderGallery();
  }

  $('#btn-save-settings').addEventListener('click', () => {
    const pin = $('#set-pin').value.trim();
    if (!/^\d{4,8}$/.test(pin)) { toast('PIN must be 4–8 digits'); return; }
    settings = Object.assign({}, settings, {
      coupleNames: $('#set-couple').value.trim() || DEFAULTS.coupleNames,
      welcome: $('#set-welcome').value.trim(),
      dateText: $('#set-date').value.trim(),
      pin,
      accent: $('#set-accent').value || DEFAULTS.accent,
      showRecent: $('#set-recent').checked,
      mirror: $('#set-mirror').checked,
    });
    if (saveSettings()) {
      firstRun = false;
      $('#first-run').hidden = true;
      applySettings();
      toast('Saved ✓');
    }
  });

  $('#btn-admin-exit').addEventListener('click', goWelcome);

  let galleryUrls = [];
  async function renderGallery() {
    const g = $('#gallery');
    galleryUrls.forEach((u) => URL.revokeObjectURL(u));
    galleryUrls = [];
    g.innerHTML = '';
    let entries = [];
    try { entries = await DB.all(); } catch (e) { toast('Could not read photos'); }
    $('#admin-count').textContent = entries.length;
    $('#gallery-empty').hidden = entries.length > 0;
    $('#btn-export').disabled = entries.length === 0;

    try {
      if (navigator.storage && navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        const mb = (b) => (b / 1048576).toFixed(0);
        $('#admin-storage').textContent = 'Storage used: ' + mb(est.usage || 0) + ' MB' +
          (est.quota ? ' of ' + mb(est.quota) + ' MB available' : '');
      }
    } catch (e) {}

    entries.slice().reverse().forEach((e) => {
      const fig = document.createElement('figure');
      fig.className = 'g-item';
      const img = document.createElement('img');
      const u = URL.createObjectURL(e.thumb);
      galleryUrls.push(u);
      img.src = u; img.alt = e.name; img.loading = 'lazy';
      img.addEventListener('click', () => openLightbox(e.id));
      const cap = document.createElement('figcaption');
      const b = document.createElement('b'); b.textContent = e.name; b.dir = 'auto';
      const q = document.createElement('span'); q.className = 'q'; q.textContent = e.quote || '—'; q.dir = 'auto';
      const t = document.createElement('time'); t.textContent = fmtDate(new Date(e.createdAt));
      cap.append(b, q, t);
      const del = document.createElement('button');
      del.className = 'g-del'; del.type = 'button'; del.textContent = 'Delete';
      del.addEventListener('click', async () => {
        if (!confirm('Delete the photo from "' + e.name + '"?')) return;
        await DB.del(e.id);
        exportFile = null; $('#export-ready').hidden = true;
        renderGallery();
      });
      fig.append(img, cap, del);
      g.appendChild(fig);
    });
  }

  let lightboxUrl = null;
  async function openLightbox(id) {
    const e = await DB.get(id);
    if (!e) return;
    if (lightboxUrl) URL.revokeObjectURL(lightboxUrl);
    lightboxUrl = URL.createObjectURL(e.card);
    $('#lightbox-img').src = lightboxUrl;
    $('#lightbox').classList.add('open');
  }
  function closeLightbox() {
    $('#lightbox').classList.remove('open');
    $('#lightbox-img').removeAttribute('src');
    if (lightboxUrl) { URL.revokeObjectURL(lightboxUrl); lightboxUrl = null; }
  }
  $('#lightbox-close').addEventListener('click', closeLightbox);
  $('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') closeLightbox(); });

  $('#btn-clear').addEventListener('click', async () => {
    if (!confirm('Delete ALL photos? This cannot be undone.')) return;
    const p = prompt('Type the PIN to confirm');
    if (p !== String(settings.pin)) { toast('Wrong PIN — nothing was deleted'); return; }
    await DB.clear();
    exportFile = null; $('#export-ready').hidden = true;
    toast('All photos deleted');
    renderGallery();
  });

  // ===================================================================
  // export (ZIP, no compression — JPEGs are already compressed)
  // ===================================================================
  function fmtDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function safeName(s) {
    return (s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().replace(/\s+/g, '_').slice(0, 40) || 'guest';
  }
  function escHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function csvCell(s) { return '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"'; }

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(u8) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function dosTime(d) {
    return {
      time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
      date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
  }
  // files: [{ name, blob | text, date }]
  async function makeZip(files, onProgress) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const blob = f.blob || new Blob([f.text], { type: 'text/plain' });
      const data = new Uint8Array(await new Response(blob).arrayBuffer());
      const name = enc.encode(f.name);
      const crc = crc32(data);
      const size = data.length;
      const { time, date } = dosTime(f.date || new Date());

      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true);
      lh.setUint16(4, 20, true);
      lh.setUint16(6, 0x0800, true); // UTF-8 file names
      lh.setUint16(8, 0, true);      // stored
      lh.setUint16(10, time, true);
      lh.setUint16(12, date, true);
      lh.setUint32(14, crc, true);
      lh.setUint32(18, size, true);
      lh.setUint32(22, size, true);
      lh.setUint16(26, name.length, true);
      lh.setUint16(28, 0, true);
      parts.push(lh.buffer, name, blob); // keep the Blob (not the bytes) to save memory

      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true);
      ch.setUint16(4, 20, true);
      ch.setUint16(6, 20, true);
      ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true);
      ch.setUint16(12, time, true);
      ch.setUint16(14, date, true);
      ch.setUint32(16, crc, true);
      ch.setUint32(20, size, true);
      ch.setUint32(24, size, true);
      ch.setUint16(28, name.length, true);
      ch.setUint16(30, 0, true);
      ch.setUint16(32, 0, true);
      ch.setUint16(34, 0, true);
      ch.setUint16(36, 0, true);
      ch.setUint32(38, 0, true);
      ch.setUint32(42, offset, true);
      central.push(ch.buffer, name);

      offset += 30 + name.length + size;
      if (onProgress) onProgress((i + 1) / files.length);
      if (i % 5 === 4) await nextFrame();
    }
    let cdSize = 0;
    central.forEach((p) => { cdSize += p.byteLength; });
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(4, 0, true);
    end.setUint16(6, 0, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true);
    end.setUint32(16, offset, true);
    end.setUint16(20, 0, true);
    return new Blob(parts.concat(central, [end.buffer]), { type: 'application/zip' });
  }

  function guestbookHtml(rows) {
    const title = escHtml(settings.coupleNames);
    const green = escHtml(settings.accent);
    const items = rows.map((r) =>
      '<figure><a href="' + escHtml(r.card) + '"><img src="' + escHtml(r.card) + '" loading="lazy" alt=""></a>' +
      '<figcaption><b dir="auto">' + escHtml(r.name) + '</b>' +
      (r.quote ? '<p dir="auto">' + escHtml(r.quote) + '</p>' : '') +
      '<small>#' + r.n + ' · ' + escHtml(r.time) + ' · <a href="' + escHtml(r.photo) + '">original photo</a></small></figcaption></figure>'
    ).join('\n');
    return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1"><title>' + title + ' — Guestbook</title>' +
      '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@1,500&family=Dancing+Script:wght@700&family=Jost:wght@400;500&display=swap">' +
      '<style>body{margin:0;padding:32px;background:#fbf6e8;color:#34362d;font-family:"Jost",system-ui,sans-serif}' +
      'h1{text-align:center;font-family:"Dancing Script",cursive;font-size:64px;margin:0;color:' + green + '}' +
      '.sub{text-align:center;color:#7f7b6b;margin:6px 0 32px;letter-spacing:.2em;text-transform:uppercase;font-size:14px}' +
      '.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:24px;max-width:1400px;margin:0 auto}' +
      'figure{margin:0;background:#fffdf8;border:1px solid #e4dac0;border-radius:14px;overflow:hidden}' +
      'img{width:100%;display:block}figcaption{padding:12px 16px 16px}figcaption b{color:#a5696c;letter-spacing:.08em}' +
      'figcaption p{white-space:pre-wrap;margin:6px 0;font-family:"Cormorant Garamond",Georgia,serif;font-style:italic;font-size:21px}' +
      'small{color:#9a957f}small a{color:inherit}</style></head><body>' +
      '<h1>' + title + '</h1><p class="sub">' + (settings.dateText ? escHtml(settings.dateText) + ' · ' : '') + rows.length + ' photos</p>' +
      '<div class="grid">' + items + '</div></body></html>';
  }

  let exporting = false;
  let exportFile = null;
  $('#btn-export').addEventListener('click', async () => {
    if (exporting) return;
    exporting = true;
    const btn = $('#btn-export');
    const status = $('#export-status');
    btn.disabled = true;
    $('#export-ready').hidden = true;
    exportFile = null;
    try {
      const entries = await DB.all();
      if (!entries.length) { toast('No photos yet'); return; }
      const files = [], rows = [];
      entries.forEach((e, i) => {
        const n = pad(i + 1, 3);
        const base = n + '_' + safeName(e.name) + '.jpg';
        const d = new Date(e.createdAt);
        files.push({ name: 'cards/' + base, blob: e.card, date: d });
        files.push({ name: 'photos/' + base, blob: e.photo, date: d });
        rows.push({ n: i + 1, time: fmtDate(d), name: e.name, quote: e.quote, card: 'cards/' + base, photo: 'photos/' + base });
      });
      const csv = '﻿' + [['#', 'Time', 'Name', 'Message', 'Card', 'Original photo'].map(csvCell).join(',')]
        .concat(rows.map((r) => [r.n, r.time, r.name, r.quote, r.card, r.photo].map(csvCell).join(',')))
        .join('\r\n');
      files.push({ name: 'guestbook.csv', text: csv });
      files.push({ name: 'guestbook.html', text: guestbookHtml(rows) });

      const zip = await makeZip(files, (p) => { status.textContent = 'Preparing… ' + Math.round(p * 100) + '%'; });
      const today = new Date();
      const fname = 'photobooth_' + safeName(settings.coupleNames) + '_' +
        today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate()) + '.zip';
      exportFile = new File([zip], fname, { type: 'application/zip' });
      status.textContent = 'Ready ✓ — ' + entries.length + ' photos · ' + (zip.size / 1048576).toFixed(1) + ' MB';
      $('#btn-share').hidden = !(navigator.canShare && navigator.canShare({ files: [exportFile] }));
      $('#export-ready').hidden = false;
    } catch (e) {
      console.error(e);
      status.textContent = 'Something went wrong: ' + ((e && e.message) || e);
    } finally {
      exporting = false;
      btn.disabled = false;
    }
  });

  $('#btn-download').addEventListener('click', () => {
    if (!exportFile) return;
    const url = URL.createObjectURL(exportFile);
    const a = document.createElement('a');
    a.href = url; a.download = exportFile.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  });
  $('#btn-share').addEventListener('click', async () => {
    if (!exportFile) return;
    try { await navigator.share({ files: [exportFile], title: exportFile.name }); }
    catch (e) { if (e && e.name !== 'AbortError') toast('Sharing failed — try Download'); }
  });

  // ===================================================================
  // wiring
  // ===================================================================
  $('#btn-start').addEventListener('click', openCamera);
  $('#btn-shoot').addEventListener('click', capture);
  $('#btn-cancel').addEventListener('click', goWelcome);
  $('#btn-retake').addEventListener('click', () => { releaseShot(); setCamState('live'); if (camUnavailable) fileFallback.click(); });
  $('#btn-use').addEventListener('click', goMessage);
  $('#btn-back-cam').addEventListener('click', () => { releaseShot(); show('camera'); setCamState('live'); if (!camUnavailable) ensureCamera().catch(() => {}); });
  $('#msg-form').addEventListener('submit', saveEntry);
  inName.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); inQuote.focus(); } });
  inQuote.addEventListener('input', () => { $('#q-count').textContent = inQuote.value.length; });
  $('#screen-thanks').addEventListener('click', goWelcome);
  // block pinch-zoom / double-tap zoom on iOS
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  // ===================================================================
  // boot
  // ===================================================================
  applySettings();
  if (firstRun) openAdmin(); else goWelcome();

  // test hooks (used only by local tests)
  window.__pb = { makeZip, composeCard, crc32 };
})();
