/* WORM - app: screens, input, rendering, audio. Requires engine.js + levels.js */
(function () {
'use strict';

/* ============================== ASSET PATHS ==============================
   The only asset paths the script itself loads. The live build renames
   bundled files (hashed filenames), and bundlers don't rewrite plain
   strings inside a script - so a build can point these at its own files
   by setting window.WORM_ASSETS = { music: '...', homeArt: '...' } before
   app.js runs, instead of editing code. (Paths in styles.css / index.html
   are ordinary url()/href references that bundlers do rewrite.) */
var ASSETS = {
  music: (window.WORM_ASSETS && window.WORM_ASSETS.music) || 'audio/bgm-puzzle-path.mp3',
  homeArt: (window.WORM_ASSETS && window.WORM_ASSETS.homeArt) || 'art/worm-home-art.jpg'
};

/* ============================== SAVE ==============================
   Everything the player would expect an app to remember: progress, best
   runs, settings, the chosen hat, and the exact in-progress level (so
   leaving mid-puzzle and coming back resumes on the same move). */
var SAVE_KEY = 'worm.save.v1';
var save = {
  unlocked: 1, stars: {}, best: {}, bestScore: {},
  sound: true,          // sound effects (older saves: this also meant music)
  music: true,
  haptics: true,
  reduceMotion: null,   // null = follow the system setting
  hat: 'none',
  mapFrontier: -1,      // frontier the level map last showed Wally standing on
  resume: null,         // { level, moves: 'DDRU...' } for a level left mid-play
  coached: false,       // first-level coaching has been shown
  seasonal: {},         // seasonal hats the player has already been given
  storySeen: {}         // Wally & Pip story beats already shown (same keys as the live server)
};
function loadSave() {
  try {
    var s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && typeof s === 'object') {
      for (var k in save) if (s[k] !== undefined) save[k] = s[k];
      // saves from before music had its own switch: the one sound toggle
      // controlled both, so carry an "off" over to music too
      if (s.music === undefined && s.sound === false) save.music = false;
    }
  } catch (e) {}
}
var persistTimer = 0;
// A ?level=N shared-puzzle visit (see SHARED PUZZLE LINK below) plays entirely
// off this browser's real save: no star, unlock, best-score or resume state
// from that session is ever written back, so sending someone a single hard
// level can't skip them ahead in - or quietly touch - their own campaign.
// Blocking persist() alone isn't enough - the in-memory `save` object still
// picks up stars/unlocks/resume from the shared play, and once the visitor
// leaves the shared level a later, ordinary save would write those out. So a
// snapshot is taken going in and restored coming out (see restoreRealSave).
var sharedPuzzle = false, sharedSaveSnapshot = null;
function restoreRealSave() {
  if (!sharedSaveSnapshot) return;
  for (var k in save) delete save[k];
  for (var k in sharedSaveSnapshot) save[k] = sharedSaveSnapshot[k];
  sharedSaveSnapshot = null;
}
function persist() {
  clearTimeout(persistTimer); persistTimer = 0;
  if (sharedPuzzle) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
}
// Coalesce rapid saves (one per move) into a single write.
function persistSoon() {
  if (sharedPuzzle) return;
  if (!persistTimer) persistTimer = setTimeout(persist, 400);
}
function el(id) { return document.getElementById(id); }
var SYS_REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
function reducedMotion() { return save.reduceMotion === null ? SYS_REDUCED : !!save.reduceMotion; }
function starSvg(cls) { return '<svg class="ic ic-star' + (cls ? ' ' + cls : '') + '"><use href="#ic-star"/></svg>'; }
function fmt(n) { return Number(n).toLocaleString('en-US'); }
function now() { return performance.now(); }
// "?debug" in the URL turns on developer-only visible warnings (like a
// failed music load) that would otherwise just be a silent console note -
// players never see these in a normal share link.
function isDebugBuild() { try { return /[?&]debug\b/.test(location.search); } catch (e) { return false; } }
/* ============================== SHARED PUZZLE LINK ==============================
   ?level=N (1-indexed, matching the number players see in the HUD/map) opens
   that level directly instead of the campaign frontier. It's for sending one
   puzzle - a level code in a post, "can you get L46?" - not a progress skip:
   sharedPuzzle (above) blocks every save this session makes, and the level
   plays with its own story beat suppressed (the Wally & Pip narrative doesn't
   make sense out of campaign order) while keeping its mechanic intro card,
   which is often the only teaching a cold visitor gets for that trick. */
function sharedLevelFromURL() {
  try {
    var m = /[?&]level=(\d+)\b/.exec(location.search);
    if (!m) return null;
    var idx = parseInt(m[1], 10) - 1;
    return (idx >= 0 && idx < LEVELS.length) ? idx : null;
  } catch (e) { return null; }
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function easeOutBack(p) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); }
function easeOutCubic(p) { return 1 - Math.pow(1 - p, 3); }
function easeInOut(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
// Brief scale "tick" on a HUD number when it changes. Uses the Web
// Animations API so it never forces a style recalc/reflow.
function setNum(node, v) {
  var txt = String(v);
  if (node.textContent === txt) return;
  node.textContent = txt;
  if (node.animate && !reducedMotion()) {
    node.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }],
                 { duration: 260, easing: 'cubic-bezier(.2,1.5,.4,1)' });
  }
}

/* ============================== HAPTICS ==============================
   Android: navigator.vibrate. iPhone: WebKit has no vibrate API, but since
   iOS 18 toggling a native switch control plays the system's light haptic
   tick - so on iOS each "pulse" is a programmatic tap on a hidden switch.
   Everything is fire-and-forget; unsupported devices just stay still. */
var Haptics = {
  sw: null,
  ios: /iP(hone|ad|od)/.test(navigator.userAgent) ||
       (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
  tapIOS: function () {
    try {
      if (!this.sw) {
        var lab = document.createElement('label');
        lab.setAttribute('aria-hidden', 'true');
        lab.style.display = 'none';
        var inp = document.createElement('input');
        inp.type = 'checkbox'; inp.setAttribute('switch', '');
        lab.appendChild(inp);
        document.head.appendChild(lab);
        this.sw = lab;
      }
      this.sw.click();
    } catch (e) {}
  },
  // pattern: ms number, or [on, off, on, ...] like navigator.vibrate
  play: function (pattern) {
    if (!save.haptics) return;
    try {
      if (navigator.vibrate) { navigator.vibrate(pattern); return; }
      if (!this.ios) return;
      var p = typeof pattern === 'number' ? [pattern] : pattern, t = 0, self = this;
      for (var i = 0; i < p.length; i += 2) {
        if (t === 0) self.tapIOS();
        else setTimeout(function () { self.tapIOS(); }, t);
        t += p[i] + (p[i + 1] || 0);
      }
    } catch (e) {}
  },
  tap: function () { this.play(6); },            // a move
  bump: function () { this.play(14); },          // walked into something
  pop: function () { this.play(10); },           // ate an apple
  big: function () { this.play([15, 40, 25]); }, // golden apple
  win: function () { this.play([18, 60, 28, 60, 40]); },
  fail: function () { this.play([40, 60, 40]); }
};

/* ============================== AUDIO ==============================
   One WebAudio graph for everything:
     sfx voices -> sfxBus --\
                             +-> master -> compressor -> speakers
     music ---> lowpass ---/
   Every effect gets a little random pitch/level variation so repeated
   actions (dozens of moves per level) never sound machine-identical. The
   music runs through a lowpass that closes while the game is paused, so
   the pause menu sounds "underground" instead of cutting to silence. */
var Sfx = {
  ctx: null, master: null, sfxBus: null, noiseBuf: null,
  get on() { return save.sound; },
  // Create/wake the audio context. Browsers only allow this from a real
  // tap/click/key, so it's called from input handlers; safe to spam.
  wake: function () {
    try {
      if (!this.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        var c = this.ctx = new AC();
        var comp = c.createDynamicsCompressor();
        comp.threshold.value = -14; comp.ratio.value = 4;
        this.master = c.createGain(); this.master.gain.value = 0.9;
        this.sfxBus = c.createGain(); this.sfxBus.gain.value = 1;
        this.sfxBus.connect(this.master); this.master.connect(comp); comp.connect(c.destination);
        // one second of white noise, reused for every squish/thud/whoosh
        var nb = c.createBuffer(1, c.sampleRate, c.sampleRate), d = nb.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        this.noiseBuf = nb;
      }
      if (this.ctx.state !== 'running' && !document.hidden) this.ctx.resume();
    } catch (e) {}
    return this.ctx;
  },
  ensure: function () { if (this.on) this.wake(); },
  suspend: function () {
    try { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); } catch (e) {}
  },
  v: 1,
  vary: function (amt) { this.v = 1 + (Math.random() - 0.5) * (amt || 0.08); return this; },
  tone: function (f, dur, type, vol, delay, slideTo) {
    if (!this.on || !this.wake()) return;
    try {
      var c = this.ctx, t0 = c.currentTime + (delay || 0), v = this.v;
      var o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f * v, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo * v, t0 + dur);
      var peak = (vol || 0.12) * (0.9 + Math.random() * 0.2);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(this.sfxBus);
      o.start(t0); o.stop(t0 + dur + 0.05);
    } catch (e) {}
  },
  // filtered noise burst: squish / thud / whoosh / crackle
  noise: function (dur, vol, freq, q, delay, freqTo) {
    if (!this.on || !this.wake()) return;
    try {
      var c = this.ctx, t0 = c.currentTime + (delay || 0);
      var src = c.createBufferSource(); src.buffer = this.noiseBuf;
      var f = c.createBiquadFilter(); f.type = 'bandpass';
      f.frequency.setValueAtTime(freq * this.v, t0); f.Q.value = q || 1;
      if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo * this.v, t0 + dur);
      var g = c.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f); f.connect(g); g.connect(this.sfxBus);
      src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.02);
    } catch (e) {}
  },
  click: function () { this.vary(0.05).tone(700, 0.045, 'sine', 0.08, 0, 520); },
  // soft pop + a little wet dirt squish
  move: function () {
    this.vary(0.12);
    this.tone(400, 0.07, 'sine', 0.085, 0, 230);
    this.noise(0.06, 0.05, 950, 1.3);
  },
  slide: function () { this.vary(0.06).noise(0.22, 0.035, 2600, 0.8, 0, 1600); },
  // a mistake: soft "bonk" with a low thud, clearly not a move sound
  bump: function () {
    this.vary(0.06);
    this.tone(210, 0.11, 'triangle', 0.13, 0, 105);
    this.noise(0.07, 0.07, 180, 1.2);
  },
  eat: function (kind) {
    var self = this;
    this.vary(0.07);
    if (kind === 'golden') {
      [660, 830, 990, 1320].forEach(function (f, i) { self.tone(f, 0.12, 'triangle', 0.12, i * 0.06); });
    } else if (kind === 'rotten') {
      this.tone(220, 0.25, 'sawtooth', 0.10, 0, 90);
      this.noise(0.2, 0.05, 300, 0.8);
    } else {
      this.tone(520, 0.09, 'sine', 0.16, 0, 220);
      this.tone(320, 0.13, 'sine', 0.16, 0.07, 130);
      this.noise(0.05, 0.06, 1800, 2); // the crunch
    }
  },
  jackpot: function () {
    var self = this; this.vary(0.03);
    [523, 659, 784, 1046].forEach(function (f, i) { self.tone(f, 0.14, 'triangle', 0.14, i * 0.07); });
    [1046, 1318, 1568].forEach(function (f) { self.tone(f, 0.38, 'triangle', 0.10, 0.30); });
  },
  combo: function (n) { this.vary(0.03).tone(480 + n * 90, 0.10, 'square', 0.06); },
  star: function (i) { this.vary(0.02).tone(700 + i * 220, 0.16, 'triangle', 0.12); },
  win: function (big) {
    var self = this; this.vary(0.02);
    [523, 659, 784, 1046, 1318].forEach(function (f, i) { self.tone(f, 0.20, 'triangle', 0.13, i * 0.09); });
    if (big) {
      [1046, 1318, 1568, 2093].forEach(function (f, i) { self.tone(f, 0.32, 'triangle', 0.09, 0.5 + i * 0.05); });
      this.noise(0.5, 0.04, 5000, 0.7, 0.5, 9000); // sparkle
    }
  },
  // "aww": a gentle, disappointed slide down rather than a harsh buzzer
  lose: function () {
    var self = this; this.vary(0.03);
    [[520, 440], [440, 370], [370, 290]].forEach(function (p, i) { self.tone(p[0], 0.26, 'triangle', 0.11, i * 0.2, p[1]); });
  },
  teleport: function () {
    this.vary(0.05);
    this.tone(220, 0.10, 'sine', 0.10, 0, 880);
    this.tone(1200, 0.09, 'sine', 0.07, 0.06, 500);
  },
  patrolStep: function () { this.vary(0.08).tone(90, 0.09, 'sawtooth', 0.045, 0, 60); },
  crack: function () { this.vary(0.1); this.noise(0.14, 0.09, 520, 1.5); this.tone(140, 0.1, 'triangle', 0.06, 0.02, 90); },
  // undo: a quick reversed "rewind" sweep
  undo: function () {
    this.vary(0.04);
    this.tone(260, 0.12, 'sine', 0.08, 0, 620);
    this.noise(0.12, 0.03, 900, 1, 0, 2600);
  },
  giggle: function () {
    var self = this; this.vary(0.1);
    [980, 1180, 1060].forEach(function (f, i) { self.tone(f, 0.06, 'sine', 0.07, i * 0.075, f * 0.85); });
  },
  hmph: function () { this.vary(0.05); this.tone(190, 0.18, 'sawtooth', 0.05, 0, 150); this.noise(0.12, 0.04, 400, 1); },
  pauseIn: function () { var s = this; this.vary(0.02); s.tone(660, 0.12, 'sine', 0.07); s.tone(494, 0.16, 'sine', 0.07, 0.08); },
  pauseOut: function () { var s = this; this.vary(0.02); s.tone(494, 0.10, 'sine', 0.07); s.tone(660, 0.14, 'sine', 0.07, 0.07); }
};

/* ============================== BACKGROUND MUSIC ==============================
   One looping track under the whole app, decoded once and played through
   the same WebAudio context as the effects (so it takes the identical
   output path on every device - an <audio> element can be silenced on
   iPhone while WebAudio keeps playing). It has its own on/off switch in
   Settings. Pausing/backgrounding suspends the shared context, so the
   track holds its place and picks up mid-phrase; toggling music off and on
   also resumes from where it stopped. */
var Music = {
  buf: null, src: null, bus: null, lp: null, loading: false, failed: false, failedAt: 0,
  startedAt: 0, offset: 0,
  get on() { return save.music; },
  graph: function () {
    var c = Sfx.wake();
    if (!c) return null;
    if (!this.bus) {
      this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 20000;
      this.bus = c.createGain(); this.bus.gain.value = 0.0001;
      this.lp.connect(this.bus); this.bus.connect(Sfx.master);
    }
    return c;
  },
  load: function () {
    var c = this.graph();
    if (!c || this.buf || this.loading) return;
    // A failed load isn't permanent: retry on a later gesture rather than
    // giving up for the rest of the session (a 404 could be a deploy
    // hiccup). Throttled so a genuinely-missing file doesn't get re-fetched
    // on every single tap.
    if (this.failed && now() - this.failedAt < 8000) return;
    this.loading = true; this.failed = false;
    var self = this;
    fetch(ASSETS.music).then(function (r) {
      if (!r.ok) throw new Error('music http ' + r.status);
      return r.arrayBuffer();
    }).then(function (ab) {
      // callback form too: older WebKit's decodeAudioData returns no promise
      return new Promise(function (res, rej) { var p = c.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
    }).then(function (b) {
      self.buf = b; self.loading = false;
      self.play();
    }).catch(function (err) {
      self.loading = false; self.failed = true; self.failedAt = now();
      // Stays silent for players; visible only with ?debug in the URL, so
      // testing catches a broken asset path instead of it failing quietly.
      if (isDebugBuild()) showToast('Music unavailable: ' + (err && err.message || ASSETS.music), 4000);
    });
  },
  play: function () {
    if (!this.on || document.hidden) return;
    var c = this.graph();
    if (!c) return;
    if (!this.buf) { this.load(); return; }
    if (this.src) return;
    var src = c.createBufferSource();
    src.buffer = this.buf; src.loop = true;
    src.connect(this.lp);
    var off = this.offset % this.buf.duration;
    try { src.start(0, off); } catch (e) { return; }
    this.src = src; this.startedAt = c.currentTime - off;
    var g = this.bus.gain, t = c.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(Math.max(0.0001, g.value), t);
    g.exponentialRampToValueAtTime(0.32, t + 0.8); // gentle fade-in
  },
  stop: function () {
    if (!this.src) return;
    var c = Sfx.ctx;
    this.offset = c.currentTime - this.startedAt;
    try { this.src.stop(); this.src.disconnect(); } catch (e) {}
    this.src = null;
    try { this.bus.gain.cancelScheduledValues(c.currentTime); this.bus.gain.value = 0.0001; } catch (e) {}
  },
  setEnabled: function (on) { if (on) this.play(); else this.stop(); },
  // muffle while paused (underground!), open back up on resume
  muffle: function (on) {
    if (!this.lp || !Sfx.ctx) return;
    var t = Sfx.ctx.currentTime, f = this.lp.frequency;
    f.cancelScheduledValues(t); f.setValueAtTime(f.value, t);
    f.exponentialRampToValueAtTime(on ? 650 : 20000, t + (on ? 0.35 : 0.5));
  }
};
// Any real gesture: wake audio (if either channel is on) and start music.
function audioGesture() {
  if (save.sound || save.music) Sfx.wake();
  Music.play();
}

/* ============================== SCREENS & SYSTEM BACK ==============================
   A swipe from the screen edge (iOS / host apps) or the Android back button
   fires the browser's "back". Inside the game we keep one history entry
   armed, so that gesture lands on WORM's own back behaviour - playing ->
   pause menu, pause/level map -> one screen up - instead of dropping the
   player out of the game mid-puzzle. On the home screen nothing is armed,
   so back leaves WORM as expected. (If a host app's back-swipe is native
   and never reaches the page, the edge gutters are the only defence.) */
var activeScreen = 'screen-home';
function show(id) {
  var prev = activeScreen;
  activeScreen = id;
  if (id === 'screen-home') { updateHome(); Nav.disarm(); } else Nav.arm();
  if (id !== 'screen-game' && prev === 'screen-game') hideToast();
  var screens = document.querySelectorAll('.screen');
  for (var i = 0; i < screens.length; i++) {
    screens[i].classList.toggle('active', screens[i].id === id);
  }
}
var Nav = {
  armed: false, skip: 0,
  arm: function () {
    if (this.armed) return;
    try { history.pushState({ worm: 1 }, ''); this.armed = true; } catch (e) {}
  },
  disarm: function () {
    if (!this.armed) return;
    this.armed = false;
    try { this.skip++; history.back(); } catch (e) { this.skip--; }
  }
};
function onSystemBack() {
  var m = openModal();
  if (activeScreen === 'screen-game') {
    if (m && m.id === 'modal-settings') { closeSettings(); Nav.arm(); return; }
    if (!m && G && G.status === 'playing' && !transitioning) { pauseGame(); Nav.arm(); return; }
    goToLevels();
  } else if (activeScreen === 'screen-levels') {
    show('screen-home');
  } else if (m) { hideModals(); }
}

/* ============================== HELPERS ============================== */
function rr(c, x, y, w, h, rad) {
  c.beginPath();
  c.moveTo(x + rad, y);
  c.arcTo(x + w, y, x + w, y + h, rad);
  c.arcTo(x + w, y + h, x, y + h, rad);
  c.arcTo(x, y + h, x, y, rad);
  c.arcTo(x, y, x + w, y, rad);
  c.closePath();
}
function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, 6.2832); }
function hash2(r, cNum, s) {
  var h = (r * 374761393 + cNum * 668265263 + s * 974634) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function lerp(a, b, t) { return a + (b - a) * t; }

/* ============================== WORLD THEMES ==============================
   Each world reskins the board (grass/water/rock) and the screen backdrops.
   Levels carry a `theme` id (set by build_levels.py from levels_src.py); we
   fall back to 'garden' for any level missing one. */
var WORLD_THEMES = {
  garden: {
    label: 'Garden Path',
    grassA: '#93d653', grassB: '#87c94b',
    flowers: ['#ffffff', '#ffd6e7', '#fff3b0'],
    water: '#3fa9e8', waterFoam: 'rgba(255,255,255,.45)',
    rockFill: '#a8b2bc', rockStroke: '#7d8894',
    gameBg: 'linear-gradient(180deg,#2f7d33 0%,#256428 70%,#1c4f20 100%)',
    levelsBg: 'linear-gradient(180deg,#57a047 0%,#3c7f33 60%,#2c5f27 100%)'
  },
  riverbank: {
    label: 'Riverbank',
    grassA: '#6fc9a8', grassB: '#5fb897',
    flowers: ['#ffffff', '#dbe9ff', '#cdeaff'],
    water: '#2f8fd1', waterFoam: 'rgba(255,255,255,.55)',
    rockFill: '#93a6ad', rockStroke: '#62767d',
    gameBg: 'linear-gradient(180deg,#1f6b73 0%,#184f57 70%,#123a40 100%)',
    levelsBg: 'linear-gradient(180deg,#2f8f8a 0%,#22706c 60%,#1a5450 100%)'
  },
  orchard: {
    label: 'Orchard Dusk',
    grassA: '#a8ab3e', grassB: '#989a36',
    flowers: ['#fff3b0', '#ffd7a8', '#ffe9c7'],
    water: '#4a6fb0', waterFoam: 'rgba(255,235,205,.5)',
    rockFill: '#b0a08a', rockStroke: '#7d6a52',
    gameBg: 'linear-gradient(180deg,#6b3f6f 0%,#4a2f5b 60%,#2f1f3f 100%)',
    levelsBg: 'linear-gradient(180deg,#8a5a3f 0%,#6b4530 60%,#4a2f1f 100%)'
  },
  frost: {
    label: 'Frost Hollow',
    grassA: '#dceefb', grassB: '#cbe3f6', // "grass" here is snow
    flowers: ['#ffffff', '#e8f6ff', '#bfe3ff'], // sparkle flecks, not flowers
    water: '#1f6fae', waterFoam: 'rgba(220,245,255,.6)',
    rockFill: '#9fb3c8', rockStroke: '#5f7488',
    ice: '#bfe6f7', iceShine: 'rgba(255,255,255,.75)', iceEdge: '#7fb8d8',
    gameBg: 'linear-gradient(180deg,#2b4f66 0%,#1d3a4d 70%,#132836 100%)',
    levelsBg: 'linear-gradient(180deg,#3d6a86 0%,#2c5068 60%,#1c3646 100%)'
  },
  tunnels: {
    label: 'Tunnel Warrens',
    grassA: '#5a4a6b', grassB: '#50415f', // cavern floor, not grass
    flowers: ['#ffe27a', '#c9a6ff', '#7fe8d0'], // glowing crystal flecks
    water: '#2e3f8f', waterFoam: 'rgba(200,220,255,.5)',
    rockFill: '#3a2f4a', rockStroke: '#241c30',
    oneway: '#8a6fd8', onewayGlow: 'rgba(180,150,255,.55)',
    // per-pair teleport colors (cycles if a level ever used more than 4 pairs)
    teleport: ['#ff6fae', '#4fd8ff', '#ffcf4f', '#6fff9e'],
    gameBg: 'linear-gradient(180deg,#241a33 0%,#181026 70%,#0f0a1a 100%)',
    levelsBg: 'linear-gradient(180deg,#3a2a50 0%,#2a1e3d 60%,#1a1229 100%)'
  },
  nightshade: {
    label: 'Nightshade Grove',
    grassA: '#3a2540', grassB: '#332038',
    flowers: ['#ff6fae', '#9d4edd', '#5fe8c0'], // glowing nightshade blooms
    water: '#1a0f2e', waterFoam: 'rgba(200,160,255,.4)',
    rockFill: '#2b1f38', rockStroke: '#1a1224',
    hazColor: '#7c1f3d', hazGlow: 'rgba(255,60,90,.55)', hazEye: '#ff3355',
    gameBg: 'linear-gradient(180deg,#1a0f26 0%,#120a1c 70%,#0a0612 100%)',
    levelsBg: 'linear-gradient(180deg,#2a1a38 0%,#1d1228 60%,#120a1a 100%)'
  },
  summit: {
    label: "Worm's Summit",
    grassA: '#e8eef5', grassB: '#dbe4ef', // wind-scoured mountaintop snow
    flowers: ['#7fe8ff', '#c9a6ff', '#ffe27a'], // aurora-glint sparkle, not flowers
    water: '#1f3a63', waterFoam: 'rgba(200,230,255,.55)',
    rockFill: '#5c6a7d', rockStroke: '#39424f',
    ice: '#d8f0ff', iceShine: 'rgba(255,255,255,.85)', iceEdge: '#8fc4e8',
    oneway: '#5fa8ff', onewayGlow: 'rgba(140,190,255,.55)',
    teleport: ['#ff6fae', '#4fd8ff', '#ffcf4f', '#6fff9e'],
    hazColor: '#7c1f3d', hazGlow: 'rgba(255,60,90,.55)', hazEye: '#ff3355',
    gameBg: 'linear-gradient(180deg,#12233d 0%,#0c1a2e 70%,#08111f 100%)',
    levelsBg: 'linear-gradient(180deg,#1c3a5e 0%,#152c48 60%,#0e1f33 100%)'
  }
};
function themeFor(def) { return WORLD_THEMES[(def && def.theme) || 'garden']; }
function worldsInOrder() {
  var seen = {}, out = [];
  LEVELS.forEach(function (d) {
    if (!seen[d.world]) { seen[d.world] = true; out.push({ world: d.world, theme: d.theme || 'garden' }); }
  });
  return out;
}
var themeMeta = null;
function applyScreenTheme(theme) {
  var key = WORLD_THEMES[theme] ? theme : 'garden';
  var t = WORLD_THEMES[key];
  el('screen-game').style.background = t.gameBg;
  el('screen-levels').style.background = t.levelsBg;
  // data-theme drives the decorative background flourishes in styles.css
  // (radial-gradient sparkles/blooms behind the path and board) - see the
  // "SCREEN FLAVOR" block there.
  el('screen-game').setAttribute('data-theme', key);
  el('screen-levels').setAttribute('data-theme', key);
  // Match the mobile browser/status-bar tint to the world being shown.
  if (!themeMeta) themeMeta = document.querySelector('meta[name="theme-color"]');
  var m = /#[0-9a-f]{6}/i.exec(t.gameBg);
  if (themeMeta && m) themeMeta.setAttribute('content', m[0]);
}

// dust kicked up behind Wally on each step, per world
var DUST = { garden: '#8d5f33', riverbank: '#7d6b4f', orchard: '#8a6534', frost: '#ffffff',
             tunnels: '#b9a4dc', nightshade: '#a883c0', summit: '#ffffff' };
for (var dk in DUST) if (WORLD_THEMES[dk]) WORLD_THEMES[dk].dust = DUST[dk];
var WORLD_ICON = { garden: 'ic-w-garden', riverbank: 'ic-w-riverbank', orchard: 'ic-w-orchard', frost: 'ic-w-frost',
                   tunnels: 'ic-w-tunnels', nightshade: 'ic-w-nightshade', summit: 'ic-w-summit' };

/* ============================== WALLY: FACE & EXPRESSIONS ==============================
   Wally's whole personality lives in drawHead. The face is drawn in a
   local frame rotated so he always "looks" along +y, which keeps every
   expression simple to author; things that obey gravity (sweat, stink,
   hats) are drawn upright in screen space.
   Moods: normal, eating, worried, happy, ecstatic, phew, sad, tired, meh,
   annoyed, confused, sleepy, dizzy, sick.
   o (optional): look [x,y] pupil direction in screen space (length 0-1),
   squash [along, across] relative to facing, tilt (radians), hat id,
   lids 0-1, big (pupil scale). */
var blinkUntil = 0, nextBlink = 1500;
function manageBlink(t) {
  if (t > nextBlink) { blinkUntil = t + 130; nextBlink = t + 2200 + Math.random() * 2600; }
}
var INK = '#26221f', MOUTH = '#7a2b2b';
function drawHead(c, x, y, r, fx, fy, mood, t, o) {
  o = o || {};
  var sick = mood === 'sick';
  var fill = sick ? '#a9d18e' : '#ff8fab', edge = sick ? '#6b9e5a' : '#c94f7c';
  var blinking = t < blinkUntil && !o.noBlink;
  c.save();
  c.translate(x, y);
  if (o.squash) { var sa = Math.atan2(fy, fx); c.rotate(sa); c.scale(o.squash[0], o.squash[1]); c.rotate(-sa); }
  if (o.tilt) c.rotate(o.tilt);
  // head ball + soft top-left sheen
  c.fillStyle = fill; c.strokeStyle = edge; c.lineWidth = Math.max(2, r * 0.10);
  circle(c, 0, 0, r); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.22)';
  c.beginPath(); c.ellipse(-r * 0.3, -r * 0.44, r * 0.32, r * 0.18, -0.5, 0, 6.2832); c.fill();

  // ---- face, in the local frame (looking along +y) ----
  c.save();
  c.rotate(Math.atan2(-fx, fy));
  var er = r * 0.30, ex = r * 0.36, ey = r * 0.16, my = r * 0.52;
  var lk = o.look || [fx, fy];
  var lx = lk[0] * fy - lk[1] * fx, ly = lk[0] * fx + lk[1] * fy; // look -> local
  var lw = Math.max(2, r * 0.075);
  c.lineCap = 'round'; c.lineJoin = 'round';
  function white(cx, s) {
    c.fillStyle = '#fff';
    if (blinking) { c.beginPath(); c.ellipse(cx, ey, er * s, er * s * 0.16, 0, 0, 6.2832); c.fill(); return false; }
    circle(c, cx, ey, er * s); c.fill(); return true;
  }
  function pupil(cx, s, pr) {
    var qx = cx + lx * er * s * 0.42, qy = ey + ly * er * s * 0.42;
    c.fillStyle = INK; circle(c, qx, qy, pr); c.fill();
    c.fillStyle = 'rgba(255,255,255,.85)'; circle(c, qx - pr * 0.32, qy - pr * 0.32, pr * 0.36); c.fill();
  }
  function eyes(prScale, s1, s2) {
    s1 = s1 || 1; s2 = s2 || 1;
    var pr = er * 0.48 * (prScale || 1) * (o.big || 1);
    if (white(-ex, s1)) pupil(-ex, s1, pr * s1);
    if (white(ex, s2)) pupil(ex, s2, pr * s2);
  }
  function lids(amt) { // upper lids, in head colour, over the top 'amt' of each eye
    if (amt <= 0 || blinking) return;
    [-ex, ex].forEach(function (cx) {
      c.save(); circle(c, cx, ey, er * 1.04); c.clip();
      c.fillStyle = fill; c.fillRect(cx - er * 1.1, ey - er * 1.1, er * 2.2, er * 2.2 * amt);
      c.restore();
      c.strokeStyle = edge; c.lineWidth = lw * 0.8;
      var yy = ey - er + er * 2 * amt, hw = Math.sqrt(Math.max(0, er * er - (yy - ey) * (yy - ey)));
      c.beginPath(); c.moveTo(cx - hw, yy); c.lineTo(cx + hw, yy); c.stroke();
    });
  }
  // brows: inner end up (sad/worried, dir=1) or down (angry, dir=-1)
  function brows(dir, lift) {
    c.strokeStyle = '#8a3354'; c.lineWidth = lw;
    var by = ey - er * (1.45 + (lift || 0)), d = er * 0.35 * dir;
    c.beginPath();
    c.moveTo(-ex - er * 0.75, by + d); c.lineTo(-ex + er * 0.7, by - d);
    c.moveTo(ex + er * 0.75, by + d); c.lineTo(ex - er * 0.7, by - d);
    c.stroke();
  }
  function arches() { // closed, happy eyes
    c.strokeStyle = INK; c.lineWidth = Math.max(2.5, r * 0.09);
    c.beginPath(); c.arc(-ex, ey + er * 0.25, er * 0.75, Math.PI * 1.12, Math.PI * 1.88); c.stroke();
    c.beginPath(); c.arc(ex, ey + er * 0.25, er * 0.75, Math.PI * 1.12, Math.PI * 1.88); c.stroke();
  }
  function blush(a) {
    c.fillStyle = 'rgba(255,90,120,' + (a || 0.35) + ')';
    c.beginPath(); c.ellipse(-r * 0.62, r * 0.42, r * 0.14, r * 0.08, 0, 0, 6.2832); c.fill();
    c.beginPath(); c.ellipse(r * 0.62, r * 0.42, r * 0.14, r * 0.08, 0, 0, 6.2832); c.fill();
  }
  function smile(w) { c.strokeStyle = '#a34a68'; c.lineWidth = lw; c.beginPath(); c.arc(0, my - r * 0.06, r * (w || 0.2), Math.PI * 0.18, Math.PI * 0.82); c.stroke(); }
  function bigSmile() { c.fillStyle = MOUTH; c.beginPath(); c.arc(0, my - r * 0.05, r * 0.30, Math.PI * 0.08, Math.PI * 0.92); c.closePath(); c.fill();
    c.fillStyle = '#ff6f8f'; c.beginPath(); c.ellipse(0, my + r * 0.13, r * 0.13, r * 0.07, 0, 0, 6.2832); c.fill(); }
  function frown() { c.strokeStyle = '#7a2b4b'; c.lineWidth = lw; c.beginPath(); c.arc(0, my + r * 0.16, r * 0.18, Math.PI * 1.2, Math.PI * 1.8); c.stroke(); }
  function flat(tiltAmt) { c.strokeStyle = '#7a2b4b'; c.lineWidth = lw; c.beginPath(); c.moveTo(-r * 0.14, my + (tiltAmt || 0)); c.lineTo(r * 0.14, my - (tiltAmt || 0)); c.stroke(); }
  function oMouth() { c.strokeStyle = MOUTH; c.lineWidth = lw; circle(c, 0, my, r * 0.12); c.stroke(); }
  function xEye(cx) {
    c.strokeStyle = INK; c.lineWidth = Math.max(2, r * 0.07);
    var q = er * 0.7;
    c.beginPath(); c.moveTo(cx - q, ey - q); c.lineTo(cx + q, ey + q); c.moveTo(cx + q, ey - q); c.lineTo(cx - q, ey + q); c.stroke();
  }
  function starEye(cx) {
    var sr = er * 1.05;
    c.fillStyle = '#ffd54f'; c.strokeStyle = '#d99400'; c.lineWidth = Math.max(1.5, r * 0.04);
    c.beginPath();
    for (var i = 0; i < 10; i++) {
      var ang = -Math.PI / 2 + i * Math.PI / 5 + Math.sin(t / 300) * 0.15, rad = i % 2 ? sr * 0.45 : sr;
      c.lineTo(cx + Math.cos(ang) * rad, ey + Math.sin(ang) * rad);
    }
    c.closePath(); c.fill(); c.stroke();
  }

  switch (mood) {
    case 'dizzy': case 'sick':
      c.fillStyle = '#fff'; circle(c, -ex, ey, er); c.fill(); circle(c, ex, ey, er); c.fill();
      xEye(-ex); xEye(ex); oMouth(); break;
    case 'happy': arches(); bigSmile(); blush(); break;
    case 'ecstatic': starEye(-ex); starEye(ex); bigSmile(); blush(0.45); break;
    case 'phew': arches(); brows(1, 0.1); smile(0.16); blush(0.25); break;
    case 'sad': eyes(0.9); brows(1); frown(); break;
    case 'tired': eyes(0.8); lids(0.45); brows(1); frown(); break;
    case 'meh': eyes(0.85); lids(0.5); flat(); break;
    case 'annoyed': eyes(0.7); lids(0.28); brows(-1); flat(r * 0.03); break;
    case 'confused':
      eyes(1, 1.18, 0.82); c.strokeStyle = '#8a3354'; c.lineWidth = lw;
      c.beginPath(); c.moveTo(-ex - er * 0.8, ey - er * 1.9); c.quadraticCurveTo(-ex, ey - er * 2.35, -ex + er * 0.8, ey - er * 1.8); c.stroke();
      c.strokeStyle = '#7a2b4b'; c.beginPath();
      for (var q = 0; q <= 8; q++) { var qx = -r * 0.16 + q * r * 0.04, qy = my + Math.sin(q * 1.4) * r * 0.035; if (q) c.lineTo(qx, qy); else c.moveTo(qx, qy); }
      c.stroke(); break;
    case 'sleepy':
      c.strokeStyle = INK; c.lineWidth = Math.max(2, r * 0.08);
      c.beginPath(); c.arc(-ex, ey - er * 0.2, er * 0.6, Math.PI * 0.15, Math.PI * 0.85); c.stroke();
      c.beginPath(); c.arc(ex, ey - er * 0.2, er * 0.6, Math.PI * 0.15, Math.PI * 0.85); c.stroke();
      c.fillStyle = MOUTH; c.beginPath(); c.ellipse(0, my + r * 0.02, r * 0.07, r * 0.09 + Math.sin(t / 700) * r * 0.02, 0, 0, 6.2832); c.fill();
      break;
    case 'worried': eyes(0.66); brows(1, 0.05);
      c.strokeStyle = '#5a2b2b'; c.lineWidth = lw; c.beginPath(); c.moveTo(-r * 0.14, my); c.quadraticCurveTo(0, my + r * 0.12, r * 0.14, my); c.stroke(); break;
    case 'eating': eyes(); c.fillStyle = MOUTH; c.beginPath(); c.ellipse(0, my, r * 0.20, r * 0.28, 0, 0, 6.2832); c.fill(); break;
    default: eyes(); if (o.lids) lids(o.lids); smile();
  }
  if (o.hat === 'shades' && mood !== 'dizzy' && mood !== 'sick') drawShades(c, ex, ey, er, r);
  if (mood === 'sad' && !blinking) { // one tear, sliding
    var tp = (t / 1400) % 1;
    c.fillStyle = 'rgba(126,200,247,' + (1 - tp) + ')';
    var tx = -ex - er * 0.6, ty = ey + er * 0.8 + tp * r * 0.5;
    c.beginPath(); c.moveTo(tx, ty - r * 0.09); c.quadraticCurveTo(tx + r * 0.07, ty + r * 0.03, tx, ty + r * 0.07);
    c.quadraticCurveTo(tx - r * 0.07, ty + r * 0.03, tx, ty - r * 0.09); c.fill();
  }
  c.restore();

  // ---- upright extras ----
  if (mood === 'worried' || mood === 'phew' || mood === 'tired') { // sweat drop
    var dy = ((t / 9) % (r * 1.2));
    var sx2 = r * 0.95, sy2 = -r * 0.95 + dy;
    c.fillStyle = 'rgba(126,200,247,.9)';
    c.beginPath(); c.moveTo(sx2, sy2 - r * 0.16);
    c.quadraticCurveTo(sx2 + r * 0.14, sy2 + r * 0.06, sx2, sy2 + r * 0.14);
    c.quadraticCurveTo(sx2 - r * 0.14, sy2 + r * 0.06, sx2, sy2 - r * 0.16); c.fill();
  }
  if (sick) {
    c.strokeStyle = 'rgba(90,90,90,.7)'; c.lineWidth = Math.max(2, r * 0.06);
    for (var sI = 0; sI < 3; sI++) {
      var stx = -r * 0.5 + sI * r * 0.5;
      c.beginPath(); c.moveTo(stx, -r * 1.15);
      c.quadraticCurveTo(stx + Math.sin(t / 280 + sI) * r * 0.2, -r * 1.5, stx, -r * 1.8); c.stroke();
    }
  }
  if (o.hat) drawHat(c, o.hat, r, t, fy < -0.5);
  c.restore();
}

/* ---- wardrobe: hats Wally wears in the actual game ---- */
var HATS = [
  { id: 'none',    name: 'Classic Wally',   stars: 0 },
  { id: 'flower',  name: 'Daisy Wally',     stars: 6 },
  { id: 'party',   name: 'Party Wally',     stars: 15 },
  { id: 'top',     name: 'Top Hat Wally',   stars: 30 },
  { id: 'shades',  name: 'Cool Wally',      stars: 50 },
  { id: 'cowboy',  name: 'Cowboy Wally',    stars: 75 },
  { id: 'crown',   name: 'King Wally',      stars: 120 },
  { id: 'pumpkin', name: 'Halloween Wally', month: 9,  label: 'October' },
  { id: 'santa',   name: 'Holiday Wally',   month: 11, label: 'December' }
];
function hatById(id) { for (var i = 0; i < HATS.length; i++) if (HATS[i].id === id) return HATS[i]; return HATS[0]; }
function hatUnlocked(h, stars) {
  if (h.month !== undefined) return new Date().getMonth() === h.month || !!(save.seasonal && save.seasonal[h.id]);
  return (stars === undefined ? totalStars() : stars) >= h.stars;
}
function drawShades(c, ex, ey, er, r) {
  c.fillStyle = '#1d1b22';
  [-ex, ex].forEach(function (cx) { rr(c, cx - er * 1.2, ey - er * 0.95, er * 2.4, er * 1.8, er * 0.6); c.fill(); });
  c.strokeStyle = '#1d1b22'; c.lineWidth = Math.max(2, r * 0.07);
  c.beginPath(); c.moveTo(-ex + er * 1.1, ey - er * 0.4); c.lineTo(ex - er * 1.1, ey - er * 0.4); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.5)';
  [-ex, ex].forEach(function (cx) { c.beginPath(); c.ellipse(cx - er * 0.45, ey - er * 0.4, er * 0.32, er * 0.16, -0.4, 0, 6.2832); c.fill(); });
}
function drawHat(c, id, r, t, faceUp) {
  if (!id || id === 'none' || id === 'shades') return;
  c.save();
  c.translate(0, -r * (faceUp ? 0.86 : 0.74));
  var lw = Math.max(1.5, r * 0.06);
  c.lineJoin = 'round'; c.lineCap = 'round';
  switch (id) {
    case 'top':
      c.fillStyle = '#26221f';
      rr(c, -r * 0.44, -r * 0.92, r * 0.88, r * 0.9, r * 0.1); c.fill();
      c.fillStyle = '#e04a5f'; c.fillRect(-r * 0.44, -r * 0.3, r * 0.88, r * 0.16);
      c.fillStyle = '#26221f'; c.beginPath(); c.ellipse(0, 0, r * 0.8, r * 0.15, 0, 0, 6.2832); c.fill();
      c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(-r * 0.32, -r * 0.86, r * 0.1, r * 0.5);
      break;
    case 'cowboy':
      c.fillStyle = '#a8672e'; c.strokeStyle = '#6b3f1a'; c.lineWidth = lw;
      c.beginPath(); c.moveTo(-r * 0.4, 0); c.bezierCurveTo(-r * 0.46, -r * 0.7, -r * 0.2, -r * 0.8, 0, -r * 0.62);
      c.bezierCurveTo(r * 0.2, -r * 0.8, r * 0.46, -r * 0.7, r * 0.4, 0); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#6b3f1a'; c.fillRect(-r * 0.42, -r * 0.2, r * 0.84, r * 0.13);
      c.fillStyle = '#b8743a';
      c.beginPath(); c.moveTo(-r * 1.02, -r * 0.2); c.quadraticCurveTo(-r * 0.6, r * 0.14, 0, r * 0.1);
      c.quadraticCurveTo(r * 0.6, r * 0.14, r * 1.02, -r * 0.2); c.quadraticCurveTo(r * 0.6, -r * 0.02, 0, -r * 0.02);
      c.quadraticCurveTo(-r * 0.6, -r * 0.02, -r * 1.02, -r * 0.2); c.fill(); c.stroke();
      break;
    case 'party':
      c.rotate(0.18);
      c.save();
      c.beginPath(); c.moveTo(-r * 0.42, 0); c.lineTo(0, -r * 1.1); c.lineTo(r * 0.42, 0); c.closePath();
      c.fillStyle = '#7ec8f7'; c.fill(); c.clip();
      c.strokeStyle = '#ffd54f'; c.lineWidth = r * 0.12;
      for (var k = -3; k < 4; k++) { c.beginPath(); c.moveTo(-r, -r * 0.2 + k * r * 0.3); c.lineTo(r, -r * 0.7 + k * r * 0.3); c.stroke(); }
      c.restore();
      c.fillStyle = '#ff8fab'; circle(c, 0, -r * 1.12, r * 0.14); c.fill();
      break;
    case 'crown':
      c.fillStyle = '#ffc93c'; c.strokeStyle = '#b8860b'; c.lineWidth = lw;
      c.beginPath(); c.moveTo(-r * 0.5, 0); c.lineTo(-r * 0.56, -r * 0.55); c.lineTo(-r * 0.26, -r * 0.3);
      c.lineTo(0, -r * 0.7); c.lineTo(r * 0.26, -r * 0.3); c.lineTo(r * 0.56, -r * 0.55); c.lineTo(r * 0.5, 0); c.closePath();
      c.fill(); c.stroke();
      c.fillStyle = '#e04a5f'; circle(c, 0, -r * 0.16, r * 0.09); c.fill();
      c.fillStyle = '#4fb8ff'; circle(c, -r * 0.3, -r * 0.12, r * 0.06); c.fill(); circle(c, r * 0.3, -r * 0.12, r * 0.06); c.fill();
      var tw = 0.5 + 0.5 * Math.sin(t / 320);
      c.fillStyle = 'rgba(255,255,255,' + (0.4 + 0.6 * tw) + ')'; circle(c, 0, -r * 0.72, r * 0.05 * (1 + tw)); c.fill();
      break;
    case 'flower':
      c.translate(r * 0.46, r * 0.08);
      c.fillStyle = '#fff';
      for (var pI = 0; pI < 6; pI++) { var pa = pI / 6 * 6.2832 + 0.3; c.beginPath(); c.ellipse(Math.cos(pa) * r * 0.16, Math.sin(pa) * r * 0.16, r * 0.14, r * 0.08, pa, 0, 6.2832); c.fill(); }
      c.fillStyle = '#ffcf3f'; circle(c, 0, 0, r * 0.11); c.fill();
      break;
    case 'pumpkin':
      c.fillStyle = '#ff8a1c'; c.strokeStyle = '#c55f00'; c.lineWidth = lw;
      c.beginPath(); c.ellipse(-r * 0.22, -r * 0.28, r * 0.26, r * 0.3, 0, 0, 6.2832); c.fill(); c.stroke();
      c.beginPath(); c.ellipse(r * 0.22, -r * 0.28, r * 0.26, r * 0.3, 0, 0, 6.2832); c.fill(); c.stroke();
      c.beginPath(); c.ellipse(0, -r * 0.3, r * 0.26, r * 0.33, 0, 0, 6.2832); c.fill(); c.stroke();
      c.strokeStyle = '#4c7a2a'; c.lineWidth = lw * 1.6; c.beginPath(); c.moveTo(0, -r * 0.6); c.quadraticCurveTo(r * 0.04, -r * 0.8, r * 0.16, -r * 0.84); c.stroke();
      break;
    case 'santa':
      c.fillStyle = '#e0303f';
      c.beginPath(); c.moveTo(-r * 0.5, -r * 0.05); c.quadraticCurveTo(-r * 0.2, -r * 1.1, r * 0.55, -r * 0.7);
      c.quadraticCurveTo(r * 0.25, -r * 0.45, r * 0.5, -r * 0.05); c.closePath(); c.fill();
      c.fillStyle = '#fff'; rr(c, -r * 0.58, -r * 0.18, r * 1.16, r * 0.24, r * 0.12); c.fill();
      circle(c, r * 0.6, -r * 0.7, r * 0.14); c.fill();
      break;
  }
  c.restore();
}

/* ============================== HOME ==============================
   The home screen is the illustrated artwork (CSS background). It's
   decoded up front so the loading screen can wait for it: the first thing
   a player sees is the finished picture, never a half-loaded one. */
var homeArt = new Image();
homeArt.src = ASSETS.homeArt;

function totalStars() {
  var total = 0;
  for (var i = 0; i < LEVELS.length; i++) total += save.stars[i] || 0;
  return total;
}
// Home: "Play" becomes "Continue" once there's progress (and resumes a
// level left mid-play); the footer shows campaign completion.
function updateHome() {
  var next = Math.min(save.unlocked, LEVELS.length);
  var res = validResume();
  var sub = res ? 'Level ' + (res.level + 1) + ' · pick up where you left off' : (save.unlocked > 1 ? 'Level ' + next : '');
  el('play-sub').textContent = sub;
  el('btn-play').querySelector('.btn-main').textContent = (save.unlocked > 1 || res) ? 'Continue' : 'Play';
  var total = totalStars(), max = LEVELS.length * 3;
  el('home-progress').innerHTML = total > 0
    ? starSvg() + '<span>' + total + ' / ' + max + '</span><span class="track"><i style="width:' + (100 * total / max).toFixed(1) + '%"></i></span>'
    : '';
}

/* ============================== LEVEL MAP ==============================
   Each world is a winding tunnel. Levels sit along it; Wally stands at the
   level you're up to, and after you clear one he wriggles along the
   tunnel to the next the moment you come back to the map. */
function starsHtml(n) {
  var s = '';
  for (var i = 0; i < 3; i++) s += starSvg(i < n ? '' : 'off');
  return s;
}
var WORLDS = worldsInOrder(); // [{world, theme}, ...] in level order, de-duped
var worldPage = 0;
function pageForLevel(i) {
  var w = LEVELS[i].world;
  for (var p = 0; p < WORLDS.length; p++) if (WORLDS[p].world === w) return p;
  return 0;
}
function renderLevels() {
  el('total-stars').innerHTML = starSvg() + totalStars() + '/' + (LEVELS.length * 3);
  drawLevelPage(0);
}
// The level the player should play next: the newest unlocked level, as
// long as it hasn't been cleared yet (after the finale there isn't one).
function frontierLevel() {
  var i = Math.min(save.unlocked, LEVELS.length) - 1;
  return save.stars[i] ? -1 : i;
}
// Where Wally stands on the map: the frontier, or the finale once it's all done.
function wallyLevel() { var f = frontierLevel(); return f < 0 ? LEVELS.length - 1 : f; }

var MAP_ROW = 94, MAP_TOP = 64;
var mapState = { pts: [], idx: [], av: null, avc: null, pos: { x: 0, y: 0 }, face: [0, 1], travel: null, W: 0 };
function mapPt(k, W) {
  var amp = Math.min(W * 0.26, 118);
  return { x: W / 2 + Math.sin(k * 1.2 + 0.5) * amp, y: MAP_TOP + k * MAP_ROW };
}
// point on the S-curve between node a and node b (p = 0..1)
function segPt(a, b, p) {
  var my = (a.y + b.y) / 2, u = 1 - p;
  return { x: u * u * u * a.x + 3 * u * u * p * a.x + 3 * u * p * p * b.x + p * p * p * b.x,
           y: u * u * u * a.y + 3 * u * u * p * my + 3 * u * p * p * my + p * p * p * b.y };
}
// Wally's resting spot for node k: just up the tunnel from its marker
function restPt(k) {
  var P = mapState.pts;
  if (k > 0) return segPt(P[k - 1], P[k], 0.7);
  return { x: P[0].x, y: P[0].y - MAP_ROW * 0.5 };
}
function drawLevelPage(dir) {
  var page = WORLDS[worldPage];
  el('world-title').textContent = page.world;
  el('world-icon').innerHTML = '<use href="#' + (WORLD_ICON[page.theme] || 'ic-w-garden') + '"/>';
  el('world-prev').disabled = worldPage <= 0;
  el('world-next').disabled = worldPage >= WORLDS.length - 1;
  applyScreenTheme(page.theme);

  var dots = '';
  for (var d = 0; d < WORLDS.length; d++) dots += '<i class="' + (d === worldPage ? 'on' : '') + '"></i>';
  el('world-dots').innerHTML = dots;

  var wrap = el('level-path');
  var W = Math.min(520, wrap.clientWidth || 360);
  var frontier = frontierLevel(), got = 0;
  var idx = [];
  LEVELS.forEach(function (def, i) { if (def.world === page.world) idx.push(i); });
  var pts = idx.map(function (_, k) { return mapPt(k, W); });
  mapState.pts = pts; mapState.idx = idx; mapState.W = W;
  var H = MAP_TOP + (idx.length - 1) * MAP_ROW + 90;

  var map = document.createElement('div');
  map.className = 'map';
  map.style.width = W + 'px'; map.style.height = H + 'px';

  // tunnel: bed, floor, and a dotted trail over the part already travelled
  var dPath = 'M' + pts[0].x.toFixed(1) + ' ' + (pts[0].y - MAP_ROW * 0.6).toFixed(1) + ' L' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
  var doneTo = -1;
  for (var k = 1; k < pts.length; k++) {
    var a = pts[k - 1], b = pts[k], my = ((a.y + b.y) / 2).toFixed(1);
    dPath += ' C' + a.x.toFixed(1) + ' ' + my + ' ' + b.x.toFixed(1) + ' ' + my + ' ' + b.x.toFixed(1) + ' ' + b.y.toFixed(1);
  }
  for (var k2 = 0; k2 < idx.length; k2++) if (save.stars[idx[k2]]) doneTo = k2;
  var dDone = '';
  if (doneTo >= 0) {
    dDone = 'M' + pts[0].x.toFixed(1) + ' ' + (pts[0].y - MAP_ROW * 0.6).toFixed(1) + ' L' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
    var lastDone = Math.min(pts.length - 1, doneTo + 1);
    for (var k3 = 1; k3 <= lastDone; k3++) {
      var a3 = pts[k3 - 1], b3 = pts[k3], my3 = ((a3.y + b3.y) / 2).toFixed(1);
      dDone += ' C' + a3.x.toFixed(1) + ' ' + my3 + ' ' + b3.x.toFixed(1) + ' ' + my3 + ' ' + b3.x.toFixed(1) + ' ' + b3.y.toFixed(1);
    }
  }
  map.innerHTML = '<svg class="tunnel" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
    '<path class="tun-bed" d="' + dPath + '"/><path class="tun-floor" d="' + dPath + '"/>' +
    (dDone ? '<path class="tun-done" d="' + dDone + '"/>' : '') + '</svg>';

  idx.forEach(function (i, k) {
    var def = LEVELS[i];
    var stars = save.stars[i] || 0;
    got += stars;
    var locked = (i + 1) > save.unlocked;
    var b = document.createElement('button');
    b.className = 'lvl-node' + (locked ? ' locked' : '') + (i === frontier ? ' current' : '') + (stars === 3 ? ' perfect' : '');
    b.style.left = (pts[k].x - 37) + 'px'; b.style.top = (pts[k].y - 31) + 'px';
    b.title = def.name || '';
    b.dataset.level = i;
    b.setAttribute('aria-label', 'Level ' + (i + 1) + (def.name ? ', ' + def.name : '') +
      (locked ? ', locked' : ', ' + stars + ' of 3 stars'));
    b.innerHTML = '<span class="lvl-dot">' + (locked ? '<svg class="ic ic-sm"><use href="#ic-lock"/></svg>' : (i + 1)) +
      '</span><span class="lvl-stars">' + starsHtml(stars) + '</span>';
    if (locked) b.disabled = true;
    else b.addEventListener('click', function () { audioGesture(); Sfx.click(); playFromMap(i); });
    map.appendChild(b);
  });

  // Wally on the map
  var av = document.createElement('canvas');
  av.className = 'map-avatar';
  var dpr = Math.min(2, window.devicePixelRatio || 1);
  av.width = 64 * dpr; av.height = 64 * dpr;
  map.appendChild(av);
  mapState.av = av; mapState.avc = av.getContext('2d'); mapState.avc.setTransform(dpr, 0, 0, dpr, 0, 0);
  mapState.travel = null;
  var wl = wallyLevel(), wk = idx.indexOf(wl);
  av.style.display = wk < 0 ? 'none' : '';
  var focusY = 0;
  if (wk >= 0) {
    var fromK = idx.indexOf(save.mapFrontier);
    if (save.mapFrontier >= 0 && save.mapFrontier < wl && fromK >= 0 && fromK < wk && !reducedMotion()) {
      startMapTravel(fromK, wk);
      focusY = (restPt(fromK).y + restPt(wk).y) / 2;
    } else {
      mapState.pos = restPt(wk); mapState.face = [0, 1];
      focusY = mapState.pos.y;
    }
    if (save.mapFrontier !== wl) { save.mapFrontier = wl; persistSoon(); }
  }

  wrap.innerHTML = '';
  wrap.appendChild(map);
  el('world-stars').innerHTML = starSvg() + got + ' / ' + (idx.length * 3);
  wrap.classList.remove('slide-l', 'slide-r');
  if (dir && !reducedMotion()) { void wrap.offsetWidth; wrap.classList.add(dir > 0 ? 'slide-l' : 'slide-r'); }
  wrap.scrollTop = focusY ? Math.max(0, focusY - wrap.clientHeight / 2 + 40) : 0;
  placeAvatar();
}
// Build the wriggle route from one resting spot to another, sampled into
// a polyline so the walk runs at an even speed along the curves.
function startMapTravel(k0, k1) {
  var P = mapState.pts, pts = [], s;
  var first = k0 > 0 ? [P[k0 - 1], P[k0], 0.7] : null;
  if (first) for (s = 0; s <= 8; s++) pts.push(segPt(first[0], first[1], 0.7 + 0.3 * s / 8));
  else { var r0 = restPt(0); for (s = 0; s <= 12; s++) pts.push({ x: r0.x, y: r0.y + (P[0].y - r0.y) * s / 12 }); }
  for (var k = k0; k < k1; k++) {
    var end = k === k1 - 1 ? 0.7 : 1;
    for (s = 1; s <= 24; s++) pts.push(segPt(P[k], P[k + 1], end * s / 24));
  }
  var lens = [0];
  for (var i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  var total = lens[lens.length - 1];
  mapState.travel = { pts: pts, lens: lens, total: total, t0: now() + 350, dur: Math.max(700, total * 6), k1: k1, lastPop: 0 };
  mapState.pos = pts[0]; mapState.face = [0, 1];
}
function placeAvatar() {
  var av = mapState.av;
  if (!av) return;
  av.style.transform = 'translate(' + (mapState.pos.x - 32).toFixed(1) + 'px,' + (mapState.pos.y - 40).toFixed(1) + 'px)';
}
function tickMap(t) {
  var av = mapState.av;
  if (!av || av.style.display === 'none') return;
  var tr = mapState.travel, moving = false;
  if (tr && t >= tr.t0) {
    var p = Math.min(1, (t - tr.t0) / tr.dur), d = easeInOut(p) * tr.total;
    var i = 1;
    while (i < tr.lens.length - 1 && tr.lens[i] < d) i++;
    var a = tr.pts[i - 1], b = tr.pts[i], seg = (tr.lens[i] - tr.lens[i - 1]) || 1, f = (d - tr.lens[i - 1]) / seg;
    mapState.pos = { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) };
    var dx = b.x - a.x, dy = b.y - a.y, dl = Math.hypot(dx, dy) || 1;
    mapState.face = [lerp(mapState.face[0], dx / dl, 0.2), lerp(mapState.face[1], dy / dl, 0.2)];
    moving = p < 1;
    if (moving && t - tr.lastPop > 170) { tr.lastPop = t; Sfx.move(); }
    if (p >= 1) {
      mapState.travel = null; mapState.face = [0, 1];
      Sfx.star(2); Haptics.pop();
      var node = document.querySelector('.lvl-node[data-level="' + mapState.idx[tr.k1] + '"]');
      if (node) node.classList.add('just-unlocked');
    }
    placeAvatar();
  }
  var c = mapState.avc;
  c.clearRect(0, 0, 64, 64);
  var fl = Math.hypot(mapState.face[0], mapState.face[1]) || 1, fx = mapState.face[0] / fl, fy = mapState.face[1] / fl;
  var bob = moving ? Math.abs(Math.sin(t / 90)) * 2 : Math.sin(t / 500) * 1.5;
  var hx = 32, hy = 40 - bob;
  // two body segments trailing behind
  c.fillStyle = '#ff9eb4'; c.strokeStyle = '#c94f7c'; c.lineWidth = 2;
  for (var s = 2; s >= 1; s--) {
    var wig = moving ? Math.sin(t / 70 + s) * 2 : 0;
    circle(c, hx - fx * s * 11 + fy * wig, hy - fy * s * 11 - fx * wig, 10 - s * 1.5); c.fill(); c.stroke();
  }
  drawHead(c, hx, hy, 13, fx, fy, moving ? 'normal' : 'happy', t,
           { hat: save.hat, squash: moving ? [1 + Math.abs(Math.sin(t / 90)) * 0.08, 1 - Math.abs(Math.sin(t / 90)) * 0.06] : null });
}
function goWorldPage(delta) {
  var next = worldPage + delta;
  if (next < 0 || next >= WORLDS.length) return;
  Sfx.click();
  worldPage = next;
  drawLevelPage(delta);
}
function goToLevels() {
  hideModals(); paused = false; Music.muffle(false);
  G = null; // leaving the level; its progress stays in save.resume
  // Stepping out of a shared (?level=) puzzle into the level map means the
  // visitor is choosing to explore the real game - discard whatever that
  // play changed in memory (stars, unlock, resume) and let saving resume.
  if (sharedPuzzle) restoreRealSave();
  sharedPuzzle = false;
  worldPage = pageForLevel(levelIdx); renderLevels(); show('screen-levels');
}

/* ============================== GAME STATE ============================== */
var cv, ctx, DPR = 1;
var G = null, levelIdx = 0;
var board = { ts: 40, ox: 0, oy: 0, w: 0, h: 0 };
// ha.idx = index into G.trail of the tile the head is currently gliding
// toward. The body is only drawn up to there, so during a multi-tile ice
// slide the trail can't visibly run out ahead of the animated head.
var ha = { x: 0, y: 0, tx: 0, ty: 0, t0: 0, dur: 105, active: false, idx: 0 };
// Patrol hazard's own cosmetic glide (one leg per input, so no queue).
var haz = { x: 0, y: 0, fx: 0, fy: 0, tx: 0, ty: 0, t0: 0, dur: 150, active: false, flash: 0 };
var moveQueue = [];
var headAnimQueue = []; // waypoints still to animate through for a multi-tile ice slide
var particles = [], popups = [], rings = [], ghosts = [], shake = null;
var appleFx = {};       // apple key -> { t0, kind: 'in' (pops back in on undo) | 'wobble' (tapped) }
var moodForced = 'normal', moodUntil = 0, eatUntil = 0, bumpAnim = null;
var modalOpen = false, paused = false, transitioning = false;
var lastTime = 0;
var DIRV = null; // built from Worm.DIRS at init
var curTheme = WORLD_THEMES.garden; // theme of the level in play (looked up once, not per tile per frame)
var introT0 = 0;                   // board "settle in" animation start
var shownScore = 0;                // HUD score counts up toward G.score
var MAX_TILE = 72;                 // cap so tiny boards don't blow up to giant tiles
var undoStack = [], acceptedMoves = '', undoCount = 0, rewind = null;
// How many undos a level allows. 1 matches the live game's "one undo per
// level" rule; set to Infinity for unlimited. Everything else (the undo
// button, Z/Backspace, the fail card's "Undo last move") follows from this.
var UNDO_LIMIT = 1;
function canUndo() { return undoStack.length > 0 && undoCount < UNDO_LIMIT; }
var attempts = {};                 // level -> failed/restarted runs this session (Wally reacts to effort)
var coach = null;                  // first-level coaching state

/* Wally's live animation state: smoothed facing and gaze, move squash,
   landing bounce, idle behaviour, taps, and the occasional butterfly. */
var wally = {
  face: [0, 1], look: [0, 1], sq: null, land: 0, lastInput: 0,
  taps: 0, tapT: 0, giggle: 0, bumps: [], idle: 'none',
  butterfly: null, bfLucky: false, winT: 0, tier: 'happy'
};
function resetWally() {
  var t = now();
  wally.face = [DIRV[G.facing][0], DIRV[G.facing][1]]; wally.look = wally.face.slice();
  wally.sq = null; wally.land = 0; wally.lastInput = t; wally.taps = 0; wally.giggle = 0;
  wally.bumps = []; wally.idle = 'none'; wally.butterfly = null; wally.winT = 0; wally.tier = 'happy';
  wally.bfLucky = Math.random() < 0.35; // one visitor, on roughly a third of levels
}
function noteInput() {
  wally.lastInput = now();
  var bf = wally.butterfly;
  if (bf && bf.phase !== 'out') { bf.phase = 'out'; bf.t0 = now(); bf.sx = bf.x; bf.sy = bf.y; }
}

/* Static board layer. Everything on the board that never animates (grass
   checker, flowers, pebbles, rocks, crates, bridges, the frame) is drawn
   once into an offscreen canvas and blitted each frame; only the tiles
   that actually move (water, ice, gates, portals, tufts, rotten apples)
   are redrawn per frame. Rebuilt on level start, resize, bridge changes. */
var bgCv = null, bgCtx = null, staticDirty = true, animTiles = [];

function centerOf(r, c) {
  return { x: board.ox + (c + 0.5) * board.ts, y: board.oy + (r + 0.5) * board.ts };
}
function resize() {
  if (!G) return;
  var wrap = el('board-wrap');
  var r = wrap.getBoundingClientRect();
  var cs = getComputedStyle(wrap);
  var iw = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  var ih = r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  DPR = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.max(1, iw * DPR);
  cv.height = Math.max(1, ih * DPR);
  cv.style.width = iw + 'px';
  cv.style.height = ih + 'px';
  board.w = iw; board.h = ih;
  // leave room around the board for its frame rim + drop shadow
  var pad = 9;
  var ts = Math.max(8, Math.min((iw - pad * 2) / G.C, (ih - pad * 2) / G.R, MAX_TILE));
  board.ts = ts;
  board.ox = (iw - ts * G.C) / 2;
  board.oy = (ih - ts * G.R) / 2;
  // re-anchor head (a resize mid-slide drops any in-flight animation legs -
  // the worm's real position in G is unaffected, only the cosmetic glide)
  var hp = Worm.head(G), cp = centerOf(hp.r, hp.c);
  ha.x = ha.tx = cp.x; ha.y = ha.ty = cp.y; ha.active = false; ha.idx = G.trail.length - 1;
  headAnimQueue = []; rewind = null;
  staticDirty = true;
  if (G.patrol) {
    var hzp = centerOf(G.patrolPos.r, G.patrolPos.c);
    haz.x = haz.fx = haz.tx = hzp.x; haz.y = haz.fy = haz.ty = hzp.y; haz.active = false;
  }
}

/* ---- undo snapshots: the engine mutates G in place, so each accepted
   move saves the few fields it can change (tiles never change). ---- */
function snapshot(g) {
  return {
    trail: g.trail.map(function (p) { return { r: p.r, c: p.c }; }),
    occ: Object.assign({}, g.occ), apples: Object.assign({}, g.apples), applesLeft: g.applesLeft,
    bridgesUsed: Object.assign({}, g.bridgesUsed), moves: g.moves, movesLeft: g.movesLeft,
    score: g.score, combo: g.combo, comboTimer: g.comboTimer, status: g.status, loseReason: g.loseReason,
    facing: g.facing, patrolStep: g.patrolStep, patrolPos: g.patrolPos
  };
}
function restore(g, s) { for (var k in s) g[k] = s[k]; }
function eventsMoved(ev) { for (var i = 0; i < ev.length; i++) if (ev[i].t === 'move') return true; return false; }

/* ---- resume: the accepted moves of the level in progress are saved as
   a string ("DDRRU..."). The engine is deterministic, so replaying them
   rebuilds the exact position - and the undo history with it. ---- */
function validResume() {
  var r = save.resume;
  if (!r || typeof r.level !== 'number' || r.level < 0 || r.level >= LEVELS.length) return null;
  if (r.level + 1 > save.unlocked || typeof r.moves !== 'string' || !/^[UDLR]+$/.test(r.moves)) return null;
  return r;
}
function saveResume() { save.resume = { level: levelIdx, moves: acceptedMoves, undos: undoCount }; persistSoon(); }
function replay(moves) {
  for (var i = 0; i < moves.length && G.status === 'playing'; i++) {
    var snap = snapshot(G), ev = Worm.tryMove(G, moves[i]);
    if (eventsMoved(ev)) { undoStack.push(snap); acceptedMoves += moves[i]; }
  }
  // left on a losing move: come back to the moment just before it
  if (G.status === 'lost' && undoStack.length) { restore(G, undoStack.pop()); acceptedMoves = acceptedMoves.slice(0, -1); }
  if (G.status !== 'playing') { G = Worm.newGame(LEVELS[levelIdx]); undoStack = []; acceptedMoves = ''; }
}

function startLevel(i, skipIntro, opts) {
  opts = opts || {};
  levelIdx = i;
  G = Worm.newGame(LEVELS[i]);
  undoStack = []; acceptedMoves = ''; undoCount = 0; rewind = null;
  moveQueue = []; headAnimQueue = []; particles = []; popups = []; rings = []; ghosts = []; appleFx = {};
  moodForced = 'normal'; moodUntil = 0; eatUntil = 0; bumpAnim = null; shake = null;
  paused = false; coach = null;
  clearTimeout(endTimer);
  if (opts.resume) { replay(opts.resume); undoCount = opts.undos || 0; } // leaving doesn't refill the undo
  curTheme = themeFor(LEVELS[i]);
  applyScreenTheme(LEVELS[i].theme || 'garden');
  hideModals();
  show('screen-game');
  el('shared-chip').hidden = !sharedPuzzle;
  resize();
  introT0 = now();
  shownScore = G.score;
  if (hud) hud.paceLevel = -1; // force a clean HUD reset, even when restarting the same level
  var hp = Worm.head(G), cp = centerOf(hp.r, hp.c);
  ha.x = ha.tx = cp.x; ha.y = ha.ty = cp.y; ha.active = false; ha.idx = G.trail.length - 1;
  if (G.patrol) {
    var hzp = centerOf(G.patrolPos.r, G.patrolPos.c);
    haz.x = haz.fx = haz.tx = hzp.x; haz.y = haz.fy = haz.ty = hzp.y; haz.active = false;
  }
  resetWally();
  updateHUD();
  hideToast();
  saveResume();
  var def = LEVELS[i];
  function afterStory() {
    if (opts.resume && acceptedMoves) {
      showToast('Picked up where you left off', 2200);
    } else if (i === 0 && !save.coached) {
      startCoach();
    } else if (def.intro && !skipIntro && !(i === 0 && save.coached)) {
      el('tut-kicker').textContent = def.intro.kicker;
      el('tut-title').textContent = def.intro.title;
      el('tut-body').textContent = def.intro.body;
      el('modal-tutorial').classList.remove('hidden');
      modalOpen = true;
    }
  }
  // a story beat that belongs before this level plays first (once ever)
  var beat = !opts.noStory && !(opts.resume && acceptedMoves) && STORY_BEATS.before[i];
  if (beat && showStory(beat, afterStory)) return;
  afterStory();
}
function restartLevel() {
  if (G && G.moves > 0 && G.status !== 'won') attempts[levelIdx] = (attempts[levelIdx] || 0) + 1;
  startLevel(levelIdx, true);
}

var hud = null;
function updateHUD() {
  if (!G) return;
  if (!hud) hud = { level: el('hud-level'), name: el('hud-name'), moves: el('hud-moves'), movesN: el('hud-moves-n'),
                    pace: el('hud-pace'), paceN: el('hud-pace-n'), apples: el('hud-apples'), score: el('hud-score'), undo: el('game-undo'), paceLevel: -1 };
  var def = LEVELS[levelIdx];
  if (hud.paceLevel !== levelIdx) {
    // new level: static text + fresh pace stars, no bump animation
    hud.paceLevel = levelIdx;
    hud.level.textContent = 'Level ' + (levelIdx + 1);
    hud.name.textContent = def.name || '';
    hud.pace.innerHTML = starSvg() + starSvg() + starSvg();
    hud.movesN.textContent = G.movesLeft;
    hud.apples.textContent = G.applesLeft;
    hud.score.textContent = fmt(G.score);
  }
  setNum(hud.movesN, G.movesLeft);
  setNum(hud.apples, G.applesLeft);
  hud.moves.classList.toggle('low', G.movesLeft <= 3 && G.status === 'playing');
  // Star pace: how many stars you'd still get if you finished right now.
  var pace = Worm.starsFor(def, G.moves), ps = hud.pace.children;
  for (var i = 0; i < ps.length; i++) ps[i].classList.toggle('off', i >= pace);
  // Spell the threshold out (e.g. "3★ in 12") instead of making players
  // learn it only after they've already dropped a tier on the win card.
  var thresh = pace === 3 ? def.star3 : pace === 2 ? def.star2 : null;
  if (thresh != null && G.status === 'playing') {
    var left = Math.max(0, thresh - G.moves);
    hud.paceN.textContent = pace + '★ in ' + left;
    hud.paceN.classList.toggle('urgent', left <= 2);
  } else {
    hud.paceN.textContent = '';
  }
  hud.undo.disabled = !canUndo() || G.status === 'won' || !!storyState;
  // with a limited undo, a little counter on the button shows what's left
  if (isFinite(UNDO_LIMIT)) hud.undo.setAttribute('data-left', Math.max(0, UNDO_LIMIT - undoCount));
}
function tickScore(dt) {
  if (!hud || !G || shownScore === G.score) return;
  var gap = G.score - shownScore;
  shownScore += gap > 0 ? Math.max(1, Math.ceil(gap * Math.min(1, dt / 90))) : gap;
  if ((gap > 0 && shownScore > G.score) || reducedMotion()) shownScore = G.score;
  hud.score.textContent = fmt(shownScore);
}

/* ---- toast: one short line over the board ---- */
var toastTimer = 0;
function showToast(text, ms) {
  var t = el('toast');
  t.textContent = text; t.classList.add('show');
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(hideToast, ms);
}
function hideToast() { clearTimeout(toastTimer); var t = el('toast'); if (t) t.classList.remove('show'); }

/* ---- first-level coaching: no wall of text. One line, an arrow that
   points the way, then one more line once Wally is moving. ---- */
function startCoach() {
  coach = { stage: 0, dir: coachDir() };
  showToast('Swipe to help Wally reach the apple!');
}
function coachDir() {
  var h = Worm.head(G), best = null, bd = 1e9;
  for (var k in G.apples) { var a = G.apples[k], d = Math.abs(a.r - h.r) + Math.abs(a.c - h.c); if (d < bd) { bd = d; best = a; } }
  if (!best) return null;
  var dr = best.r - h.r, dc = best.c - h.c;
  var order = Math.abs(dr) >= Math.abs(dc) ? [dr > 0 ? 'D' : 'U', dc > 0 ? 'R' : 'L'] : [dc > 0 ? 'R' : 'L', dr > 0 ? 'D' : 'U'];
  for (var i = 0; i < 2; i++) if (Worm.legalDirs(G).indexOf(order[i]) >= 0) return order[i];
  return null;
}
function coachStep() {
  if (!coach) return;
  if (coach.stage === 0) { coach.stage = 1; showToast('His tail stays behind him, so don’t box him in!', 3800); }
  else if (G.moves >= 3) coach = null;
}

/* ============================== INPUT ============================== */
function inputDir(d) {
  if (modalOpen || !G || G.status !== 'playing') return;
  if (document.hidden) return; // background-input guard: ignore moves while the tab/app is backgrounded
  if (!el('screen-game').classList.contains('active')) return; // ignore input when the game screen isn't showing
  if (paused || transitioning) return;
  audioGesture();
  noteInput();
  // One buffered move, not three: this puzzle is built on "one input is
  // precious," and stacking swipes ahead of seeing each result land lets
  // players commit to a move (or two) blind, which cuts against that.
  if (moveQueue.length < 1) moveQueue.push(d);
  pumpQueue(); // if Wally is free, act this very frame - no waiting for the next tick
}
function pumpQueue() {
  if (!G || G.status !== 'playing' || modalOpen || paused || rewind) return;
  if (ha.active || headAnimQueue.length || moveQueue.length === 0) return;
  var d = moveQueue.shift();
  var snap = snapshot(G);
  var ev = Worm.tryMove(G, d);
  if (eventsMoved(ev)) {
    undoStack.push(snap); acceptedMoves += d;
    saveResume();
    coachStep();
  }
  handleEvents(ev, d);
  updateHUD();
}
function trailIndexOf(p) {
  for (var i = G.trail.length - 1; i >= 0; i--) if (G.trail[i].r === p.r && G.trail[i].c === p.c) return i;
  return G.trail.length - 1;
}
function startHeadAnim(to, dur, teleport, slide) {
  var cp = centerOf(to.r, to.c);
  ha.idx = trailIndexOf(to);
  if (teleport) {
    // A teleport hop doesn't glide - it's an instant cut, with a warp puff
    // at both the pad you vanished from and the one you appeared at.
    burst(ha.x, ha.y, 'teleport');
    burst(cp.x, cp.y, 'teleport');
    addRing(cp.x, cp.y, board.ts * 0.2, board.ts * 0.8, '#d8c2ff', 360);
    Sfx.teleport();
    ha.x = ha.fx = ha.tx = cp.x;
    ha.y = ha.fy = ha.ty = cp.y;
    ha.active = false;
    wally.sq = { t0: now(), dur: 260 };
    advanceHeadAnim(); // immediately continue to anything queued after it
    return;
  }
  var mdx = cp.x - ha.x, mdy = cp.y - ha.y, ml = Math.hypot(mdx, mdy) || 1;
  if (slide) sparkle(ha.x, ha.y);
  else puff(ha.x, ha.y, mdx / ml, mdy / ml);
  ha.fx = ha.x; ha.fy = ha.y;
  ha.tx = cp.x; ha.ty = cp.y; ha.t0 = now(); ha.dur = dur || 105; ha.active = true;
  if (!slide) wally.sq = { t0: ha.t0, dur: ha.dur + 70 };
}
// A single input can move the head through several tiles at once (an ice
// slide or a teleport hop): each tile/hop gets its own short leg queued up
// here, and the tick loop chains them one after another.
function queueHeadAnim(to, dur, teleport, slide) {
  headAnimQueue.push({ to: to, dur: dur, teleport: teleport, slide: slide });
  if (!ha.active) advanceHeadAnim();
}
function advanceHeadAnim() {
  if (headAnimQueue.length === 0) return;
  var next = headAnimQueue.shift();
  startHeadAnim(next.to, next.dur, next.teleport, next.slide);
}
function handleEvents(ev, d) {
  // Tracks whether the tile immediately before a 'lose' event was entered
  // mid ice-slide (rather than as the input's first/only step), so a
  // rotten death can say "the slide didn't stop for you" instead of just
  // "yuck" - see FAIL_TEXT.rottenSlide.
  var lastMoveSlide = false;
  for (var i = 0; i < ev.length; i++) {
    var e = ev[i];
    if (e.t === 'move') {
      lastMoveSlide = !!e.slide;
      queueHeadAnim(e.to, e.slide ? 70 : 105, false, e.slide);
      if (!e.slide) { Sfx.move(); Haptics.tap(); } // one step sound per input, not one per ice tile
      if (e.slide && !ev.slid) { ev.slid = true; Sfx.slide(); }
      if (G.tiles[e.to.r][e.to.c] === '=') { // bridge just broke under him
        staticDirty = true; Sfx.crack();
        var bp = centerOf(e.to.r, e.to.c); splinters(bp.x, bp.y);
      }
    }
    else if (e.t === 'teleport') { queueHeadAnim(e.to, 0, true); }
    else if (e.t === 'bump') { onBump(d); }
    else if (e.t === 'eat') { onEat(e); }
    else if (e.t === 'popup') {
      if (e.kind === 'combo') addPopup(e.text, e.kind, { r: e.pos.r - 1.1, c: e.pos.c }, 160);
      else addPopup(e.text, e.kind, e.pos);
    }
    else if (e.t === 'patrol') { onPatrolStep(e); }
    else if (e.t === 'win') { onWin(e); }
    else if (e.t === 'lose') { onLose(e, lastMoveSlide); }
  }
}
// Walked into something: a head-nudge, a puzzled look, a soft "bonk".
// Keep bumping and Wally loses patience.
function onBump(d) {
  var t = now();
  bumpAnim = { dir: d, t0: t };
  wally.bumps = wally.bumps.filter(function (bt) { return t - bt < 2500; });
  wally.bumps.push(t);
  if (wally.bumps.length >= 3) {
    moodForced = 'annoyed'; moodUntil = t + 1200;
    if (wally.bumps.length === 3) addPopupXY('Ow!', 'think', ha.x, ha.y - board.ts * 0.85);
  } else {
    moodForced = 'confused'; moodUntil = t + 800;
    addPopupXY('?', 'think', ha.x + board.ts * 0.35, ha.y - board.ts * 0.75);
  }
  Sfx.bump(); Haptics.bump();
}
function onPatrolStep(e) {
  // Glide the hazard from its old waypoint to its new one, timed to land
  // roughly alongside the player's own move animation.
  haz.fx = haz.x; haz.fy = haz.y;
  var cp = centerOf(e.to.r, e.to.c);
  haz.tx = cp.x; haz.ty = cp.y;
  haz.t0 = now(); haz.dur = 150; haz.active = true;
  Sfx.patrolStep();
}
function onEat(e) {
  eatUntil = now() + 380;
  var p = centerOf(e.pos.r, e.pos.c);
  var golden = e.kind === 'golden';
  addPopup(e.kind === 'rotten' ? 'YUCK!' : 'NOM!', 'nom', e.pos);
  if (e.points) addPopup('+' + e.points, 'score', { r: e.pos.r - 0.55, c: e.pos.c });
  if (e.kind !== 'rotten') {
    // the pop: a ghost of the apple swells and fades, a ring snaps outward
    ghosts.push({ x: p.x, y: p.y, type: e.kind, t0: now() });
    addRing(p.x, p.y, board.ts * 0.25, board.ts * (golden ? 1.4 : 0.8), golden ? '#ffe28a' : 'rgba(255,255,255,.9)', golden ? 520 : 340);
  }
  if (golden) {
    addPopup('JACKPOT!', 'jackpot', { r: e.pos.r - 1.15, c: e.pos.c });
    if (!reducedMotion()) shake = { t0: now(), dur: 420, mag: 9 };
    Sfx.jackpot(); Haptics.big();
  } else Haptics.pop();
  burst(p.x, p.y, e.kind, golden);
  Sfx.eat(e.kind);
  if (e.combo >= 2) Sfx.combo(e.combo);
  updateHUD();
}
var endTimer = 0;
// How Wally celebrates depends on how the level went: a breezy clear gets
// a happy wiggle, scraping through gets a relieved "phew", and nailing a
// hard one (or finally cracking a level after several tries) gets the big
// star-eyed celebration.
function winTier(stars) {
  var def = LEVELS[levelIdx], slack = def.budget - def.par;
  var effort = (attempts[levelIdx] || 0) + Math.floor(undoCount / 3);
  if ((stars === 3 && slack <= 4) || effort >= 4 || (stars === 3 && effort >= 2)) return 'huge';
  if (G.movesLeft <= 1 || (stars === 1 && effort >= 1)) return 'phew';
  return 'happy';
}
function onWin(e) {
  moveQueue = [];
  var def = LEVELS[levelIdx];
  var stars = Worm.starsFor(def, G.moves);
  var tier = winTier(stars);
  wally.tier = tier; wally.winT = now();
  Sfx.win(tier === 'huge'); Haptics.win();
  confetti(tier === 'huge' ? 120 : 70);
  if (!reducedMotion()) shake = { t0: now(), dur: tier === 'huge' ? 480 : 300, mag: tier === 'huge' ? 8 : 4 };
  burst(ha.x, ha.y, 'golden', true);
  updateHUD();
  var starsBefore = totalStars();
  var prevBest = save.best[levelIdx];
  // A level's very first clear is its best result by definition - it used
  // to take a *second* win to ever earn the New Best badge.
  var newBest = prevBest === undefined || G.moves < prevBest;
  save.stars[levelIdx] = Math.max(save.stars[levelIdx] || 0, stars);
  if (!save.best[levelIdx] || G.moves < save.best[levelIdx]) save.best[levelIdx] = G.moves;
  save.bestScore[levelIdx] = Math.max(save.bestScore[levelIdx] || 0, G.score);
  save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, levelIdx + 2));
  if (levelIdx === 0) save.coached = true;
  save.resume = null;
  attempts[levelIdx] = 0;
  var starsAfter = totalStars();
  var unlocked = HATS.filter(function (h) { return h.stars !== undefined && starsBefore < h.stars && starsAfter >= h.stars; });
  persist();
  coach = null; hideToast();
  // Only show the card if the player is still looking at this same run -
  // restarting or backing out during the celebration shouldn't pop it up
  // over whatever they moved on to.
  var forGame = G;
  clearTimeout(endTimer);
  endTimer = setTimeout(function () {
    if (G === forGame && activeScreen === 'screen-game' && !paused) showComplete(stars, newBest, tier, unlocked);
  }, tier === 'huge' ? 1400 : 1150);
}
function onLose(e, viaSlide) {
  moveQueue = [];
  attempts[levelIdx] = (attempts[levelIdx] || 0) + 1;
  if (e.reason === 'patrol') burst(ha.x, ha.y, 'patrol');
  Sfx.lose(); Haptics.fail();
  hideToast();
  var forGame = G;
  clearTimeout(endTimer);
  endTimer = setTimeout(function () {
    if (G === forGame && activeScreen === 'screen-game' && G.status === 'lost' && !paused) showFail(e.reason, viaSlide);
  }, 950);
}

/* ---- undo: step back one move, with a quick rewind of Wally's tail ---- */
function undo() {
  if (!G || !canUndo() || G.status === 'won' || paused || transitioning || rewind) return;
  if (activeScreen !== 'screen-game') return;
  var fail = el('modal-fail');
  if (openModal() && openModal() !== fail) return;
  clearTimeout(endTimer);
  fail.classList.add('hidden'); modalOpen = false;
  audioGesture(); noteInput();
  var oldTrail = G.trail.slice(), oldApples = Object.assign({}, G.apples), oldBridges = Object.assign({}, G.bridgesUsed);
  restore(G, undoStack.pop());
  acceptedMoves = acceptedMoves.slice(0, -1);
  undoCount++;
  saveResume();
  moveQueue = []; headAnimQueue = []; ha.active = false; bumpAnim = null;
  var from = oldTrail.length - 1, to = G.trail.length - 1;
  var per = Math.min(60, 420 / Math.max(1, from - to));
  rewind = { trail: oldTrail, from: from, to: to, t0: now(), per: per, cur: from };
  // apples pop back in as the tail retracts past them
  for (var k in G.apples) {
    if (!oldApples[k]) {
      var a = G.apples[k], ai = -1;
      for (var i = oldTrail.length - 1; i >= 0; i--) if (oldTrail[i].r === a.r && oldTrail[i].c === a.c) { ai = i; break; }
      appleFx[k] = { t0: now() + Math.max(0, from - ai) * per, kind: 'in' };
    }
  }
  for (var bk in oldBridges) if (!G.bridgesUsed[bk]) staticDirty = true;
  if (G.patrol) onPatrolStep({ to: G.patrolPos });
  ha.idx = to;
  Sfx.undo(); Haptics.tap();
  // patience wears thin with lots of undos
  if (undoCount >= 8 && undoCount % 4 === 0) { moodForced = 'annoyed'; moodUntil = now() + 1500; addPopupXY('Again?', 'think', ha.x, ha.y - board.ts * 0.9); }
  else if (undoCount >= 4) { moodForced = 'meh'; moodUntil = now() + 1200; }
  updateHUD();
}

/* ============================== PARTICLES, RINGS & POPUPS ============================== */
var JUICE = { red: '#ef3b2d', golden: '#ffd54f', green: '#8be04e', rotten: '#6e6472', teleport: '#b98bff', patrol: '#ff3355' };
var MAX_PARTICLES = 320;
function burst(x, y, kind, big) {
  if (particles.length > MAX_PARTICLES) return;
  var cols = big ? ['#ffd54f', '#fff3b0', '#ff9f1c', '#ffffff']
                 : [JUICE[kind] || '#fff'];
  var n = big ? 34 : 12;
  for (var i = 0; i < n; i++) {
    var a = Math.random() * 6.2832, sp = (big ? 120 : 60) + Math.random() * (big ? 260 : 160);
    particles.push({
      x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (big ? 130 : 60),
      life: (big ? 850 : 550) + Math.random() * (big ? 500 : 250), age: 0,
      col: cols[i % cols.length],
      r: (big ? 3.5 : 2.5) + Math.random() * (big ? 5 : 3.5),
      shape: big && i % 4 === 0 ? 'rect' : 'dot',
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 12
    });
  }
}
// little clods of dirt (or snow) kicked out behind Wally on every step.
// Kept deliberately light (3 small, quick particles) - it's a per-move
// effect that plays dozens of times a level, so it should read as a
// subtle kick, not a burst.
function puff(x, y, dx, dy) {
  if (particles.length > MAX_PARTICLES || reducedMotion()) return;
  var ts = board.ts, base = Math.atan2(-dy, -dx);
  for (var i = 0; i < 3; i++) {
    var a = base + (Math.random() - 0.5) * 1.3, sp = 22 + Math.random() * 38;
    particles.push({ x: x - dx * ts * 0.25, y: y - dy * ts * 0.25 + ts * 0.12, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 14,
      life: 260 + Math.random() * 140, age: 0, col: curTheme.dust || '#8d5f33', r: ts * (0.028 + Math.random() * 0.028),
      shape: 'dust', g: 120, drag: 0.9 });
  }
}
function sparkle(x, y) {
  if (particles.length > MAX_PARTICLES || reducedMotion()) return;
  for (var i = 0; i < 3; i++) {
    particles.push({ x: x + (Math.random() - 0.5) * board.ts * 0.5, y: y + (Math.random() - 0.5) * board.ts * 0.5,
      vx: 0, vy: -10, life: 420, age: 0, col: '#ffffff', r: board.ts * 0.05, shape: 'spark', g: 0 });
  }
}
function splinters(x, y) {
  for (var i = 0; i < 7; i++) {
    var a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = 70 + Math.random() * 90;
    particles.push({ x: x, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 520, age: 0, col: i % 2 ? '#d29a5b' : '#8a5f2c',
      r: board.ts * 0.05, shape: 'rect', g: 520, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 16 });
  }
}
function confetti(n) {
  var cols = ['#ff9f1c', '#ff8fab', '#8ee060', '#7ec8f7', '#ffd54f', '#fff'];
  n = reducedMotion() ? 24 : (n || 70);
  for (var i = 0; i < n; i++) {
    particles.push({
      x: Math.random() * board.w, y: -20 - Math.random() * 120,
      vx: (Math.random() - 0.5) * 60, vy: 120 + Math.random() * 160,
      life: 1600 + Math.random() * 800, age: 0,
      col: cols[i % cols.length], r: 3 + Math.random() * 4, shape: 'rect',
      rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 10
    });
  }
}
function addRing(x, y, r0, r1, col, dur) { if (!reducedMotion()) rings.push({ x: x, y: y, r0: r0, r1: r1, col: col, t0: now(), dur: dur }); }
function addPopup(text, kind, pos, delay) {
  var p = centerOf(pos.r, pos.c);
  addPopupXY(text, kind, p.x, p.y, delay);
}
function addPopupXY(text, kind, x, y, delay) {
  var m = kind === 'combo' ? /x(\d+)/.exec(text) : null;
  popups.push({ x: x, y: y, text: text, kind: kind, t0: now() + (delay || 0), n: m ? +m[1] : 0 });
}
function updateFx(dt) {
  var s = dt / 1000;
  for (var i = particles.length - 1; i >= 0; i--) {
    var p = particles[i];
    p.age += dt;
    if (p.age >= p.life) { particles.splice(i, 1); continue; }
    p.vy += (p.g !== undefined ? p.g : (p.shape === 'dot' ? 500 : 60)) * s;
    if (p.drag) { var k = Math.pow(p.drag, dt / 16); p.vx *= k; p.vy *= k; }
    p.x += p.vx * s; p.y += p.vy * s;
    if (p.vr) p.rot += p.vr * s;
  }
  var t = now();
  for (var j = popups.length - 1; j >= 0; j--) if (t - popups[j].t0 > 1000) popups.splice(j, 1);
  for (var r = rings.length - 1; r >= 0; r--) if (t - rings[r].t0 > rings[r].dur) rings.splice(r, 1);
  for (var g = ghosts.length - 1; g >= 0; g--) if (t - ghosts[g].t0 > 200) ghosts.splice(g, 1);
}

/* ============================== WALLY: BEHAVIOUR ==============================
   Runs every frame while a level is on screen: smooths his facing and gaze
   and walks him through his idle routine when the player stops to think -
   eyeing the nearest apple, a thought bubble, playing with a dirt ball,
   turning to look at the player, and eventually nodding off. */
function nearestApple() {
  var best = null, bd = 1e9;
  for (var k in G.apples) {
    var a = G.apples[k], p = centerOf(a.r, a.c), d = Math.hypot(p.x - ha.x, p.y - ha.y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
function updateWally(t, dt) {
  var idle = t - wally.lastInput, playing = G.status === 'playing' && !paused;
  var fd = DIRV[G.facing], faceT = [fd[0], fd[1]], lookT = [fd[0], fd[1]], big = 1;
  wally.idle = 'none';
  if (playing && t >= moodUntil) {
    if (idle > 45000) { wally.idle = 'sleep'; faceT = [0, 1]; lookT = [0, 0.3]; }
    else if (idle > 27000) { wally.idle = 'stare'; faceT = [0, 1]; lookT = [0, 0.15]; big = 1.18; }
    else if (idle > 17000) { wally.idle = 'ball'; var bp = ballPos(t); var bl = Math.hypot(bp.x - ha.x, bp.y - ha.y) || 1; lookT = [(bp.x - ha.x) / bl, (bp.y - ha.y) / bl]; }
    else if (idle > 11000) { wally.idle = 'think'; lookT = [0.6, -0.8]; }
    else if (idle > 5000) {
      wally.idle = 'apple';
      var ap = nearestApple();
      if (ap) { var al = Math.hypot(ap.x - ha.x, ap.y - ha.y) || 1; lookT = [(ap.x - ha.x) / al, (ap.y - ha.y) / al]; }
    }
    // butterfly visitor
    if (wally.bfLucky && !wally.butterfly && idle > 8000 && !reducedMotion()) spawnButterfly(t);
  }
  if (wally.butterfly && wally.butterfly.phase === 'sit' && t >= moodUntil) { lookT = [0, -1]; }
  if (G.status === 'won') { faceT = [0, 1]; lookT = [0, 0.2]; }
  var kf = 1 - Math.exp(-dt / 70), kl = 1 - Math.exp(-dt / 90);
  wally.face[0] += (faceT[0] - wally.face[0]) * kf; wally.face[1] += (faceT[1] - wally.face[1]) * kf;
  var fl = Math.hypot(wally.face[0], wally.face[1]);
  if (fl < 0.3) { wally.face = faceT.slice(); } else { wally.face[0] /= fl; wally.face[1] /= fl; }
  wally.look[0] += (lookT[0] - wally.look[0]) * kl; wally.look[1] += (lookT[1] - wally.look[1]) * kl;
  wally.big = big;
  updateButterfly(t);
}
function ballPos(t) {
  var ts = board.ts, side = ha.x < board.w / 2 ? 1 : -1;
  return { x: ha.x + side * ts * (0.68 + Math.sin(t / 700) * 0.08), y: ha.y - ts * 0.05 - Math.abs(Math.sin(t / 260)) * ts * 0.62 };
}
function spawnButterfly(t) {
  var ts = board.ts, side = Math.random() < 0.5 ? -1 : 1;
  wally.butterfly = { phase: 'in', t0: t, sx: side < 0 ? -ts : board.w + ts, sy: ha.y - ts * 2.5, x: 0, y: 0,
    col: ['#ffd54f', '#7ec8f7', '#ff9fd0', '#b9f28a'][Math.floor(Math.random() * 4)], flap: Math.random() * 6 };
}
function updateButterfly(t) {
  var bf = wally.butterfly;
  if (!bf) return;
  var ts = board.ts, tx = ha.x + ts * 0.05, ty = ha.y - ts * (save.hat && save.hat !== 'none' && save.hat !== 'shades' && save.hat !== 'flower' ? 0.95 : 0.52);
  if (bf.phase === 'in') {
    var p = Math.min(1, (t - bf.t0) / 2600), e = easeInOut(p);
    bf.x = lerp(bf.sx, tx, e) + Math.sin(p * 9) * ts * 0.4 * (1 - p);
    bf.y = lerp(bf.sy, ty, e) + Math.cos(p * 7) * ts * 0.3 * (1 - p);
    if (p >= 1) bf.phase = 'sit';
  } else if (bf.phase === 'sit') { bf.x = tx; bf.y = ty; }
  else if (bf.phase === 'out') {
    var q = Math.min(1, (t - bf.t0) / 1300);
    bf.x = bf.sx + q * ts * 5 * (bf.sx > board.w / 2 ? 1 : -1) + Math.sin(q * 12) * ts * 0.3;
    bf.y = bf.sy - q * ts * 4;
    if (q >= 1) { wally.butterfly = null; wally.bfLucky = false; }
  }
}

/* ---- taps on the board: Wally, apples, the thorn, water ---- */
function tapBoard(px, py) {
  if (!G || paused || modalOpen || transitioning || rewind) return;
  audioGesture(); noteInput();
  var ts = board.ts, t = now();
  if (Math.hypot(px - ha.x, py - ha.y) < ts * 0.62) { tapWally(t); return; }
  for (var k in G.apples) {
    var a = G.apples[k], p = centerOf(a.r, a.c);
    if (Math.hypot(px - p.x, py - p.y) < ts * 0.45) { appleFx[k] = { t0: t, kind: 'wobble' }; Sfx.vary(0.1).tone(880, 0.05, 'sine', 0.06, 0, 660); return; }
  }
  if (G.patrol && Math.hypot(px - haz.x, py - haz.y) < ts * 0.45) { haz.flash = t; Sfx.hmph(); return; }
  var c = Math.floor((px - board.ox) / ts), r = Math.floor((py - board.oy) / ts);
  if (r < 0 || c < 0 || r >= G.R || c >= G.C) return;
  var ch = G.tiles[r][c], cp = centerOf(r, c);
  if (ch === '~' || ch === '=') { addRing(px, py, 2, ts * 0.45, 'rgba(255,255,255,.8)', 520); Sfx.vary(0.2).tone(520, 0.08, 'sine', 0.05, 0, 900); }
  else if (ch === 'I') { sparkle(px, py); Sfx.vary(0.2).tone(1700, 0.05, 'sine', 0.03); }
  else if (ch === '.') { puff(cp.x, cp.y, 0, 1); }
}
function tapWally(t) {
  if (t - wally.tapT > 1600) wally.taps = 0;
  wally.taps++; wally.tapT = t;
  if (G.status !== 'playing') return;
  if (wally.taps >= 5) {
    wally.taps = 0;
    moodForced = 'annoyed'; moodUntil = t + 1800;
    addPopupXY('Hmph!', 'think', ha.x, ha.y - board.ts * 0.9);
    Sfx.hmph(); Haptics.bump();
  } else {
    moodForced = 'happy'; moodUntil = t + 520; wally.giggle = t;
    Sfx.giggle(); Haptics.tap();
  }
}

/* ============================== RENDER ============================== */
function currentMood(t) {
  if (G.status === 'won') {
    if (wally.tier === 'huge') return 'ecstatic';
    if (wally.tier === 'phew' && t - wally.winT < 1000) return 'phew';
    return 'happy';
  }
  if (G.status === 'lost') return { rotten: 'sick', patrol: 'dizzy', moves: 'tired', trapped: 'sad' }[G.loseReason] || 'sad';
  if (t < moodUntil) return moodForced;
  if (wally.idle === 'sleep') return 'sleepy';
  if (t < eatUntil) return 'eating';
  if (G.movesLeft <= 3) return 'worried';
  return 'normal';
}

/* ---- static board layer ---- */
function boardRadius() { return Math.min(18, board.ts * 0.32); }
function isFloor(ch) { return ch === '.'; }
function drawTuft(c, x, y, ts, r, cNum, t) {
  c.strokeStyle = 'rgba(46,110,30,.55)'; c.lineWidth = Math.max(1.5, ts * 0.03); c.lineCap = 'round';
  var gx = x + ts * 0.25, gy = y + ts * 0.75;
  var sw = Math.sin(t / 620 + r * 1.7 + cNum * 0.9) * ts * 0.022;
  c.beginPath();
  c.moveTo(gx, gy); c.lineTo(gx - ts * 0.05 + sw, gy - ts * 0.14);
  c.moveTo(gx + ts * 0.04, gy); c.lineTo(gx + ts * 0.04 + sw * 1.3, gy - ts * 0.17);
  c.moveTo(gx + ts * 0.08, gy); c.lineTo(gx + ts * 0.13 + sw, gy - ts * 0.13);
  c.stroke();
}
// Grass decoration for one tile. Returns true if this tile has a tuft that
// should sway (i.e. needs a per-frame redraw); tufts under rocks/gates etc.
// are drawn still, straight into the static layer.
function drawGrassStatic(c, x, y, ts, r, cNum, animateTuft) {
  var th = curTheme;
  if ((r + cNum) % 2) { c.fillStyle = th.grassB; c.fillRect(x, y, ts, ts); }
  var h = hash2(r, cNum, levelIdx + 1);
  if (h < 0.10) { // flower
    var fx = x + ts * (0.2 + h * 6), fy = y + ts * (0.25 + hash2(cNum, r, 7) * 0.5);
    c.fillStyle = th.flowers[Math.floor(h * 30) % 3];
    for (var i = 0; i < 5; i++) {
      var a = i / 5 * 6.2832;
      circle(c, fx + Math.cos(a) * ts * 0.05, fy + Math.sin(a) * ts * 0.05, ts * 0.038); c.fill();
    }
    c.fillStyle = '#ffcf3f'; circle(c, fx, fy, ts * 0.035); c.fill();
  } else if (h < 0.20) { // pebble
    c.fillStyle = 'rgba(120,120,120,.5)';
    c.beginPath();
    c.ellipse(x + ts * 0.7, y + ts * 0.65, ts * 0.09, ts * 0.06, 0.5, 0, 6.2832);
    c.fill();
  } else if (h < 0.30) {
    if (animateTuft) return true;
    drawTuft(c, x, y, ts, r, cNum, 0);
  }
  return false;
}
// Draws the parts of a tile that never change and returns the kind of
// per-frame animation it still needs (or null).
function drawTileStatic(c, r, cNum) {
  var ts = board.ts, th = curTheme;
  var x = board.ox + cNum * ts, y = board.oy + r * ts;
  var ch = G.tiles[r][cNum];
  if (ch === '~') { c.fillStyle = th.water; c.fillRect(x, y, ts, ts); return 'water'; }
  if (ch === '=') {
    c.fillStyle = th.water; c.fillRect(x, y, ts, ts);
    var used = G.bridgesUsed[r + ',' + cNum];
    c.fillStyle = used ? '#a5763f' : '#d29a5b';
    c.strokeStyle = '#8a5f2c'; c.lineWidth = Math.max(1.5, ts * 0.03);
    if (!used) {
      for (var p = 0; p < 3; p++) {
        var py = y + ts * (0.16 + p * 0.26);
        rr(c, x + ts * 0.08, py, ts * 0.84, ts * 0.18, ts * 0.05); c.fill(); c.stroke();
      }
    } else {
      c.save();
      c.translate(x + ts * 0.5, y + ts * 0.5);
      c.rotate(-0.35); rr(c, -ts * 0.42, -ts * 0.30, ts * 0.34, ts * 0.16, ts * 0.04); c.fill(); c.stroke();
      c.rotate(0.7); rr(c, ts * 0.08, -ts * 0.30, ts * 0.34, ts * 0.16, ts * 0.04); c.fill(); c.stroke();
      c.restore();
    }
    return null;
  }
  var tuft = drawGrassStatic(c, x, y, ts, r, cNum, isFloor(ch));
  if (ch === 'I') {
    var ir = ts * 0.12;
    c.fillStyle = th.ice || '#bfe6f7';
    rr(c, x + ts * 0.04, y + ts * 0.04, ts * 0.92, ts * 0.92, ir); c.fill();
    c.strokeStyle = th.iceEdge || '#7fb8d8'; c.lineWidth = Math.max(1.5, ts * 0.03);
    c.stroke();
    return 'ice';
  }
  if (Worm.ONEWAY_DIR[ch]) {
    c.fillStyle = 'rgba(0,0,0,.18)';
    rr(c, x + ts * 0.06, y + ts * 0.06, ts * 0.88, ts * 0.88, ts * 0.14); c.fill();
    return 'oneway';
  }
  if (Worm.TELEPORT_CHARS[ch]) return 'teleport';
  if (ch === '#') {
    // soft contact shadow so rocks sit on the ground instead of floating
    c.fillStyle = 'rgba(0,0,0,.16)';
    rr(c, x + ts * 0.14, y + ts * 0.22, ts * 0.74, ts * 0.68, ts * 0.16); c.fill();
    c.fillStyle = th.rockFill; c.strokeStyle = th.rockStroke; c.lineWidth = Math.max(2, ts * 0.04);
    rr(c, x + ts * 0.13, y + ts * 0.16, ts * 0.74, ts * 0.68, ts * 0.16); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.35)';
    rr(c, x + ts * 0.20, y + ts * 0.22, ts * 0.34, ts * 0.20, ts * 0.08); c.fill();
    return null;
  }
  if (ch === 'C') {
    c.fillStyle = 'rgba(0,0,0,.16)';
    rr(c, x + ts * 0.11, y + ts * 0.15, ts * 0.80, ts * 0.80, ts * 0.06); c.fill();
    c.fillStyle = '#c08a4e'; c.strokeStyle = '#8a5a28'; c.lineWidth = Math.max(2, ts * 0.045);
    rr(c, x + ts * 0.10, y + ts * 0.10, ts * 0.80, ts * 0.80, ts * 0.06); c.fill(); c.stroke();
    c.strokeStyle = '#8a5a28'; c.lineWidth = Math.max(1.5, ts * 0.035);
    c.beginPath();
    c.moveTo(x + ts * 0.14, y + ts * 0.14); c.lineTo(x + ts * 0.86, y + ts * 0.86);
    c.moveTo(x + ts * 0.86, y + ts * 0.14); c.lineTo(x + ts * 0.14, y + ts * 0.86);
    c.stroke();
    return null;
  }
  if (ch === 'r') return 'rotten';
  return tuft ? 'tuft' : null;
}
function buildStatic() {
  staticDirty = false;
  if (!bgCv) { bgCv = document.createElement('canvas'); bgCtx = bgCv.getContext('2d'); }
  if (bgCv.width !== cv.width || bgCv.height !== cv.height) { bgCv.width = cv.width; bgCv.height = cv.height; }
  var c = bgCtx, ts = board.ts, th = curTheme;
  c.setTransform(DPR, 0, 0, DPR, 0, 0);
  c.clearRect(0, 0, board.w, board.h);
  var bx = board.ox, by = board.oy, bw = G.C * ts, bh = G.R * ts, rad = boardRadius();
  // frame: a soft drop shadow under a translucent rim, so the board reads
  // as a physical tray sitting on the backdrop rather than a flat rectangle
  c.save();
  c.shadowColor = 'rgba(0,0,0,.38)'; c.shadowBlur = 22; c.shadowOffsetY = 8;
  c.fillStyle = 'rgba(0,0,0,.24)';
  rr(c, bx - 7, by - 7, bw + 14, bh + 14, rad + 7); c.fill();
  c.restore();
  c.fillStyle = 'rgba(255,255,255,.10)';
  rr(c, bx - 7, by - 7, bw + 14, bh + 14, rad + 7); c.fill();
  // tiles, clipped to a rounded board
  c.save();
  rr(c, bx, by, bw, bh, rad); c.clip();
  c.fillStyle = th.grassA; c.fillRect(bx, by, bw, bh); // one fill = no hairline seams between tiles
  animTiles = [];
  for (var r = 0; r < G.R; r++) {
    for (var cNum = 0; cNum < G.C; cNum++) {
      var kind = drawTileStatic(c, r, cNum);
      if (kind) animTiles.push({ r: r, c: cNum, kind: kind });
    }
  }
  // inner edge shade for depth (only the inside half survives the clip)
  c.strokeStyle = 'rgba(0,0,0,.20)'; c.lineWidth = 5;
  rr(c, bx, by, bw, bh, rad); c.stroke();
  c.restore();
}

/* ---- per-frame tile animation ---- */
function drawTileAnim(c, a, t) {
  var ts = board.ts, th = curTheme, r = a.r, cNum = a.c;
  var x = board.ox + cNum * ts, y = board.oy + r * ts;
  switch (a.kind) {
    case 'tuft': drawTuft(c, x, y, ts, r, cNum, t); return;
    case 'water': {
      c.strokeStyle = th.waterFoam; c.lineWidth = Math.max(1.5, ts * 0.035); c.lineCap = 'round';
      for (var wv = 0; wv < 2; wv++) {
        var ph = t / 450 + cNum * 1.3 + r * 0.7 + wv * 2.1;
        var wy = y + ts * (0.32 + wv * 0.36) + Math.sin(ph) * ts * 0.045;
        var sweep = 0.12 * Math.sin(ph * 0.6);
        c.beginPath(); c.arc(x + ts * 0.5, wy, ts * 0.16, Math.PI * (0.12 + sweep), Math.PI * (0.88 + sweep)); c.stroke();
      }
      var shx = x + ((t / 1600 + hash2(r, cNum, 11)) % 1) * ts;
      c.fillStyle = 'rgba(255,255,255,.45)';
      circle(c, shx, y + ts * (0.28 + 0.44 * hash2(cNum, r, 5)), ts * 0.028); c.fill();
      return;
    }
    case 'ice': {
      // a soft light sweep that drifts per-tile so the whole floor doesn't
      // shine in lockstep, plus a crack facet for texture
      var ir = ts * 0.12;
      c.save();
      rr(c, x + ts * 0.04, y + ts * 0.04, ts * 0.92, ts * 0.92, ir); c.clip();
      var sw = ((t / 1100 + hash2(r, cNum, 23)) % 1) * 1.7 - 0.35;
      var gx = x + sw * ts;
      var grad = c.createLinearGradient(gx - ts * 0.28, y, gx + ts * 0.28, y + ts);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(0.5, th.iceShine || 'rgba(255,255,255,.75)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = grad;
      c.fillRect(x, y, ts, ts);
      c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = Math.max(1, ts * 0.02);
      c.beginPath();
      c.moveTo(x + ts * 0.22, y + ts * 0.20); c.lineTo(x + ts * 0.42, y + ts * 0.42);
      c.lineTo(x + ts * 0.30, y + ts * 0.64);
      c.stroke();
      c.restore();
      return;
    }
    case 'oneway': {
      // a bold chevron pointing the only direction it can be entered from,
      // pulsing on a glowing channel so it reads as "flow", not a wall
      var ch = G.tiles[r][cNum];
      var owAng = { U: -Math.PI / 2, D: Math.PI / 2, L: Math.PI, R: 0 }[Worm.ONEWAY_DIR[ch]];
      c.save();
      c.translate(x + ts * 0.5, y + ts * 0.5);
      c.rotate(owAng);
      var owGlow = 0.55 + 0.35 * Math.sin(t / 260 + hash2(r, cNum, 31) * 6.2832);
      c.shadowColor = th.onewayGlow || 'rgba(180,150,255,.55)';
      c.shadowBlur = ts * 0.22 * owGlow;
      c.fillStyle = th.oneway || '#8a6fd8';
      c.beginPath();
      c.moveTo(ts * 0.22, 0);
      c.lineTo(-ts * 0.12, -ts * 0.22);
      c.lineTo(-ts * 0.12, -ts * 0.08);
      c.lineTo(-ts * 0.30, -ts * 0.08);
      c.lineTo(-ts * 0.30, ts * 0.08);
      c.lineTo(-ts * 0.12, ts * 0.08);
      c.lineTo(-ts * 0.12, ts * 0.22);
      c.closePath();
      c.fill();
      c.restore();
      return;
    }
    case 'teleport': {
      // glowing portal, colored per pair so an entry pad can be matched to
      // its exit before committing to it
      var pairIdx = (parseInt(G.tiles[r][cNum], 10) - 1) % 4;
      var tcol = (th.teleport && th.teleport[pairIdx]) || '#ff6fae';
      var cx = x + ts * 0.5, cy = y + ts * 0.5;
      var pulse = (t / 900 + hash2(r, cNum, 41)) % 1;
      c.save();
      c.strokeStyle = tcol; c.globalAlpha = Math.max(0, 1 - pulse);
      c.lineWidth = Math.max(1.5, ts * 0.03);
      circle(c, cx, cy, ts * (0.16 + pulse * 0.28)); c.stroke();
      c.globalAlpha = 1;
      c.shadowColor = tcol; c.shadowBlur = ts * 0.35;
      var tgrad = c.createRadialGradient(cx, cy, ts * 0.02, cx, cy, ts * 0.26);
      tgrad.addColorStop(0, '#ffffff'); tgrad.addColorStop(0.4, tcol); tgrad.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = tgrad;
      circle(c, cx, cy, ts * 0.26); c.fill();
      c.shadowBlur = 0;
      c.strokeStyle = tcol; c.lineWidth = Math.max(1.5, ts * 0.028);
      circle(c, cx, cy, ts * 0.20); c.stroke();
      // each pair also gets its own shape, so pads can be matched without
      // relying on colour alone
      c.fillStyle = 'rgba(20,10,40,.75)';
      var gs = ts * 0.075;
      c.beginPath();
      if (pairIdx === 0) { c.arc(cx, cy, gs, 0, 6.2832); }
      else if (pairIdx === 1) { c.moveTo(cx, cy - gs * 1.3); c.lineTo(cx + gs * 1.3, cy); c.lineTo(cx, cy + gs * 1.3); c.lineTo(cx - gs * 1.3, cy); }
      else if (pairIdx === 2) { c.rect(cx - gs, cy - gs, gs * 2, gs * 2); }
      else { c.moveTo(cx, cy - gs * 1.3); c.lineTo(cx + gs * 1.2, cy + gs); c.lineTo(cx - gs * 1.2, cy + gs); }
      c.closePath(); c.fill();
      c.restore();
      return;
    }
    case 'rotten': drawApple(c, x + ts / 2, y + ts / 2, ts, 'rotten', t); return;
  }
}

function drawApple(c, x, y, s, type, t) {
  // shadow
  c.fillStyle = 'rgba(0,0,0,.18)';
  c.beginPath(); c.ellipse(x, y + s * 0.32, s * 0.24, s * 0.075, 0, 0, 6.2832); c.fill();
  var body = type === 'golden' ? '#ffc93c' : type === 'green' ? '#8be04e' : type === 'rotten' ? '#6e6472' : '#ef3b2d';
  var dark = type === 'golden' ? '#d99400' : type === 'green' ? '#5da32a' : type === 'rotten' ? '#4c4450' : '#c0271b';
  if (type === 'golden') { c.shadowColor = 'rgba(255,213,79,.9)'; c.shadowBlur = 16; }
  c.fillStyle = body; c.strokeStyle = dark; c.lineWidth = Math.max(1.5, s * 0.035);
  circle(c, x, y, s * 0.30); c.fill(); c.stroke();
  c.shadowBlur = 0;
  if (type !== 'rotten') {
    // stem + leaf
    c.strokeStyle = '#7a4a21'; c.lineWidth = Math.max(1.5, s * 0.045); c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y - s * 0.26); c.lineTo(x + s * 0.05, y - s * 0.38); c.stroke();
    c.fillStyle = '#4c9a2a';
    c.save(); c.translate(x + s * 0.15, y - s * 0.35); c.rotate(-0.5);
    c.beginPath(); c.ellipse(0, 0, s * 0.11, s * 0.055, 0, 0, 6.2832); c.fill(); c.restore();
    // shine
    c.fillStyle = 'rgba(255,255,255,.65)';
    c.save(); c.translate(x - s * 0.10, y - s * 0.10); c.rotate(-0.4);
    c.beginPath(); c.ellipse(0, 0, s * 0.065, s * 0.10, 0, 0, 6.2832); c.fill(); c.restore();
    if (type === 'golden') {
      // twinkle sparkle
      var tw = 0.5 + 0.5 * Math.sin(t / 300);
      var sx = x + s * 0.22, sy = y - s * 0.24, sr = s * (0.06 + 0.05 * tw);
      c.fillStyle = 'rgba(255,255,255,' + (0.5 + 0.5 * tw) + ')';
      c.beginPath();
      c.moveTo(sx, sy - sr * 1.6); c.quadraticCurveTo(sx, sy, sx + sr * 1.6, sy);
      c.quadraticCurveTo(sx, sy, sx, sy + sr * 1.6); c.quadraticCurveTo(sx, sy, sx - sr * 1.6, sy);
      c.quadraticCurveTo(sx, sy, sx, sy - sr * 1.6);
      c.fill();
    }
  } else {
    // rotten spots + stink
    c.fillStyle = '#4c4450';
    circle(c, x - s * 0.08, y + s * 0.05, s * 0.06); c.fill();
    circle(c, x + s * 0.10, y - s * 0.06, s * 0.045); c.fill();
    c.strokeStyle = 'rgba(110,110,115,.8)'; c.lineWidth = Math.max(1.5, s * 0.03); c.lineCap = 'round';
    for (var i = 0; i < 3; i++) {
      var wx = x - s * 0.18 + i * s * 0.18;
      c.beginPath();
      c.moveTo(wx, y - s * 0.36);
      c.quadraticCurveTo(wx + Math.sin(t / 260 + i * 2) * s * 0.07, y - s * 0.48, wx, y - s * 0.60);
      c.stroke();
    }
  }
}

// Strokes the worm's body as one or more runs. A run is broken wherever two
// consecutive trail tiles aren't grid-neighbours - i.e. across a teleport
// hop - so the body enters one portal and leaves the other instead of
// being drawn as a straight line across the board between them.
function strokeRuns(c, pts, runStart, col, w, dx, dy) {
  c.strokeStyle = col; c.lineWidth = w;
  c.beginPath();
  for (var i = 0; i < pts.length; i++) {
    if (runStart[i]) c.moveTo(pts[i].x + dx, pts[i].y + dy);
    else c.lineTo(pts[i].x + dx, pts[i].y + dy);
  }
  c.stroke();
}

function drawWorm(c, t) {
  var ts = board.ts;
  var T = G.trail, n = Math.min(T.length, ha.idx + 1), hx = ha.x, hy = ha.y;
  if (rewind) {
    // mid-undo: draw the old, longer trail being reeled back in
    T = rewind.trail;
    var i0 = Math.max(rewind.to, Math.floor(rewind.cur)), fr = rewind.cur - i0;
    n = i0 + 1;
    var A = centerOf(T[i0].r, T[i0].c);
    if (i0 + 1 < T.length && fr > 0) {
      var B = centerOf(T[i0 + 1].r, T[i0 + 1].c);
      var adj = Math.abs(T[i0].r - T[i0 + 1].r) + Math.abs(T[i0].c - T[i0 + 1].c) === 1;
      if (adj) { hx = lerp(A.x, B.x, fr); hy = lerp(A.y, B.y, fr); n = i0 + 2; }
      else { hx = A.x; hy = A.y; }
    } else { hx = A.x; hy = A.y; }
  }
  var pts = new Array(n), runStart = new Array(n);
  for (var i = 0; i < n; i++) {
    var p = T[i];
    pts[i] = { x: board.ox + (p.c + 0.5) * ts, y: board.oy + (p.r + 0.5) * ts };
    runStart[i] = i === 0 || (Math.abs(p.r - T[i - 1].r) + Math.abs(p.c - T[i - 1].c)) !== 1;
  }
  var tilt = 0;
  if (bumpAnim) {
    var bt = (t - bumpAnim.t0) / 170;
    if (bt < 1) {
      var off = Math.sin(bt * Math.PI) * ts * 0.20;
      hx += DIRV[bumpAnim.dir][0] * off; hy += DIRV[bumpAnim.dir][1] * off;
    } else if (bt < 3.2) {
      tilt = Math.sin((bt - 1) * 9) * 0.16 * (1 - (bt - 1) / 2.2); // little head-shake after the bonk
    } else bumpAnim = null;
  }
  if (t - wally.giggle < 520) { var gp = (t - wally.giggle) / 520; tilt += Math.sin(gp * 28) * 0.2 * (1 - gp); }
  pts[n - 1] = { x: hx, y: hy };
  c.lineCap = 'round'; c.lineJoin = 'round';
  if (n === 1) {
    c.fillStyle = 'rgba(0,0,0,.18)'; circle(c, hx, hy + ts * 0.07, ts * 0.32); c.fill();
    c.fillStyle = '#c94f7c'; circle(c, hx, hy, ts * 0.32); c.fill();
    c.fillStyle = '#ff9eb4'; circle(c, hx, hy, ts * 0.25); c.fill();
  } else {
    // contact shadow, outline, body, segment bands, then a soft highlight
    // along the top edge - reads as a round, squishy tube
    strokeRuns(c, pts, runStart, 'rgba(0,0,0,.18)', ts * 0.62, 0, ts * 0.07);
    strokeRuns(c, pts, runStart, '#c94f7c', ts * 0.64, 0, 0);
    strokeRuns(c, pts, runStart, '#ff9eb4', ts * 0.50, 0, 0);
    c.save();
    c.lineCap = 'butt';
    c.setLineDash([ts * 0.045, ts * 0.455]);
    c.lineDashOffset = -ts * 0.23;
    strokeRuns(c, pts, runStart, 'rgba(201,79,124,.2)', ts * 0.34, 0, 0);
    c.restore();
    strokeRuns(c, pts, runStart, 'rgba(255,255,255,.3)', ts * 0.09, -ts * 0.04, -ts * 0.09);
    // tail tip gives a tiny wag now and then
    var wag = Math.sin(t / 180) * ts * 0.03 * (Math.sin(t / 1300) > 0.6 ? 1 : 0);
    c.fillStyle = '#ffb3c6';
    circle(c, pts[0].x + wag, pts[0].y, ts * 0.19); c.fill();
  }
  // squash & stretch: stretch along the move, a springy squash on landing,
  // and a slow breath at rest
  var sqA = 1, sqP = 1;
  if (wally.sq) {
    var sp = (t - wally.sq.t0) / wally.sq.dur;
    if (sp >= 1 || sp < 0) wally.sq = null;
    else { var sk = Math.sin(Math.PI * sp); sqA = 1 + 0.17 * sk; sqP = 1 - 0.11 * sk; }
  }
  if (wally.land) {
    var lp = (t - wally.land) / 380;
    if (lp >= 1) wally.land = 0;
    else { var dmp = Math.exp(-lp * 5) * Math.cos(lp * 17); sqA *= 1 - 0.15 * dmp; sqP *= 1 + 0.11 * dmp; }
  }
  if (reducedMotion()) { sqA = 1; sqP = 1; }
  var breath = 1 + 0.018 * Math.sin(t / 650);
  var mood = currentMood(t);
  var bob = 0;
  if (mood === 'happy') bob = Math.abs(Math.sin(t / 170)) * ts * 0.07;
  if (mood === 'ecstatic') bob = Math.abs(Math.sin(t / 130)) * ts * 0.16;
  if (wally.idle === 'ball') bob = Math.max(0, Math.cos(t / 260 * 2)) * ts * 0.03;
  if (G.status === 'won' && wally.tier !== 'huge') tilt += Math.sin(t / 120) * 0.12; // happy wiggle
  var fx = wally.face[0], fy = wally.face[1];
  drawHead(c, hx, hy - bob, ts * 0.42 * breath, fx, fy, mood, t,
           { look: wally.look, squash: [sqA, sqP], tilt: tilt, hat: save.hat, big: wally.big });
  drawWallyExtras(c, t, hx, hy - bob);
}
// Things that happen around Wally's head: thought bubble, dirt ball,
// snoozing Zzz, the butterfly, and the first-level coaching arrow.
function drawWallyExtras(c, t, hx, hy) {
  var ts = board.ts;
  if (wally.idle === 'think') {
    var ph = Math.min(1, (t - wally.lastInput - 11000) / 400);
    c.save(); c.globalAlpha = ph;
    var bx = hx + ts * 0.75, by = hy - ts * 1.05;
    c.fillStyle = 'rgba(255,255,255,.95)';
    circle(c, hx + ts * 0.36, hy - ts * 0.5, ts * 0.05); c.fill();
    circle(c, hx + ts * 0.5, hy - ts * 0.68, ts * 0.08); c.fill();
    c.beginPath(); c.ellipse(bx, by, ts * 0.34, ts * 0.27, 0, 0, 6.2832); c.fill();
    if (Object.keys(G.apples).length) drawApple(c, bx, by + Math.sin(t / 400) * ts * 0.02, ts * 0.52, 'red', t);
    else { c.fillStyle = INK; c.font = '800 ' + Math.round(ts * 0.34) + 'px "Baloo 2",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', bx, by); }
    c.restore();
  } else if (wally.idle === 'ball') {
    var b = ballPos(t);
    var lift = (hy - ts * 0.05 - b.y) / (ts * 0.62);
    c.fillStyle = 'rgba(0,0,0,' + (0.2 - lift * 0.1) + ')'; c.beginPath(); c.ellipse(b.x, hy + ts * 0.18, ts * (0.1 - lift * 0.03), ts * 0.035, 0, 0, 6.2832); c.fill();
    c.fillStyle = '#9a6536'; c.strokeStyle = '#5e3b1c'; c.lineWidth = Math.max(1.5, ts * 0.03);
    circle(c, b.x, b.y, ts * 0.11); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.3)'; circle(c, b.x - ts * 0.035, b.y - ts * 0.035, ts * 0.035); c.fill();
  } else if (wally.idle === 'sleep') {
    c.save();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (var z = 0; z < 3; z++) {
      var zp = ((t / 1800) + z / 3) % 1;
      c.globalAlpha = Math.sin(zp * Math.PI);
      c.font = '800 ' + Math.round(ts * (0.2 + zp * 0.18)) + 'px "Baloo 2",sans-serif';
      c.fillText('z', hx + ts * (0.4 + zp * 0.45), hy - ts * (0.45 + zp * 0.9));
    }
    c.restore();
  }
  var bf = wally.butterfly;
  if (bf) drawButterfly(c, bf, t, ts);
  if (coach && coach.stage === 0 && coach.dir && G.status === 'playing') {
    var d = DIRV[coach.dir];
    c.save();
    c.strokeStyle = '#fff'; c.lineWidth = Math.max(3, ts * 0.07); c.lineCap = 'round'; c.lineJoin = 'round';
    for (var k = 0; k < 3; k++) {
      var cp = ((t / 900) + k / 3) % 1;
      c.globalAlpha = Math.sin(cp * Math.PI) * 0.9;
      var cx = hx + d[0] * ts * (0.65 + cp * 0.9), cy = hy + d[1] * ts * (0.65 + cp * 0.9), s2 = ts * 0.14;
      var px = -d[1], py = d[0];
      c.beginPath();
      c.moveTo(cx - d[0] * s2 + px * s2, cy - d[1] * s2 + py * s2);
      c.lineTo(cx, cy);
      c.lineTo(cx - d[0] * s2 - px * s2, cy - d[1] * s2 - py * s2);
      c.stroke();
    }
    c.restore();
  }
}
function drawButterfly(c, bf, t, ts) {
  var flapRate = bf.phase === 'sit' ? 520 : 70;
  var fl = Math.abs(Math.sin(t / flapRate + bf.flap));
  var s = ts * 0.13;
  c.save(); c.translate(bf.x, bf.y);
  c.fillStyle = bf.col; c.strokeStyle = 'rgba(40,20,20,.55)'; c.lineWidth = 1;
  [-1, 1].forEach(function (side) {
    c.save(); c.scale(side * (0.25 + 0.75 * fl), 1);
    c.beginPath(); c.ellipse(s * 0.7, -s * 0.35, s * 0.75, s * 0.55, -0.4, 0, 6.2832); c.fill(); c.stroke();
    c.beginPath(); c.ellipse(s * 0.55, s * 0.45, s * 0.5, s * 0.38, 0.4, 0, 6.2832); c.fill(); c.stroke();
    c.restore();
  });
  c.fillStyle = '#3a2a2a'; c.beginPath(); c.ellipse(0, 0, s * 0.14, s * 0.6, 0, 0, 6.2832); c.fill();
  c.strokeStyle = '#3a2a2a'; c.beginPath(); c.moveTo(0, -s * 0.5); c.lineTo(-s * 0.3, -s * 1); c.moveTo(0, -s * 0.5); c.lineTo(s * 0.3, -s * 1); c.stroke();
  c.restore();
}

function drawHazard(c, t) {
  if (!G.patrol) return;
  var ts = board.ts;
  var th = curTheme;
  var x = haz.x, y = haz.y;
  var pulse = 0.5 + 0.5 * Math.sin(t / 210);
  c.save();
  c.translate(x, y);
  // creeping shadow pool
  c.fillStyle = 'rgba(0,0,0,.30)';
  c.beginPath(); c.ellipse(0, ts * 0.22, ts * 0.26, ts * 0.09, 0, 0, 6.2832); c.fill();
  // glowing thorn body: a spiky burr that slowly rotates
  c.shadowColor = th.hazGlow || 'rgba(255,60,90,.55)';
  c.shadowBlur = ts * (0.28 + 0.14 * pulse);
  c.fillStyle = th.hazColor || '#7c1f3d';
  var spikes = 8, rot = t / 900;
  c.beginPath();
  for (var i = 0; i < spikes * 2; i++) {
    var ang = rot + (i / (spikes * 2)) * 6.2832;
    var rad = (i % 2 === 0) ? ts * 0.30 : ts * 0.15;
    var px = Math.cos(ang) * rad, py = Math.sin(ang) * rad;
    if (i === 0) c.moveTo(px, py); else c.lineTo(px, py);
  }
  c.closePath(); c.fill();
  c.shadowBlur = 0;
  // two glowing eyes so it reads as a hunter, not just a spiky rock
  c.fillStyle = th.hazEye || '#ff3355';
  var ex = ts * 0.10, ey = -ts * 0.02;
  var fl = Math.max(0, 1 - (now() - haz.flash) / 500), er = ts * (0.045 + 0.03 * fl);
  if (fl > 0) { c.shadowColor = th.hazEye || '#ff3355'; c.shadowBlur = ts * 0.3 * fl; }
  circle(c, -ex, ey, er); c.fill();
  circle(c, ex, ey, er); c.fill();
  c.shadowBlur = 0;
  c.restore();
}
function drawParticles(c) {
  for (var i = 0; i < particles.length; i++) {
    var p = particles[i], k = 1 - p.age / p.life;
    c.fillStyle = p.col;
    if (p.shape === 'dust') {
      c.globalAlpha = Math.max(0, k) * 0.7;
      circle(c, p.x, p.y, p.r * (1 + (1 - k) * 0.9)); c.fill();
    } else if (p.shape === 'spark') {
      c.globalAlpha = Math.max(0, Math.sin(k * Math.PI));
      var sr = p.r * (0.6 + 0.6 * Math.sin(k * Math.PI));
      c.beginPath(); c.moveTo(p.x, p.y - sr * 1.6); c.quadraticCurveTo(p.x, p.y, p.x + sr * 1.6, p.y);
      c.quadraticCurveTo(p.x, p.y, p.x, p.y + sr * 1.6); c.quadraticCurveTo(p.x, p.y, p.x - sr * 1.6, p.y);
      c.quadraticCurveTo(p.x, p.y, p.x, p.y - sr * 1.6); c.fill();
    } else if (p.shape === 'rect') {
      c.globalAlpha = Math.max(0, k);
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot || 0);
      c.fillRect(-p.r, -p.r * 0.6, p.r * 2, p.r * 1.2);
      c.restore();
    } else { c.globalAlpha = Math.max(0, k); circle(c, p.x, p.y, p.r * k + 0.5); c.fill(); }
  }
  c.globalAlpha = 1;
}
function drawRings(c, t) {
  for (var i = 0; i < rings.length; i++) {
    var g = rings[i], p = (t - g.t0) / g.dur;
    if (p < 0 || p > 1) continue;
    c.globalAlpha = 1 - p;
    c.strokeStyle = g.col; c.lineWidth = Math.max(1.5, board.ts * 0.05 * (1 - p));
    circle(c, g.x, g.y, lerp(g.r0, g.r1, easeOutCubic(p))); c.stroke();
  }
  c.globalAlpha = 1;
}
function drawPopups(c, t) {
  for (var i = 0; i < popups.length; i++) {
    var p = popups[i], age = t - p.t0;
    if (age < 0) continue;
    var rise = age * 0.045;
    var alpha = age > 650 ? Math.max(0, 1 - (age - 650) / 350) : 1;
    c.globalAlpha = alpha;
    var size = 16, col = '#fff', stroke = 'rgba(60,30,10,.8)';
    if (p.kind === 'nom') { size = age < 200 ? 20 + age * 0.06 : 32; col = '#fff'; }
    else if (p.kind === 'combo') { size = 20 + (p.n || 2) * 4; col = '#ff9f1c'; }
    else if (p.kind === 'jackpot') { size = age < 220 ? 26 + age * 0.07 : 42; col = '#ffd54f'; }
    else if (p.kind === 'score') { size = 16; col = '#ffd54f'; }
    else if (p.kind === 'green') { size = 15; col = '#b9f6ca'; }
    else if (p.kind === 'think') { size = age < 160 ? 12 + age * 0.06 : 22; col = '#fff'; rise = age * 0.02; }
    c.font = '800 ' + size + 'px "Baloo 2",ui-rounded,"SF Pro Rounded",-apple-system,sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 4; c.strokeStyle = stroke;
    // keep the whole word on the canvas, even for an apple in a corner
    var hw = c.measureText(p.text).width / 2 + 4;
    var px = Math.min(board.w - hw, Math.max(hw, p.x)), py = Math.max(size * 0.6, p.y - rise);
    c.strokeText(p.text, px, py);
    c.fillStyle = col;
    c.fillText(p.text, px, py);
  }
  c.globalAlpha = 1;
}

function render(t) {
  if (staticDirty) buildStatic();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, board.w, board.h);
  var rm = reducedMotion();
  // board "settles in" when a level starts: a quick fade + scale-up
  var intro = rm ? 1 : Math.min(1, (t - introT0) / 280);
  if (intro < 1) {
    var e = easeOutCubic(intro);
    var cx = board.w / 2, cy = board.h / 2, sc = 0.94 + 0.06 * e;
    ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
  }
  // after a win the camera eases in on Wally while he celebrates
  if (G.status === 'won' && !rm) {
    // ...but never so far that the board's frame slides off the canvas
    var bw0 = G.C * board.ts + 16, bh0 = G.R * board.ts + 16;
    var zMax = Math.min(board.w / bw0, board.h / bh0);
    var z = Math.min(zMax, 1 + 0.07 * easeOutCubic(Math.min(1, (t - wally.winT) / 900)));
    if (z > 1.001) {
      var L = ha.x + (board.ox - 8 - ha.x) * z, R = ha.x + (board.ox + bw0 - 8 - ha.x) * z;
      var Tt = ha.y + (board.oy - 8 - ha.y) * z, B = ha.y + (board.oy + bh0 - 8 - ha.y) * z;
      var sx = L < 0 ? -L : R > board.w ? board.w - R : 0, sy = Tt < 0 ? -Tt : B > board.h ? board.h - B : 0;
      ctx.translate(sx, sy);
      ctx.translate(ha.x, ha.y); ctx.scale(z, z); ctx.translate(-ha.x, -ha.y);
    }
  }
  if (shake) {
    var sk = 1 - (t - shake.t0) / shake.dur;
    if (sk <= 0) shake = null;
    else ctx.translate((Math.random() - 0.5) * 2 * shake.mag * sk,
                       (Math.random() - 0.5) * 2 * shake.mag * sk);
  }
  var ts = board.ts;
  var alpha = intro < 1 ? easeOutCubic(intro) : 1;
  ctx.globalAlpha = alpha;
  ctx.drawImage(bgCv, 0, 0, board.w, board.h);
  for (var i = 0; i < animTiles.length; i++) drawTileAnim(ctx, animTiles[i], t);
  for (var k in G.apples) {
    var a = G.apples[k];
    var p = centerOf(a.r, a.c);
    var bob = Math.sin(t / 520 + a.r * 1.3 + a.c * 0.7) * ts * 0.022;
    var fx = appleFx[k], asc = 1, rot = 0;
    if (fx) {
      var fp = (t - fx.t0) / (fx.kind === 'in' ? 380 : 520);
      if (fx.kind === 'in' && fp < 0) continue; // not reeled back to it yet
      if (fp >= 1) delete appleFx[k];
      else if (fx.kind === 'in') asc = Math.max(0.01, easeOutBack(fp));
      else rot = Math.sin(fp * Math.PI * 5) * 0.35 * (1 - fp);
    }
    ctx.save(); ctx.translate(p.x, p.y + bob); ctx.rotate(rot); ctx.scale(asc, asc);
    drawApple(ctx, 0, 0, ts, a.type, t);
    ctx.restore();
    ctx.globalAlpha = alpha;
  }
  for (var g = 0; g < ghosts.length; g++) { // eaten-apple pop
    var gh = ghosts[g], gp = (t - gh.t0) / 200;
    if (gp > 1) continue;
    ctx.save(); ctx.globalAlpha = (1 - gp) * 0.8; ctx.translate(gh.x, gh.y); ctx.scale(1 + gp * 0.55, 1 + gp * 0.55);
    drawApple(ctx, 0, 0, ts, gh.type, t); ctx.restore();
  }
  ctx.globalAlpha = alpha;
  drawRings(ctx, t);
  drawHazard(ctx, t);
  drawWorm(ctx, t);
  drawParticles(ctx);
  drawPopups(ctx, t);
  ctx.globalAlpha = 1;
}

/* ============================== CARDS ============================== */
function drawEndFace(canvasId, mood) {
  var mc = el(canvasId), mctx = mc.getContext('2d');
  var d = Math.min(2, window.devicePixelRatio || 1);
  mc.width = 150 * d; mc.height = 112 * d;
  mctx.setTransform(d, 0, 0, d, 0, 0);
  mctx.clearRect(0, 0, 150, 112);
  // little body curl behind head
  mctx.strokeStyle = '#c94f7c'; mctx.lineCap = 'round';
  mctx.lineWidth = 26;
  mctx.beginPath(); mctx.arc(52, 108, 40, Math.PI * 1.1, Math.PI * 1.95); mctx.stroke();
  mctx.strokeStyle = '#ff9eb4'; mctx.lineWidth = 19;
  mctx.beginPath(); mctx.arc(52, 108, 40, Math.PI * 1.1, Math.PI * 1.95); mctx.stroke();
  drawHead(mctx, 88, 62, 38, 0.3, 0.95, mood, now(), { hat: save.hat, noBlink: true, look: [0, 0.3] });
}
var WIN_TITLE = { happy: 'NOM!', phew: 'Phew!', huge: 'Amazing!' };
function showComplete(stars, newBest, tier, unlocked) {
  var def = LEVELS[levelIdx];
  drawEndFace('end-canvas', tier === 'huge' ? 'ecstatic' : tier === 'phew' ? 'phew' : 'happy');
  var box = el('end-stars');
  box.innerHTML = '';
  for (var i = 0; i < 3; i++) {
    var s = document.createElement('span');
    s.innerHTML = starSvg();
    box.appendChild(s);
  }
  el('end-title').textContent = tier === 'happy' && stars === 3 ? 'Perfect!' : WIN_TITLE[tier] || 'NOM!';
  el('end-badge').hidden = !newBest;
  el('end-moves').textContent = G.moves;
  // Score used to sit next to Moves here and get its own "best" line, but
  // it doesn't unlock anything or mean anything beyond itself - moves (and
  // the stars they earn) are the real measure of how a level went, so
  // score is just the live HUD's business now, not the win card's.
  el('end-best').textContent = 'Best: ' + save.best[levelIdx] + ' moves';
  // Nudge toward the next star tier if this run didn't max it out.
  el('end-hint').innerHTML = stars < 3
    ? 'Finish in ' + (stars === 1 ? def.star2 : def.star3) + ' moves for ' + starSvg() + (stars === 1 ? starSvg() : starSvg() + starSvg())
    : '';
  var un = el('end-unlock');
  if (unlocked && unlocked.length) {
    un.innerHTML = '<svg class="ic"><use href="#ic-hat"/></svg>New hat: ' + unlocked[unlocked.length - 1].name;
    un.hidden = false;
  } else un.hidden = true;
  var last = levelIdx + 1 >= LEVELS.length;
  el('btn-next').textContent = last ? 'Level Select' : 'Next Level';
  el('modal-complete').classList.remove('hidden');
  modalOpen = true;
  var spans = box.children, lit = 0;
  function lightNext() {
    if (lit < stars && !el('modal-complete').classList.contains('hidden')) {
      spans[lit].classList.add('lit', 'pop');
      Sfx.star(lit); Haptics.tap();
      lit++;
      setTimeout(lightNext, 320);
    }
  }
  setTimeout(lightNext, 350);
}
var FAIL_TEXT = {
  trapped: ['Stuck!', 'Wally wiggled himself into a corner.'],
  // A dead end has exactly one physical opening - the tile you just came
  // in through. Once that's trailed behind you, there was never a way
  // back out, so the card names the pattern instead of just the result.
  trappedDeadEnd: ['Stuck!', "Nothing comes back out of a dead end."],
  moves: ['Out of moves!', 'Wally is all tuckered out. Try a shorter route!'],
  rotten: ['Rotten apple!', 'Yuck. That one did not agree with Wally.'],
  // A rotten tile reached mid ice-slide is a different lesson than walking
  // straight into one: the slide doesn't stop for a second thought, so the
  // card should say that, not just "yuck."
  rottenSlide: ['Rotten apple!', "Ice doesn't stop for a second thought."],
  patrol: ['Caught!', 'It steps when you step. Watch its pattern, then time your move.']
};
// Names the dead-end pattern (see FAIL_TEXT.trappedDeadEnd's comment): a
// tile with at most one physically-open neighbor (ignoring the worm's own
// trail) only ever had one way in, so getting stuck there is a spur, not a
// generic self-trap in open space.
function isDeadEndTile(g, r, c) {
  var openCount = 0;
  for (var d in Worm.DIRS) {
    var nr = r + Worm.DIRS[d][0], nc = c + Worm.DIRS[d][1];
    var t = Worm.tileAt(g, nr, nc);
    if (t !== null && t !== '#' && t !== 'C' && t !== '~') openCount++;
  }
  return openCount <= 1;
}
var failPrimary = null;
function showFail(reason, viaSlide) {
  var key = reason;
  if (reason === 'trapped' && G) {
    var hp = Worm.head(G);
    if (isDeadEndTile(G, hp.r, hp.c)) key = 'trappedDeadEnd';
  } else if (reason === 'rotten' && viaSlide) {
    key = 'rottenSlide';
  }
  var ft = FAIL_TEXT[key] || FAIL_TEXT[reason] || FAIL_TEXT.trapped;
  drawEndFace('fail-canvas', { rotten: 'sick', patrol: 'dizzy', moves: 'tired' }[reason] || 'sad');
  // A mistake is best fixed by stepping back one move; running out of
  // moves usually needs a fresh route, so there Try again leads.
  var undoOK = canUndo();
  var undoFirst = reason !== 'moves' && undoOK;
  failPrimary = undoFirst ? 'undo' : 'retry';
  el('btn-fail-primary').textContent = undoFirst ? 'Undo last move' : 'Try again';
  var sec = el('btn-retry');
  sec.textContent = undoFirst ? 'Try again' : 'Undo';
  sec.dataset.act = undoFirst ? 'retry' : 'undo';
  sec.hidden = !undoFirst && !undoOK;
  // Unhide before writing the message text: the title/sub live inside an
  // aria-live region, and a screen reader only picks up the mutation as an
  // announcement if it happens while that region is already visible/in the
  // accessibility tree, not the instant before it appears.
  el('modal-fail').classList.remove('hidden');
  modalOpen = true;
  el('fail-title').textContent = ft[0];
  el('fail-sub').textContent = ft[1];
}
function hideModals() {
  ['modal-tutorial', 'modal-complete', 'modal-fail', 'modal-pause', 'modal-story'].forEach(function (id) { el(id).classList.add('hidden'); });
  modalOpen = false; paused = false;
  if (storyState) { storyState = null; if (hud) updateHUD(); } // navigating away can't wedge the story open
}
function openModal() {
  var ids = ['modal-settings', 'modal-wardrobe', 'modal-story', 'modal-pause', 'modal-tutorial', 'modal-complete', 'modal-fail'];
  for (var i = 0; i < ids.length; i++) { var m = el(ids[i]); if (!m.classList.contains('hidden')) return m; }
  return null;
}

/* ---- the Wally & Pip storyline (story.js holds the copy + when beats play) ----
   A beat is a short run of cards over a little animated vignette. Each
   beat plays once ever; skipping still marks it seen (as in the live
   build). Progress lives in save.storySeen, the same key->true map the
   live build syncs to its server. */
var storyState = null, storyCv = null, storyCtx = null, storyW = 0, storyH = 0;
// force=true bypasses the "seen" gate - used to replay an already-watched
// beat from Settings, since skipping one the first time round marks it
// seen forever and there was previously no way back to it.
function showStory(key, onDone, force) {
  var def = STORIES[key];
  if (!def || (!force && save.storySeen && save.storySeen[key])) return false;
  storyState = { key: key, def: def, index: 0, onDone: onDone, replay: !!force, t0: now() };
  moveQueue = []; hideToast();
  el('modal-story').classList.remove('hidden');
  el('story-skip').hidden = !!force; // nothing to "skip" when just replaying
  modalOpen = true;
  storyCv = el('story-canvas'); storyCtx = storyCv.getContext('2d');
  var r = storyCv.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
  storyW = r.width || 280; storyH = r.height || 116;
  storyCv.width = storyW * d; storyCv.height = storyH * d; storyCtx.setTransform(d, 0, 0, d, 0, 0);
  renderStoryCard();
  if (hud) updateHUD(); // undo is off while a story card is up
  return true;
}
function renderStoryCard() {
  var st = storyState, n = st.def.cards.length;
  el('story-title').textContent = st.def.title;
  el('story-body').textContent = st.def.cards[st.index];
  var dots = '';
  if (n > 1) for (var i = 0; i < n; i++) dots += '<span class="' + (i === st.index ? 'active' : '') + '"></span>';
  el('story-dots').innerHTML = dots;
  el('story-next').textContent = st.index < n - 1 ? 'Continue' : (st.replay ? 'Done' : 'Let’s wiggle!');
  st.cardT0 = now();
}
function storyNext() {
  if (!storyState) return;
  audioGesture(); Sfx.click();
  if (storyState.index < storyState.def.cards.length - 1) { storyState.index++; renderStoryCard(); }
  else finishStory();
}
function finishStory() {
  var st = storyState;
  if (!st) return;
  save.storySeen = save.storySeen || {};
  save.storySeen[st.key] = true;
  persist();
  el('modal-story').classList.add('hidden');
  storyState = null; modalOpen = false;
  if (hud && G) updateHUD();
  noteInput();
  if (st.onDone) st.onDone();
}
// Reopen a beat the player has already seen (Settings > Wally & Pip's story).
function replayStory(key) {
  closeSettings();
  showStory(key, openSettings, true);
}
// Pip the ladybug, facing left (toward Wally) unless o.flip.
function drawLadybug(c, x, y, r, t, o) {
  o = o || {};
  c.save(); c.translate(x, y); if (o.flip) c.scale(-1, 1);
  if (o.flying) { // gauzy wings, fluttering
    var fl = Math.abs(Math.sin(t / 55));
    c.fillStyle = 'rgba(225,245,255,.7)'; c.strokeStyle = 'rgba(120,160,190,.5)'; c.lineWidth = 1;
    c.save(); c.rotate(-0.5 - fl * 0.6); c.beginPath(); c.ellipse(r * 0.25, -r * 0.8, r * 0.36, r * 0.8, 0.3, 0, 6.2832); c.fill(); c.stroke(); c.restore();
    c.save(); c.rotate(0.3 + fl * 0.6); c.beginPath(); c.ellipse(r * 0.5, -r * 0.7, r * 0.34, r * 0.75, 0.6, 0, 6.2832); c.fill(); c.stroke(); c.restore();
  }
  // little legs
  c.strokeStyle = INK; c.lineWidth = Math.max(1, r * 0.08); c.lineCap = 'round';
  for (var l = -1; l <= 1; l++) { c.beginPath(); c.moveTo(l * r * 0.4, r * 0.65); c.lineTo(l * r * 0.5 - r * 0.08, r * 0.95); c.stroke(); }
  // shell
  c.fillStyle = '#e8392f'; c.strokeStyle = '#8f1d16'; c.lineWidth = Math.max(1.2, r * 0.08);
  c.beginPath(); c.ellipse(0, 0, r, r * 0.84, 0, 0, 6.2832); c.fill(); c.stroke();
  c.strokeStyle = '#6a120c'; c.lineWidth = Math.max(1, r * 0.07);
  c.beginPath(); c.moveTo(-r * 0.35, -r * 0.8); c.quadraticCurveTo(r * 0.05, 0, -r * 0.2, r * 0.82); c.stroke();
  c.fillStyle = INK;
  [[0.38, -0.34, 0.2], [0.52, 0.3, 0.17], [-0.02, 0.45, 0.15], [0.08, -0.52, 0.13]].forEach(function (p) { circle(c, p[0] * r, p[1] * r, p[2] * r); c.fill(); });
  c.fillStyle = 'rgba(255,255,255,.45)'; c.beginPath(); c.ellipse(r * 0.2, -r * 0.5, r * 0.26, r * 0.11, -0.3, 0, 6.2832); c.fill();
  // head, antennae, face
  c.fillStyle = INK; circle(c, -r * 0.82, r * 0.05, r * 0.48); c.fill();
  c.strokeStyle = INK; c.lineWidth = Math.max(1, r * 0.07);
  var bob = Math.sin(t / 300) * r * 0.06;
  c.beginPath(); c.moveTo(-r * 0.95, -r * 0.35); c.quadraticCurveTo(-r * 1.2, -r * 0.8, -r * 1.35, -r * 0.85 + bob); c.stroke();
  c.beginPath(); c.moveTo(-r * 0.7, -r * 0.4); c.quadraticCurveTo(-r * 0.8, -r * 0.9, -r * 0.95, -r * 1.02 - bob); c.stroke();
  circle(c, -r * 1.35, -r * 0.85 + bob, r * 0.09); c.fill(); circle(c, -r * 0.95, -r * 1.02 - bob, r * 0.09); c.fill();
  var blink = (t % 3100) < 120;
  c.fillStyle = '#fff';
  [[-1.02, -0.02], [-0.7, -0.04]].forEach(function (e) {
    if (blink) { c.fillRect((e[0] - 0.12) * r, e[1] * r, 0.24 * r, 0.04 * r); return; }
    circle(c, e[0] * r, e[1] * r, r * 0.15); c.fill();
    c.fillStyle = INK; circle(c, (e[0] - 0.05) * r, (e[1] + 0.02) * r, r * 0.075); c.fill(); c.fillStyle = '#fff';
  });
  c.strokeStyle = '#ff8fab'; c.lineWidth = Math.max(1, r * 0.06);
  c.beginPath(); c.arc(-r * 0.88, r * 0.2, r * 0.13, Math.PI * 0.15, Math.PI * 0.85); c.stroke();
  c.restore();
}
// Which backdrop each story beat plays against. Beats before a world's
// first level use that world's palette; everything else stays in the
// garden look the early beats were designed around.
var STORY_SCENE = { world4: 'frost', world5: 'tunnels', world6: 'nightshade', world7: 'summit', finale: 'summit', ending: 'summit' };
var STORY_BACKDROP = {
  garden: { sky0: '#bfe8ff', sky1: '#d9f3c2', gnd0: '#9ad66a', gnd1: '#6fbf4a', trunk: '#6a8f3a', leaf: '#4f8a36', grassStroke: 'rgba(46,110,30,.5)' },
  frost: { sky0: '#dcf1ff', sky1: '#eef8ff', gnd0: '#eaf6ff', gnd1: '#cfe6f7', trunk: '#7e93a3', leaf: '#8fb9d8', grassStroke: 'rgba(90,140,170,.45)' },
  tunnels: { sky0: '#2a2040', sky1: '#241c33', gnd0: '#463a58', gnd1: '#372c46', trunk: '#5a4a6b', leaf: '#6b567f', grassStroke: 'rgba(180,150,255,.3)' },
  nightshade: { sky0: '#1c1128', sky1: '#180f22', gnd0: '#2e1f38', gnd1: '#251830', trunk: '#3a2748', leaf: '#4a2f5a', grassStroke: 'rgba(157,78,221,.4)' },
  summit: { sky0: '#a9d8ff', sky1: '#dfeeff', gnd0: '#eef4fa', gnd1: '#d7e6f2', trunk: '#7e93a3', leaf: '#8fb9d8', grassStroke: 'rgba(140,170,200,.4)' }
};
function drawStoryVignette(t) {
  var st = storyState, c = storyCtx;
  if (!st || !c) return;
  var w = storyW, h = storyH;
  var scene = STORY_SCENE[st.key] || 'garden', bd = STORY_BACKDROP[scene];
  c.clearRect(0, 0, w, h);
  // rounded panel: a strip of sky over whatever world Wally's in now
  c.save(); rr(c, 0, 0, w, h, 14); c.clip();
  var g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, bd.sky0); g.addColorStop(0.42, bd.sky1); g.addColorStop(0.43, bd.gnd0); g.addColorStop(1, bd.gnd1);
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  // a distant tree; from "Almost There" on, it bears the Golden Apple
  var golden = st.key === 'after12' || st.key === 'finale' || st.key === 'ending';
  c.fillStyle = bd.trunk; c.fillRect(w * 0.86 - 3, h * 0.3, 6, h * 0.16);
  c.fillStyle = bd.leaf; circle(c, w * 0.86, h * 0.26, h * 0.13); c.fill(); circle(c, w * 0.81, h * 0.31, h * 0.09); c.fill(); circle(c, w * 0.91, h * 0.31, h * 0.09); c.fill();
  if (golden) {
    var tw = 0.5 + 0.5 * Math.sin(t / 260), big = st.key === 'ending';
    c.save(); c.shadowColor = 'rgba(255,213,79,.95)'; c.shadowBlur = (big ? 12 : 8) + tw * (big ? 12 : 8);
    c.fillStyle = '#ffc93c'; circle(c, w * 0.86, h * 0.27, h * (big ? 0.065 : 0.05)); c.fill();
    if (big) { circle(c, w * 0.8, h * 0.32, h * 0.035); c.fill(); circle(c, w * 0.92, h * 0.31, h * 0.035); c.fill(); }
    c.restore();
  }
  // ground decoration: daisies (garden/frost/summit-as-flecks), glowing
  // crystals (tunnels) or nightshade blooms - whichever fits the scene
  var fleckCols = scene === 'tunnels' ? ['#ffe27a', '#c9a6ff', '#7fe8d0'] :
    scene === 'nightshade' ? ['#ff6fae', '#9d4edd', '#5fe8c0'] : null;
  for (var i = 0; i < 7; i++) {
    var fx = hash2(i, 2, 5) * w, fy = h * (0.55 + hash2(i, 7, 1) * 0.38), fr = h * 0.03;
    if (fleckCols) {
      var fc = fleckCols[i % fleckCols.length];
      c.save(); c.shadowColor = fc; c.shadowBlur = 6; c.fillStyle = fc; circle(c, fx, fy, fr * 0.6); c.fill(); c.restore();
    } else if (scene === 'frost' || scene === 'summit') {
      c.save(); c.shadowColor = '#fff'; c.shadowBlur = 4; c.fillStyle = '#ffffff'; circle(c, fx, fy, fr * 0.45); c.fill(); c.restore();
    } else {
      c.fillStyle = '#fff';
      for (var p = 0; p < 5; p++) { var a = p / 5 * 6.2832; circle(c, fx + Math.cos(a) * fr * 1.3, fy + Math.sin(a) * fr * 1.3, fr); c.fill(); }
      c.fillStyle = '#ffcf3f'; circle(c, fx, fy, fr * 0.9); c.fill();
    }
  }
  c.strokeStyle = bd.grassStroke; c.lineWidth = 1.5; c.lineCap = 'round';
  for (var gI = 0; gI < 10; gI++) {
    var gx = hash2(gI, 9, 3) * w, gy = h * (0.6 + hash2(gI, 4, 8) * 0.35), sw = Math.sin(t / 700 + gI) * 1.5;
    c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx - 2 + sw, gy - 7); c.moveTo(gx + 3, gy); c.lineTo(gx + 4 + sw, gy - 8); c.stroke();
  }
  // Wally: body curl + head, looking toward Pip (or the apple)
  var mood = 'happy';
  if (st.key === 'intro' && st.index === 1) mood = 'worried';
  else if (st.key === 'after6') mood = 'phew';
  else if (st.key === 'after9' || st.key === 'ending') mood = 'ecstatic';
  var hr = h * 0.2, hx = w * 0.34, hy = h * 0.6 + Math.sin(t / 420) * 2;
  c.strokeStyle = '#c94f7c'; c.lineWidth = hr * 1.25;
  c.beginPath(); c.moveTo(w * 0.08, h * 0.86); c.quadraticCurveTo(w * 0.16, h * 0.52 + Math.sin(t / 380) * 3, hx - hr * 0.6, hy + hr * 0.3); c.stroke();
  c.strokeStyle = '#ff9eb4'; c.lineWidth = hr * 0.98;
  c.beginPath(); c.moveTo(w * 0.08, h * 0.86); c.quadraticCurveTo(w * 0.16, h * 0.52 + Math.sin(t / 380) * 3, hx - hr * 0.6, hy + hr * 0.3); c.stroke();
  var meetPip = st.key !== 'intro';
  var px = w * 0.62 + Math.sin(t / 900) * 6, py = h * 0.38 + Math.sin(t / 330) * 4;
  var tx = meetPip ? px : w * 0.62, ty = meetPip ? py : h * 0.62;
  var lx = tx - hx, ly = ty - hy, ll = Math.hypot(lx, ly) || 1;
  drawHead(c, hx, hy, hr, 0.85, 0.5, mood, t, { hat: save.hat, look: [lx / ll, ly / ll] });
  if (meetPip) drawLadybug(c, px, py, h * 0.11, t, { flying: true });
  else drawApple(c, w * 0.62, h * 0.66 + Math.sin(t / 500) * 2, h * 0.42, 'red', t);
  c.restore();
}

/* ---- pause: Wally asleep in his burrow ---- */
var pcv = null, pctx = null, pW = 0, pH = 0;
function pauseGame(quiet) {
  if (activeScreen !== 'screen-game' || !G || paused || transitioning || openModal()) return;
  paused = true; modalOpen = true; moveQueue = [];
  clearTimeout(endTimer);
  el('pause-sub').textContent = 'Level ' + (levelIdx + 1) + ' · ' + G.movesLeft + (G.movesLeft === 1 ? ' move' : ' moves') + ' left';
  renderToggles(el('pause-toggles'));
  el('modal-pause').classList.remove('hidden');
  Music.muffle(true);
  if (!quiet) Sfx.pauseIn();
  pcv = el('pause-canvas'); pctx = pcv.getContext('2d');
  var r = pcv.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
  pW = r.width || 280; pH = r.height || 150;
  pcv.width = pW * d; pcv.height = pH * d; pctx.setTransform(d, 0, 0, d, 0, 0);
}
function resumeGame() {
  if (!paused) return;
  el('modal-pause').classList.add('hidden');
  paused = false; modalOpen = false;
  audioGesture(); Music.muffle(false); Sfx.pauseOut(); noteInput();
  // a win/lose that happened just before pausing still gets its card
  if (G && G.status === 'won') showComplete(Worm.starsFor(LEVELS[levelIdx], G.moves), false, wally.tier, null);
  else if (G && G.status === 'lost') showFail(G.loseReason);
}
function drawPauseScene(t) {
  if (!pctx) return;
  var c = pctx, w = pW, h = pH;
  c.clearRect(0, 0, w, h);
  // soil, with a strip of grass on top
  var g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#7a5230'); g.addColorStop(1, '#3f2716');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.fillStyle = '#5da33a'; c.fillRect(0, 0, w, 14);
  c.strokeStyle = '#4c8f2e'; c.lineWidth = 2; c.lineCap = 'round';
  for (var b = 6; b < w; b += 9) { var sw = Math.sin(t / 700 + b) * 1.5; c.beginPath(); c.moveTo(b, 14); c.lineTo(b + sw, 6 + (b * 7) % 5); c.stroke(); }
  // pebbles and roots
  for (var i = 0; i < 14; i++) {
    var px = hash2(i, 3, 9) * w, py = 24 + hash2(i, 5, 2) * (h - 30);
    c.fillStyle = 'rgba(0,0,0,' + (0.12 + hash2(i, 1, 1) * 0.12) + ')';
    c.beginPath(); c.ellipse(px, py, 3 + hash2(i, 7, 4) * 5, 2 + hash2(i, 2, 8) * 3, hash2(i, 9, 9) * 3, 0, 6.2832); c.fill();
  }
  c.strokeStyle = 'rgba(160,110,60,.55)'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(w * 0.18, 14); c.bezierCurveTo(w * 0.2, 40, w * 0.1, 50, w * 0.14, 80); c.stroke();
  c.beginPath(); c.moveTo(w * 0.82, 14); c.bezierCurveTo(w * 0.8, 34, w * 0.9, 44, w * 0.86, 64); c.stroke();
  // the burrow: a warm, dark chamber
  var cx = w / 2, cy = h * 0.62;
  var cg = c.createRadialGradient(cx, cy, 10, cx, cy, w * 0.34);
  cg.addColorStop(0, '#4a2e18'); cg.addColorStop(1, '#2a180c');
  c.fillStyle = cg; c.beginPath(); c.ellipse(cx, cy, w * 0.32, h * 0.3, 0, 0, 6.2832); c.fill();
  c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 3; c.stroke();
  // Wally curled up asleep, breathing slowly
  var br = 1 + Math.sin(t / 900) * 0.03;
  c.save(); c.translate(cx - 6, cy + 8); c.scale(br, br);
  c.lineCap = 'round';
  c.strokeStyle = '#c94f7c'; c.lineWidth = 17;
  c.beginPath(); c.arc(0, 0, 22, Math.PI * 0.15, Math.PI * 1.55); c.stroke();
  c.strokeStyle = '#ff9eb4'; c.lineWidth = 12;
  c.beginPath(); c.arc(0, 0, 22, Math.PI * 0.15, Math.PI * 1.55); c.stroke();
  c.fillStyle = '#ffb3c6'; circle(c, Math.cos(Math.PI * 0.15) * 22, Math.sin(Math.PI * 0.15) * 22, 5); c.fill();
  c.restore();
  drawHead(c, cx + 18, cy - 4, 15, -0.2, 0.98, 'sleepy', t, { hat: save.hat, noBlink: true });
  // Zzz
  c.save(); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (var z = 0; z < 3; z++) {
    var zp = ((t / 2000) + z / 3) % 1;
    c.globalAlpha = Math.sin(zp * Math.PI) * 0.9;
    c.font = '800 ' + Math.round(10 + zp * 9) + 'px "Baloo 2",sans-serif';
    c.fillText('z', cx + 30 + zp * 26, cy - 24 - zp * 38);
  }
  c.restore();
  // an apple core, saved for later
  c.save(); c.translate(cx - 44, cy + 20);
  c.fillStyle = '#f3e1b5'; c.beginPath(); c.ellipse(0, 0, 4, 7, 0, 0, 6.2832); c.fill();
  c.fillStyle = '#ef3b2d'; c.beginPath(); c.ellipse(0, -7, 6, 3, 0, 0, 6.2832); c.fill(); c.beginPath(); c.ellipse(0, 7, 6, 3, 0, 0, 6.2832); c.fill();
  c.strokeStyle = '#7a4a21'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, -9); c.lineTo(1, -13); c.stroke();
  c.restore();
}

/* ---- settings (home gear + the pause menu's quick toggles) ---- */
var SETTINGS = [
  { key: 'music', label: 'Music', icon: 'ic-music' },
  { key: 'sound', label: 'Sound effects', icon: 'ic-sound-on' },
  { key: 'haptics', label: 'Haptics', icon: 'ic-haptic' },
  { key: 'reduceMotion', label: 'Reduce motion', icon: 'ic-motion', note: 'Calmer animations, no screen shake' }
];
function hapticsNote() { return (navigator.vibrate || Haptics.ios) ? 'Little taps as you play' : 'Not available on this device'; }
function settingOn(k) { return k === 'reduceMotion' ? reducedMotion() : !!save[k]; }
function setSetting(k, v) {
  save[k] = v; persist();
  if (k === 'music') { if (v) { Sfx.wake(); Music.play(); } else Music.stop(); }
  if (k === 'sound' && v) { Sfx.wake(); Sfx.click(); }
  if (k === 'haptics' && v) Haptics.tap();
  if (k === 'reduceMotion') document.body.classList.toggle('rm', v);
}
function renderSettings() {
  var list = el('settings-list');
  list.innerHTML = '';
  SETTINGS.forEach(function (st) {
    var b = document.createElement('button');
    b.className = 'set-row'; b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', settingOn(st.key) ? 'true' : 'false');
    var note = st.key === 'haptics' ? hapticsNote() : st.note;
    b.innerHTML = '<svg class="ic"><use href="#' + st.icon + '"/></svg><span class="set-label">' + st.label +
      (note ? '<span class="set-note">' + note + '</span>' : '') + '</span><span class="switch"></span>';
    b.addEventListener('click', function () {
      setSetting(st.key, !settingOn(st.key));
      b.setAttribute('aria-checked', settingOn(st.key) ? 'true' : 'false');
      if (st.key !== 'sound') Sfx.click();
    });
    list.appendChild(b);
  });
  renderStoryReplayList();
}
// A beat you skip is marked seen forever (same as finishing it), so this
// list is the only way back to one you clicked past too fast.
function renderStoryReplayList() {
  var wrap = el('settings-story-wrap'), box = el('settings-story');
  var seen = STORY_ORDER.filter(function (k) { return save.storySeen && save.storySeen[k]; });
  wrap.hidden = seen.length === 0;
  if (seen.length === 0) return;
  box.innerHTML = '';
  seen.forEach(function (key) {
    var b = document.createElement('button');
    b.className = 'story-replay-row';
    b.textContent = STORIES[key].title;
    b.addEventListener('click', function () { replayStory(key); });
    box.appendChild(b);
  });
}
function renderToggles(box) {
  box.innerHTML = '';
  SETTINGS.slice(0, 3).forEach(function (st) {
    var b = document.createElement('button');
    b.className = 'toggle-chip'; b.setAttribute('role', 'switch');
    b.setAttribute('aria-label', st.label);
    b.setAttribute('aria-checked', settingOn(st.key) ? 'true' : 'false');
    b.innerHTML = '<svg class="ic"><use href="#' + st.icon + '"/></svg>';
    b.addEventListener('click', function () {
      setSetting(st.key, !settingOn(st.key));
      b.setAttribute('aria-checked', settingOn(st.key) ? 'true' : 'false');
      if (st.key === 'music') Music.muffle(true); // still paused
      if (st.key !== 'sound') Sfx.click();
    });
    box.appendChild(b);
  });
}
function openSettings() { renderSettings(); el('modal-settings').classList.remove('hidden'); Sfx.click(); }
function closeSettings() { el('modal-settings').classList.add('hidden'); Sfx.click(); }

/* ---- wardrobe ---- */
var wardrobe = { open: false, sel: 'none', pc: null, pctx: null };
function openWardrobe() {
  var m = new Date().getMonth();
  save.seasonal = save.seasonal || {};
  HATS.forEach(function (h) { if (h.month === m) save.seasonal[h.id] = true; }); // worn once, kept for good
  persistSoon();
  wardrobe.open = true; wardrobe.sel = save.hat;
  var grid = el('wardrobe-grid'), stars = totalStars(), d = Math.min(2, window.devicePixelRatio || 1);
  grid.innerHTML = '';
  HATS.forEach(function (h) {
    var ok = hatUnlocked(h, stars);
    var b = document.createElement('button');
    b.className = 'hat-tile' + (ok ? '' : ' locked') + (h.id === save.hat ? ' on' : '');
    b.setAttribute('role', 'option'); b.setAttribute('aria-selected', h.id === save.hat ? 'true' : 'false');
    b.setAttribute('aria-label', h.name + (ok ? '' : ', locked'));
    b.dataset.hat = h.id;
    var cvs = document.createElement('canvas'); cvs.width = 72 * d; cvs.height = 72 * d;
    b.appendChild(cvs);
    var c = cvs.getContext('2d'); c.setTransform(d, 0, 0, d, 0, 0);
    drawHead(c, 36, 44, 19, 0, 1, 'normal', 0, { hat: h.id, noBlink: true, look: [0, 0.2] });
    if (!ok) {
      var lk = document.createElement('span'); lk.className = 'lock';
      lk.innerHTML = h.month !== undefined ? h.label : starSvg() + h.stars;
      b.appendChild(lk);
    }
    b.addEventListener('click', function () { pickHat(h); });
    grid.appendChild(b);
  });
  wardrobe.pc = el('wardrobe-preview');
  var pr = wardrobe.pc.getBoundingClientRect();
  wardrobe.pc.width = (pr.width || 150) * d; wardrobe.pc.height = (pr.height || 130) * d;
  wardrobe.pctx = wardrobe.pc.getContext('2d'); wardrobe.pctx.setTransform(d, 0, 0, d, 0, 0);
  showHatInfo(hatById(save.hat));
  el('modal-wardrobe').classList.remove('hidden');
  Sfx.click();
}
function showHatInfo(h) {
  var stars = totalStars(), ok = hatUnlocked(h, stars);
  el('wardrobe-name').textContent = h.name;
  el('wardrobe-note').innerHTML = ok ? (h.id === save.hat ? 'Wearing it' : 'Tap again to wear') :
    h.month !== undefined ? 'Shows up every ' + h.label :
    'Collect ' + starSvg() + h.stars + ' to unlock (you have ' + stars + ')';
}
function pickHat(h) {
  wardrobe.sel = h.id;
  var ok = hatUnlocked(h);
  if (ok) {
    save.hat = h.id; persist();
    var tiles = el('wardrobe-grid').children;
    for (var i = 0; i < tiles.length; i++) {
      var on = tiles[i].dataset.hat === h.id;
      tiles[i].classList.toggle('on', on); tiles[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    Sfx.giggle(); Haptics.tap();
  } else { Sfx.bump(); }
  showHatInfo(h);
}
function drawWardrobePreview(t) {
  var c = wardrobe.pctx;
  if (!c) return;
  var w = wardrobe.pc.width / Math.min(2, window.devicePixelRatio || 1), h = wardrobe.pc.height / Math.min(2, window.devicePixelRatio || 1);
  c.clearRect(0, 0, w, h);
  c.fillStyle = 'rgba(101,67,33,.18)'; c.beginPath(); c.ellipse(w / 2, h - 14, w * 0.34, 10, 0, 0, 6.2832); c.fill();
  var bob = Math.sin(t / 500) * 2;
  c.strokeStyle = '#c94f7c'; c.lineCap = 'round'; c.lineWidth = 22;
  c.beginPath(); c.arc(w / 2 - 34, h - 10, 30, Math.PI * 1.15, Math.PI * 1.9); c.stroke();
  c.strokeStyle = '#ff9eb4'; c.lineWidth = 16;
  c.beginPath(); c.arc(w / 2 - 34, h - 10, 30, Math.PI * 1.15, Math.PI * 1.9); c.stroke();
  var ok = hatUnlocked(hatById(wardrobe.sel));
  drawHead(c, w / 2 + 6, h - 50 + bob, 30, Math.sin(t / 1400) * 0.3, 0.95, ok ? 'happy' : 'normal', t, { hat: wardrobe.sel, look: [0, 0.3] });
}
function closeWardrobe() { wardrobe.open = false; el('modal-wardrobe').classList.add('hidden'); Sfx.click(); }

/* ---- level-to-level iris: closes on Wally, reopens on him ---- */
function wallyOnScreen() {
  var app = el('app').getBoundingClientRect(), cr = cv.getBoundingClientRect();
  return { x: cr.left - app.left + ha.x, y: cr.top - app.top + ha.y, w: app.width, h: app.height };
}
function irisTo(cb, fast) {
  if (reducedMotion() || transitioning) { cb(); return; }
  transitioning = true;
  var ir = el('iris'), col = '#10220f';
  ir.classList.add('on');
  var p0 = wallyOnScreen(), maxR = Math.hypot(p0.w, p0.h);
  var tc = fast ? 230 : 360, to = fast ? 300 : 460, t0 = now(), phase = 0, p1 = null;
  function paint(x, y, r) {
    ir.style.background = 'radial-gradient(circle at ' + x.toFixed(0) + 'px ' + y.toFixed(0) + 'px, transparent ' +
      Math.max(0, r).toFixed(1) + 'px, ' + col + ' ' + (Math.max(0, r) + 1).toFixed(1) + 'px)';
  }
  function step() {
    var t = now();
    if (phase === 0) {
      var p = Math.min(1, (t - t0) / tc), e = p * p * p;
      paint(p0.x, p0.y, maxR * (1 - e));
      if (p < 1) { requestAnimationFrame(step); return; }
      phase = 1;
      cb();
      p1 = wallyOnScreen(); t0 = now() + 90;
      requestAnimationFrame(step); return;
    }
    var q = Math.max(0, Math.min(1, (t - t0) / to));
    paint(p1.x, p1.y, maxR * easeOutCubic(q));
    if (q < 1) { requestAnimationFrame(step); return; }
    ir.classList.remove('on'); ir.style.background = '';
    transitioning = false;
  }
  requestAnimationFrame(step);
}
function nextLevel() {
  hideModals();
  function go() {
    if (levelIdx + 1 < LEVELS.length) irisTo(function () { startLevel(levelIdx + 1, false); });
    else goToLevels();
  }
  var beat = STORY_BEATS.after[levelIdx];
  if (beat && showStory(beat, go)) return;
  go();
}
function playFromMap(i) {
  var r = validResume();
  startLevel(i, false, r && r.level === i ? { resume: r.moves, undos: r.undos } : null);
}

/* ============================== MAIN LOOP ============================== */
function tick(t) {
  requestAnimationFrame(tick);
  var dt = Math.min(50, t - (lastTime || t));
  lastTime = t;
  manageBlink(t);
  if (activeScreen === 'screen-levels') {
    tickMap(t);
  } else if (activeScreen === 'screen-game' && G) {
    if (paused) {
      drawPauseScene(t); // the board holds still behind the card: no need to redraw it
    } else {
      if (ha.active) {
        var p = (t - ha.t0) / ha.dur;
        if (p >= 1) {
          ha.x = ha.tx; ha.y = ha.ty; ha.active = false;
          advanceHeadAnim();
          if (!ha.active && !headAnimQueue.length) wally.land = t; // touched down: springy squash
        } else {
          var e2 = easeInOut(p);
          ha.x = ha.fx + (ha.tx - ha.fx) * e2;
          ha.y = ha.fy + (ha.ty - ha.fy) * e2;
        }
      }
      if (haz.active) {
        var hp2 = (t - haz.t0) / haz.dur;
        if (hp2 >= 1) { haz.x = haz.tx; haz.y = haz.ty; haz.active = false; }
        else {
          var he2 = easeInOut(hp2);
          haz.x = haz.fx + (haz.tx - haz.fx) * he2;
          haz.y = haz.fy + (haz.ty - haz.fy) * he2;
        }
      }
      if (rewind) {
        var cur = rewind.from - (t - rewind.t0) / rewind.per;
        if (cur <= rewind.to) {
          rewind = null;
          var hd = Worm.head(G), hc = centerOf(hd.r, hd.c);
          ha.x = ha.tx = hc.x; ha.y = ha.ty = hc.y; ha.idx = G.trail.length - 1;
          wally.land = t;
        } else rewind.cur = cur;
      }
      updateFx(dt);
      pumpQueue();
      tickScore(dt);
      updateWally(t, dt);
      render(t);
    }
  }
  if (wardrobe.open) drawWardrobePreview(t);
  if (storyState) drawStoryVignette(t);
}

/* ============================== INIT ============================== */
function init() {
  loadSave();
  document.body.classList.toggle('rm', reducedMotion());
  DIRV = {};
  for (var d in Worm.DIRS) DIRV[d] = [Worm.DIRS[d][1], Worm.DIRS[d][0]]; // -> [dx, dy]

  cv = el('game-canvas');
  ctx = cv.getContext('2d');

  // any real tap or key wakes audio (browsers need a gesture; iOS also
  // needs one after a phone call or lock screen interrupts playback)
  document.addEventListener('pointerdown', function () {
    if (!Sfx.ctx || Sfx.ctx.state !== 'running' || (save.music && !Music.src)) audioGesture();
  }, true);

  // home: Play jumps straight into the frontier level (or resumes one left
  // mid-play) rather than dropping the player on the map first - the map
  // is one tap away via "All Levels" for anyone who wants to pick.
  el('btn-play').addEventListener('click', function () {
    audioGesture(); Sfx.click();
    var r = validResume();
    if (r) { startLevel(r.level, true, { resume: r.moves, undos: r.undos }); return; }
    startLevel(Math.min(LEVELS.length, save.unlocked) - 1, false);
  });
  el('btn-levels').addEventListener('click', function () {
    audioGesture(); Sfx.click();
    worldPage = pageForLevel(Math.min(LEVELS.length, save.unlocked) - 1);
    renderLevels();
    show('screen-levels');
  });
  el('home-settings').addEventListener('click', openSettings);
  el('settings-done').addEventListener('click', closeSettings);
  el('btn-wardrobe').addEventListener('click', function () { audioGesture(); openWardrobe(); });
  el('wardrobe-done').addEventListener('click', closeWardrobe);

  // level map
  el('levels-back').addEventListener('click', function () { Sfx.click(); show('screen-home'); });
  el('world-prev').addEventListener('click', function () { goWorldPage(-1); });
  el('world-next').addEventListener('click', function () { goWorldPage(1); });

  // game hud
  el('game-pause').addEventListener('click', function () { audioGesture(); pauseGame(); });
  el('game-undo').addEventListener('click', undo);
  el('btn-resume').addEventListener('click', resumeGame);
  el('btn-restart').addEventListener('click', function () { Sfx.click(); hideModals(); Music.muffle(false); irisTo(restartLevel, true); });
  el('btn-pause-levels').addEventListener('click', function () { Sfx.click(); goToLevels(); });

  // Swipe anywhere over the board area, via pointer events so touch, pen
  // and mouse-drag all work. The move fires the moment the finger crosses
  // the threshold (no waiting for lift-off), and one gesture is exactly
  // one move, so a long drag can never spend extra moves. A touch that
  // doesn't travel is a tap: Wally, apples and the thorn react to those.
  var bw = el('board-wrap'), sw = null;
  bw.addEventListener('touchstart', function (e) { if (e.cancelable) e.preventDefault(); }, { passive: false });
  bw.addEventListener('pointerdown', function (e) {
    if (e.button !== undefined && e.button !== 0) return;
    sw = { id: e.pointerId, x: e.clientX, y: e.clientY, t: now(), done: false };
    try { bw.setPointerCapture(e.pointerId); } catch (er) {}
  });
  bw.addEventListener('pointermove', function (e) {
    if (!sw || sw.done || e.pointerId !== sw.id) return;
    var dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    if (Math.abs(dx) < 22 && Math.abs(dy) < 22) return;
    sw.done = true;
    inputDir(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U'));
  });
  bw.addEventListener('pointerup', function (e) {
    if (!sw || e.pointerId !== sw.id) return;
    var tap = !sw.done && Math.hypot(e.clientX - sw.x, e.clientY - sw.y) < 12 && now() - sw.t < 400;
    sw = null;
    if (tap) { var r = cv.getBoundingClientRect(); tapBoard(e.clientX - r.left, e.clientY - r.top); }
  });
  bw.addEventListener('pointercancel', function (e) { if (sw && e.pointerId === sw.id) sw = null; });
  cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  // Nothing on the game screen scrolls, so stop every touch-drag there from
  // reaching the page/host as a scroll or pull gesture.
  document.addEventListener('touchmove', function (e) {
    if (activeScreen === 'screen-game' && e.cancelable && !(e.target.closest && e.target.closest('.card'))) e.preventDefault();
  }, { passive: false });

  // Horizontal swipe on the level map flips between worlds (vertical
  // drags still scroll the list natively).
  var lp = el('level-path'), lsw = null;
  lp.addEventListener('pointerdown', function (e) { lsw = { x: e.clientX, y: e.clientY }; });
  lp.addEventListener('pointerup', function (e) {
    if (!lsw) return;
    var dx = e.clientX - lsw.x, dy = e.clientY - lsw.y;
    lsw = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) goWorldPage(dx < 0 ? 1 : -1);
  });
  lp.addEventListener('pointercancel', function () { lsw = null; });

  // Keyboard: arrows/WASD move, Z or Backspace undo, Esc/P pause, R restart,
  // Enter/Space for the obvious action on whatever card is showing.
  var keymap = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', w: 'U', s: 'D', a: 'L', d: 'R', W: 'U', S: 'D', A: 'L', D: 'R' };
  document.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var k = e.key, confirm = k === 'Enter' || k === ' ';
    if (confirm && document.activeElement && document.activeElement.tagName === 'BUTTON') return;
    audioGesture();
    var modal = openModal();
    if (modal) {
      if (e.repeat) return;
      if (modal.id === 'modal-settings') { if (k === 'Escape' || confirm) { e.preventDefault(); closeSettings(); } return; }
      if (modal.id === 'modal-wardrobe') { if (k === 'Escape' || confirm) { e.preventDefault(); closeWardrobe(); } return; }
      if (modal.id === 'modal-story') {
        if (confirm || k === 'ArrowRight') { e.preventDefault(); storyNext(); }
        else if (k === 'Escape') { e.preventDefault(); finishStory(); }
        return;
      }
      if (modal.id === 'modal-pause') {
        if (k === 'Escape' || k === 'p' || k === 'P' || confirm) { e.preventDefault(); resumeGame(); }
        else if (k === 'r' || k === 'R') { e.preventDefault(); el('btn-restart').click(); }
        return;
      }
      if (modal.id === 'modal-fail' && (k === 'z' || k === 'Z' || k === 'Backspace')) { e.preventDefault(); undo(); return; }
      if (confirm) { e.preventDefault(); modal.querySelector('.big-btn').click(); }
      else if (k === 'Escape') { e.preventDefault(); (modal.querySelector('.ghost-btn:not([hidden])') || modal.querySelector('.big-btn')).click(); }
      else if ((k === 'r' || k === 'R') && modal.id === 'modal-fail') { e.preventDefault(); irisTo(restartLevel, true); }
      return;
    }
    if (activeScreen === 'screen-game') {
      if (keymap[k]) { e.preventDefault(); if (!e.repeat) inputDir(keymap[k]); } // no auto-repeat: moves are precious
      else if ((k === 'z' || k === 'Z' || k === 'Backspace') && !e.repeat) { e.preventDefault(); undo(); }
      else if ((k === 'r' || k === 'R') && !e.repeat && !transitioning) irisTo(restartLevel, true);
      else if (k === 'Escape' || k === 'p' || k === 'P') { e.preventDefault(); pauseGame(); }
    } else if (activeScreen === 'screen-levels') {
      if (k === 'ArrowLeft') { e.preventDefault(); goWorldPage(-1); }
      else if (k === 'ArrowRight') { e.preventDefault(); goWorldPage(1); }
      else if (k === 'Escape' || k === 'Backspace') { e.preventDefault(); el('levels-back').click(); }
      else if (confirm) {
        e.preventDefault();
        var cur = document.querySelector('.lvl-node.current') || document.querySelector('.lvl-node:not(.locked)');
        if (cur) cur.click();
      }
    } else if (activeScreen === 'screen-home' && confirm) {
      e.preventDefault(); el('btn-play').click();
    }
  });

  // cards
  el('story-next').addEventListener('click', storyNext);
  el('story-skip').addEventListener('click', function () { Sfx.click(); finishStory(); });
  el('tut-ok').addEventListener('click', function () { Sfx.click(); hideModals(); noteInput(); });
  el('btn-next').addEventListener('click', function () { Sfx.click(); nextLevel(); });
  el('btn-replay').addEventListener('click', function () { Sfx.click(); hideModals(); irisTo(function () { startLevel(levelIdx, true); }, true); });
  el('btn-fail-primary').addEventListener('click', function () {
    Sfx.click();
    if (failPrimary === 'undo') undo(); else { hideModals(); irisTo(restartLevel, true); }
  });
  el('btn-retry').addEventListener('click', function () {
    Sfx.click();
    if (el('btn-retry').dataset.act === 'undo') undo(); else { hideModals(); irisTo(restartLevel, true); }
  });
  el('btn-fail-levels').addEventListener('click', function () { Sfx.click(); goToLevels(); });

  // Leaving the app (switching apps, a call, locking the phone): pause the
  // level, drop buffered moves, and suspend all audio in place. Coming back
  // lands on the pause menu; the first tap there brings the sound back.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      moveQueue = [];
      if (activeScreen === 'screen-game' && G && G.status === 'playing') pauseGame(true);
      persist();
      Sfx.suspend();
    } else { lastTime = 0; }
  });
  window.addEventListener('pagehide', persist);
  window.addEventListener('popstate', function () {
    if (Nav.skip > 0) { Nav.skip--; return; }
    Nav.armed = false;
    onSystemBack();
  });

  window.addEventListener('resize', function () { resize(); });
  // The board area can also change size without a window resize (e.g. the
  // mobile URL bar collapsing, fonts loading); track the element itself.
  if (window.ResizeObserver) {
    var lastW = 0, lastH = 0;
    new ResizeObserver(function (entries) {
      var cr = entries[0].contentRect;
      if (Math.abs(cr.width - lastW) < 1 && Math.abs(cr.height - lastH) < 1) return;
      lastW = cr.width; lastH = cr.height;
      if (activeScreen === 'screen-game') resize();
    }).observe(el('board-wrap'));
  }
  window.addEventListener('orientationchange', function () {
    setTimeout(resize, 250);
  });

  var sharedIdx = sharedLevelFromURL();
  if (sharedIdx !== null) {
    sharedSaveSnapshot = JSON.parse(JSON.stringify(save));
    sharedPuzzle = true;
    startLevel(sharedIdx, false, { noStory: true });
  } else {
    show('screen-home');
  }
  requestAnimationFrame(tick);
  hideSplash();
}
// Fade out the loading screen once the display font is in (so nothing
// reflows under it), but never hold the player up for long.
function hideSplash() {
  var sp = el('splash');
  if (!sp) return;
  var done = false; // now() counts from page load, so it doubles as "time on the splash"
  function go() {
    if (done) return; done = true;
    setTimeout(function () {
      sp.classList.add('gone');
      setTimeout(function () { if (sp.parentNode) sp.parentNode.removeChild(sp); }, 450);
    }, Math.max(0, 450 - now()));
  }
  var waits = [];
  try { if (document.fonts && document.fonts.ready) waits.push(document.fonts.ready); } catch (e) {}
  if (homeArt.decode) waits.push(homeArt.decode().catch(function () {}));
  else if (!homeArt.complete) waits.push(new Promise(function (res) { homeArt.onload = homeArt.onerror = res; }));
  Promise.all(waits).then(go, go);
  setTimeout(go, 1800);
}

// tiny hook for automated testing
window.WormDebug = {
  // opts defaults to { noStory: true } so existing tests keep skipping story
  // cards; pass opts explicitly (e.g. {}) to let story beats play out.
  startLevel: function (i, skipIntro, opts) { hideModals(); startLevel(i, skipIntro, opts !== undefined ? opts : { noStory: true }); },
  state: function () { return G ? { status: G.status, moves: G.moves, movesLeft: G.movesLeft, score: G.score, undo: undoStack.length } : null; },
  // true while a move is still buffered or animating (lets tests pace input)
  busy: function () { return !!(moveQueue.length || ha.active || headAnimQueue.length || rewind || transitioning); },
  idle: function (ms) { wally.lastInput = now() - ms; },
  // average ms to render one frame of the current board (perf checks)
  bench: function (n) {
    n = n || 200; var t0 = now();
    for (var i = 0; i < n; i++) render(t0 + i * 16);
    return (now() - t0) / n;
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
})();
