(function () {
  'use strict';

  const SIZE = 4;
  const SLIDE_MS = 110;
  const HUES = { 3: 258, 4: 278, 5: 300, 6: 322, 7: 344, 8: 6, 9: 22, 10: 36, 11: 46 };

  function tileColors(v) {
    const n = Math.log2(v);
    if (n === 1) return ['var(--t2)', 'var(--text)'];
    if (n === 2) return ['var(--t4)', 'var(--text)'];
    const hue = HUES[n] ?? (46 + (n - 11) * 50) % 360;
    return [`hsl(${hue} 82% ${n >= 11 ? 54 : 60}%)`, '#fff'];
  }

  GL.register({
    id: '2048',
    name: '2048',
    category: 'Puzzle',
    hue: 278,
    tagline: 'Slide, merge, and chase the 2048 tile.',
    howTo: 'Slide every tile in one direction. Two tiles with the same number merge into one. Reach 2048 to win — then keep going for a higher score.',
    controls: [
      ['↑ ↓ ← →', 'Slide tiles (or W A S D)'],
      ['Swipe', 'Slide on touch screens'],
      ['U', 'Undo last move'],
      ['R', 'New game'],
    ],
    art: `<svg viewBox="0 0 160 100" aria-hidden="true" font-family="Inter,system-ui,sans-serif" font-weight="800" text-anchor="middle"><rect x="40" y="14" width="36" height="36" rx="8" fill="#fff" opacity=".35"/><rect x="84" y="14" width="36" height="36" rx="8" fill="#fff"/><text x="102" y="39" font-size="17" fill="#7c3aed">2</text><rect x="40" y="56" width="36" height="36" rx="8" fill="#fff"/><text x="58" y="81" font-size="15" fill="#db2777">16</text><rect x="84" y="56" width="36" height="36" rx="8" fill="#fff" opacity=".35"/></svg>`,

    mount(api) {
      const { h } = GL;
      const layer = h('div', { class: 'g2048-tiles' });
      const board = h('div', { class: 'g2048' },
        Array.from({ length: SIZE * SIZE }, () => h('div', { class: 'g2048-cell' })),
        layer);
      api.root.append(board);
      api.root.classList.add('no-scroll');

      const undoBtn = h('button', {
        type: 'button', class: 'btn btn-block', html: 'Undo move <kbd>U</kbd>',
        onclick: () => undo(),
      });
      api.options.append(undoBtn);

      let tiles, score, nextId = 1, won, keepPlaying, over, history, startBest;
      const els = new Map();

      function reset() {
        tiles = [];
        score = 0;
        won = false;
        keepPlaying = false;
        over = false;
        history = [];
        startBest = api.best() || 0;
        layer.replaceChildren();
        els.clear();
        spawn();
        spawn();
        render();
        api.setScore(0, false);
        api.hideOverlay();
        updateUndo();
      }

      function spawn() {
        const taken = new Set(tiles.map((t) => t.r * SIZE + t.c));
        const free = [];
        for (let i = 0; i < SIZE * SIZE; i++) if (!taken.has(i)) free.push(i);
        if (!free.length) return;
        const i = free[Math.floor(Math.random() * free.length)];
        tiles.push({ id: nextId++, v: Math.random() < 0.9 ? 2 : 4, r: Math.floor(i / SIZE), c: i % SIZE, isNew: true });
      }

      function grid() {
        const g = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
        for (const t of tiles) g[t.r][t.c] = t;
        return g;
      }

      function canMove() {
        if (tiles.length < SIZE * SIZE) return true;
        const g = grid();
        for (let r = 0; r < SIZE; r++)
          for (let c = 0; c < SIZE; c++) {
            const v = g[r][c].v;
            if ((c + 1 < SIZE && g[r][c + 1].v === v) || (r + 1 < SIZE && g[r + 1][c].v === v)) return true;
          }
        return false;
      }

      function move(dir) {
        if (over || (won && !keepPlaying)) return;
        const snapshot = { tiles: tiles.map(({ id, v, r, c }) => ({ id, v, r, c })), score };
        const g = grid();
        const removed = [];
        let moved = false;
        for (const t of tiles) {
          t.isNew = false;
          t.merged = false;
        }

        for (let i = 0; i < SIZE; i++) {
          // positions along this line, starting at the edge we slide toward
          const line = [];
          for (let j = 0; j < SIZE; j++) {
            if (dir === 'left') line.push([i, j]);
            else if (dir === 'right') line.push([i, SIZE - 1 - j]);
            else if (dir === 'up') line.push([j, i]);
            else line.push([SIZE - 1 - j, i]);
          }
          let slot = 0;
          let last = null;
          for (const [r, c] of line) {
            const t = g[r][c];
            if (!t) continue;
            if (last && last.v === t.v && !last.merged) {
              t.r = last.r;
              t.c = last.c;
              removed.push(t);
              last.v *= 2;
              last.merged = true;
              score += last.v;
              moved = true;
            } else {
              const [nr, nc] = line[slot++];
              if (nr !== t.r || nc !== t.c) moved = true;
              t.r = nr;
              t.c = nc;
              last = t;
            }
          }
        }

        if (!moved) {
          board.classList.remove('nudge-' + dir);
          void board.offsetWidth;
          board.classList.add('nudge-' + dir);
          return;
        }

        history.push(snapshot);
        if (history.length > 30) history.shift();
        tiles = tiles.filter((t) => !removed.includes(t));
        spawn();
        render(removed);
        api.setScore(score);
        api.submit(score);
        updateUndo();

        if (!won && tiles.some((t) => t.v >= 2048)) {
          won = true;
          setTimeout(() => api.overlay({
            kicker: 'You made 2048',
            title: 'Brilliant.',
            text: 'Keep going for a bigger tile and a higher score?',
            tone: 'win',
            actions: [
              { label: 'Keep going', primary: true, onClick: () => { keepPlaying = true; api.hideOverlay(); } },
              { label: 'New game', onClick: reset },
            ],
          }), 260);
        } else if (!canMove()) {
          over = true;
          const record = score > startBest;
          setTimeout(() => api.overlay({
            kicker: record ? 'New personal best' : 'No moves left',
            title: score.toLocaleString() + ' points',
            text: `Biggest tile: ${Math.max(...tiles.map((t) => t.v))}.`,
            tone: record ? 'win' : 'lose',
            actions: [
              { label: 'Try again', primary: true, onClick: reset },
              { label: 'Undo', onClick: undo },
            ],
          }), 320);
        }
      }

      function setValue(inner, v) {
        const [bg, fg] = tileColors(v);
        inner.textContent = v;
        inner.dataset.len = String(v).length;
        inner.classList.toggle('is-big', v >= 1024);
        inner.style.setProperty('--tile-bg', bg);
        inner.style.setProperty('--tile-fg', fg);
      }

      function render(removed = []) {
        for (const t of tiles) {
          let el = els.get(t.id);
          if (!el) {
            const inner = h('div', { class: 'tile-inner' + (t.isNew ? ' is-new' : '') });
            el = h('div', { class: 'tile' }, inner);
            setValue(inner, t.v);
            els.set(t.id, el);
            layer.append(el);
          }
          el.style.setProperty('--r', t.r);
          el.style.setProperty('--c', t.c);
          if (t.merged) {
            const inner = el.firstChild;
            const v = t.v;
            el.style.zIndex = 2;
            setTimeout(() => {
              setValue(inner, v);
              inner.classList.remove('is-new', 'is-merged');
              void inner.offsetWidth;
              inner.classList.add('is-merged');
            }, SLIDE_MS);
          } else {
            el.style.zIndex = '';
          }
        }
        for (const t of removed) {
          const el = els.get(t.id);
          if (!el) continue;
          el.style.setProperty('--r', t.r);
          el.style.setProperty('--c', t.c);
          el.style.zIndex = 1;
          els.delete(t.id);
          setTimeout(() => el.remove(), SLIDE_MS);
        }
      }

      function undo() {
        const snap = history.pop();
        if (!snap) return;
        tiles = snap.tiles.map((t) => ({ ...t }));
        score = snap.score;
        over = false;
        layer.replaceChildren();
        els.clear();
        render();
        api.setScore(score, false);
        api.hideOverlay();
        updateUndo();
      }

      function updateUndo() {
        undoBtn.disabled = history.length === 0;
      }

      function onKey(e) {
        if ((e.key === 'z' && (e.ctrlKey || e.metaKey)) || (e.key.toLowerCase() === 'u' && !e.ctrlKey && !e.metaKey)) {
          e.preventDefault();
          undo();
          return;
        }
        const d = GL.dirFromKey(e);
        if (d) {
          e.preventDefault();
          move(d);
        }
      }
      window.addEventListener('keydown', onKey);
      const unswipe = GL.swipe(board, (d) => d !== 'tap' && move(d));

      reset();

      return {
        restart: reset,
        destroy() {
          unswipe();
          window.removeEventListener('keydown', onKey);
        },
      };
    },
  });
})();
