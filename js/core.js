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
  GL.canvas = (w, h, className) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas.style.aspectRatio = w + ' / ' + h;
    canvas.className = 'game-canvas' + (className ? ' ' + className : '');
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
