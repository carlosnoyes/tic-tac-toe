/* Puzzle Duel — shared utilities */
(function () {
  'use strict';

  // Deterministic PRNG so both players get identical puzzles from one seed.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRng(seed) {
    const r = mulberry32(seed >>> 0);
    const api = {
      next: r,
      int(n) { return Math.floor(r() * n); },
      range(a, b) { return a + Math.floor(r() * (b - a + 1)); },
      pick(arr) { return arr[Math.floor(r() * arr.length)]; },
      shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
          const j = Math.floor(r() * (i + 1));
          [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
      },
      chance(p) { return r() < p; },
    };
    return api;
  }

  function randomSeed() { return (Math.random() * 0xFFFFFFFF) >>> 0; }

  function el(tag, attrs, ...children) {
    const e = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') e.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
        else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (k === 'html') e.innerHTML = v;
        else e.setAttribute(k, v === true ? '' : v);
      }
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return e;
  }

  function fmtTime(ms) {
    if (ms == null || !isFinite(ms)) return '—';
    const s = ms / 1000;
    if (s < 60) return s.toFixed(1) + 's';
    const m = Math.floor(s / 60);
    const r = (s - m * 60).toFixed(1).padStart(4, '0');
    return m + ':' + r;
  }

  function shake(node) {
    if (!node) return;
    node.classList.remove('shake');
    void node.offsetWidth;
    node.classList.add('shake');
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ── Sound: tiny WebAudio synth, no assets needed ──
  const Sound = {
    ctx: null,
    enabled: true,
    ensure() {
      if (!this.enabled) return null;
      if (!this.ctx) {
        try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },
    tone(freq, dur = 0.08, type = 'sine', vol = 0.08, delay = 0) {
      const ctx = this.ensure(); if (!ctx) return;
      const t = ctx.currentTime + delay;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ctx.destination);
      o.start(t); o.stop(t + dur + 0.02);
    },
    click() { this.tone(660, 0.04, 'triangle', 0.05); },
    good() { this.tone(880, 0.07, 'sine', 0.06); },
    bad() { this.tone(160, 0.15, 'sawtooth', 0.05); },
    tick() { this.tone(520, 0.08, 'square', 0.04); },
    go() { this.tone(1040, 0.2, 'square', 0.05); },
    win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.07, i * 0.1)); },
    lose() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.22, 'sine', 0.06, i * 0.14)); },
    boom() { this.tone(90, 0.35, 'sawtooth', 0.09); this.tone(60, 0.4, 'square', 0.05, 0.05); },
    pop() { this.tone(1200, 0.05, 'sine', 0.05); },
  };

  function store(key, val) {
    try {
      if (val === undefined) { const v = localStorage.getItem('pduel.' + key); return v == null ? null : JSON.parse(v); }
      localStorage.setItem('pduel.' + key, JSON.stringify(val));
    } catch (e) { return null; }
  }

  window.PD = window.PD || {};
  Object.assign(window.PD, { makeRng, randomSeed, el, fmtTime, shake, escapeHtml, Sound, store });
})();
