/* GamesLOL core: registry, storage, DOM + canvas helpers shared by every game. */
(function () {
  'use strict';

  const GL = (window.GL = {});

  /* ---------- registry ---------- */
  GL.games = [];
  GL.register = (game) => GL.games.push(game);

  /* ---------- storage ---------- */
  const PREFIX = 'gameslol:';
  GL.store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(PREFIX + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(PREFIX + key, JSON.stringify(value));
      } catch (e) {
        /* private mode / quota: scores just won't persist */
      }
    },
  };

  /* ---------- best scores ---------- */
  const bestKey = (game, variant) => 'best:' + game.id + (variant ? ':' + variant : '');
  GL.getBest = (game, variant) => GL.store.get(bestKey(game, variant), null);
  GL.submitBest = (game, score, variant) => {
    if (score == null || (!game.lowerIsBetter && score <= 0)) return false;
    const current = GL.getBest(game, variant);
    const better = current === null || (game.lowerIsBetter ? score < current : score > current);
    if (better) GL.store.set(bestKey(game, variant), score);
    return better;
  };
  GL.format = (game, value) => {
    if (value == null) return '—';
    return game.format ? game.format(value) : Number(value).toLocaleString();
  };

  /* ---------- DOM ---------- */
  GL.h = function h(tag, props, ...children) {
    const el = document.createElement(tag);
    if (props) {
      for (const [key, value] of Object.entries(props)) {
        if (value == null || value === false) continue;
        if (key === 'class') el.className = value;
        else if (key === 'html') el.innerHTML = value;
        else if (key === 'style') el.style.cssText = value;
        else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
        else el.setAttribute(key, value === true ? '' : value);
      }
    }
    const add = (child) => {
      if (child == null || child === false) return;
      if (Array.isArray(child)) child.forEach(add);
      else el.append(child instanceof Node ? child : String(child));
    };
    children.forEach(add);
    return el;
  };

  GL.ui = {
    segmented({ label, options, value, onChange }) {
      const { h } = GL;
      const buttons = options.map((opt) =>
        h('button', {
          type: 'button',
          class: 'seg-btn',
          role: 'radio',
          'aria-checked': String(opt.value === value),
          onclick: () => {
            if (opt.value === value) return;
            value = opt.value;
            buttons.forEach((b, i) => b.setAttribute('aria-checked', String(options[i].value === value)));
            onChange(value);
          },
        }, opt.label)
      );
      return h('div', { class: 'field' },
        h('span', { class: 'field-label' }, label),
        h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label }, buttons));
    },
  };

  /* ---------- theme colours (cached, read by canvas games) ---------- */
  let colorCache = null;
  GL.isDark = () => {
    const t = document.documentElement.dataset.theme;
    return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  };
  GL.colors = () => {
    if (!colorCache) {
      const s = getComputedStyle(document.documentElement);
      const v = (name) => s.getPropertyValue(name).trim();
      colorCache = {
        dark: GL.isDark(),
        bg: v('--bg'),
        surface: v('--surface'),
        surface2: v('--surface-2'),
        border: v('--border'),
        text: v('--text'),
        muted: v('--muted'),
        accent: v('--accent'),
        good: v('--good'),
        bad: v('--bad'),
        warn: v('--warn'),
        board: v('--board'),
        boardAlt: v('--board-alt'),
        boardCell: v('--board-cell'),
      };
    }
    return colorCache;
  };
  GL.invalidateColors = () => { colorCache = null; };

  /* ---------- canvas ---------- */
  // Creates a HiDPI canvas that draws in logical w×h units and scales with CSS.
  // maxWidth (optional) caps the CSS width and keeps the canvas within ~68% of the viewport height.
  GL.canvas = (w, h, className, maxWidth) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas.style.aspectRatio = w + ' / ' + h;
    canvas.className = 'game-canvas' + (className ? ' ' + className : '');
    if (maxWidth) canvas.style.width = `min(100%, ${maxWidth}px, calc(68vh * ${w / h}))`;
    return { canvas, ctx, w, h };
  };

  GL.roundRect = (ctx, x, y, w, h, r) => {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  // Converts a pointer position into a canvas's logical coordinates.
  GL.canvasPoint = (canvas, w, h, e) => {
    const rect = canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * w, y: ((e.clientY - rect.top) / rect.height) * h };
  };

  /* ---------- input ---------- */
  const KEY_DIRS = {
    arrowup: 'up', w: 'up',
    arrowdown: 'down', s: 'down',
    arrowleft: 'left', a: 'left',
    arrowright: 'right', d: 'right',
  };
  GL.dirFromKey = (e) => (e.metaKey || e.ctrlKey || e.altKey ? null : KEY_DIRS[e.key.toLowerCase()] || null);

  // Touch/pen swipe detection. Calls cb with 'up' | 'down' | 'left' | 'right' | 'tap'.
  GL.swipe = (el, cb, threshold = 24) => {
    let sx = 0, sy = 0, active = false;
    const down = (e) => {
      if (e.pointerType === 'mouse') return;
      active = true;
      sx = e.clientX;
      sy = e.clientY;
    };
    const up = (e) => {
      if (!active) return;
      active = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return cb('tap');
      cb(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    };
    const cancel = () => { active = false; };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
    };
  };

  GL.listen = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    return () => target.removeEventListener(type, fn, opts);
  };

  // A centred pill of text drawn on a canvas (used for "press to start" hints).
  GL.canvasHint = (ctx, w, y, text) => {
    const c = GL.colors();
    ctx.save();
    ctx.font = '600 14px Inter, system-ui, sans-serif';
    const pw = ctx.measureText(text).width + 32;
    ctx.fillStyle = c.surface;
    ctx.globalAlpha = 0.92;
    GL.roundRect(ctx, (w - pw) / 2, y - 18, pw, 36, 18);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = c.text;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, y);
    ctx.restore();
  };

  /* ---------- sound ---------- */
  let audio = null;
  GL.sound = {
    get on() { return GL.store.get('sound', true); },
    set on(v) { GL.store.set('sound', v); },
    tone(freq, ms = 120, type = 'sine', gain = 0.08) {
      if (!GL.sound.on) return;
      try {
        audio = audio || new (window.AudioContext || window.webkitAudioContext)();
        if (audio.state === 'suspended') audio.resume();
        const osc = audio.createOscillator();
        const g = audio.createGain();
        const t = audio.currentTime;
        osc.type = type;
        osc.frequency.value = freq;
        g.gain.setValueAtTime(gain, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
        osc.connect(g).connect(audio.destination);
        osc.start(t);
        osc.stop(t + ms / 1000 + 0.02);
      } catch (e) {
        /* audio unavailable */
      }
    },
  };

  /*
   * Shared state machine for real-time canvas games: ready → running ⇄ paused → over.
   * cfg: { reset(), update(dt, now), draw(dt, now), ready?: {kicker,title,text}, overText?(score), onStart?() }
   * dt is in seconds. Score helpers keep the stat tile and best score in sync.
   */
  GL.realtime = (api, cfg) => {
    let startBest = 0;
    const ctl = {
      state: 'ready',
      score: 0,
      reset() {
        startBest = api.best() || 0;
        ctl.score = 0;
        ctl.state = 'ready';
        api.setScore(0, false);
        api.hideOverlay();
        api.setPaused(false);
        cfg.reset();
        if (cfg.ready) api.overlay({ ...cfg.ready, actions: [{ label: 'Start', primary: true, onClick: ctl.start }] });
      },
      start() {
        if (ctl.state !== 'ready' && ctl.state !== 'paused') return;
        const fresh = ctl.state === 'ready';
        ctl.state = 'running';
        api.hideOverlay();
        api.setPaused(false);
        if (fresh && cfg.onStart) cfg.onStart();
      },
      togglePause() {
        if (ctl.state === 'running') {
          ctl.state = 'paused';
          api.setPaused(true);
          api.overlay({
            kicker: 'Paused',
            title: 'Paused',
            text: 'Press P or Resume to continue.',
            actions: [{ label: 'Resume', primary: true, onClick: ctl.start }],
          });
        } else if (ctl.state === 'paused') {
          ctl.start();
        }
      },
      pause() {
        if (ctl.state === 'running') ctl.togglePause();
      },
      setScore(v) {
        if (v === ctl.score) return;
        ctl.score = v;
        api.setScore(v);
        api.submit(v);
      },
      add(n) {
        ctl.setScore(ctl.score + n);
      },
      gameOver(delay = 500) {
        if (ctl.state === 'over') return;
        ctl.state = 'over';
        const record = ctl.score > startBest;
        setTimeout(() => {
          if (ctl.state !== 'over') return;
          api.overlay({
            kicker: record ? 'New personal best' : 'Game over',
            title: cfg.overTitle ? cfg.overTitle(ctl.score) : ctl.score.toLocaleString() + ' points',
            text: cfg.overText ? cfg.overText(ctl.score, record) : record ? 'Your best run yet.' : `Your best is ${api.format(api.best() ?? 0)}.`,
            tone: record ? 'win' : 'lose',
            actions: [{ label: 'Play again', primary: true, onClick: () => { ctl.reset(); ctl.start(); } }],
          });
        }, delay);
      },
    };
    const stop = GL.loop((dt, now) => {
      if (ctl.state === 'running') cfg.update(dt / 1000, now);
      cfg.draw(dt / 1000, now);
    });
    ctl.instance = (cleanup) => ({
      restart: ctl.reset,
      togglePause: ctl.togglePause,
      pause: ctl.pause,
      destroy() {
        stop();
        if (cleanup) cleanup();
      },
    });
    return ctl;
  };

  // requestAnimationFrame loop with clamped delta (ms). Returns a stop function.
  GL.loop = (fn) => {
    let raf = 0, last = 0;
    const frame = (now) => {
      const dt = last ? Math.min(100, now - last) : 16;
      last = now;
      fn(dt, now);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  };
})();
