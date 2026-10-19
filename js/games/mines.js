(function () {
  'use strict';

  const LEVELS = {
    easy: { label: 'Easy', cols: 9, rows: 9, mines: 10 },
    medium: { label: 'Medium', cols: 16, rows: 16, mines: 40 },
    hard: { label: 'Hard', cols: 30, rows: 16, mines: 99 },
  };
  const FLAG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M7 4h10l-2.5 4L17 12H7z" fill="currentColor"/></svg>';
  const MINE = '<svg viewBox="0 0 24 24" aria-hidden="true"><g stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/></g><circle cx="12" cy="12" r="6" fill="currentColor"/><circle cx="10" cy="10" r="1.6" fill="#fff" opacity=".8"/></svg>';

  GL.register({
    id: 'mines',
    name: 'Minesweeper',
    category: 'Puzzle',
    hue: 12,
    tagline: 'Read the numbers, flag the mines, clear the field.',
    howTo: 'Each number tells you how many mines touch that square. Reveal every safe square to win. Your first click is always safe. Click a number whose mines are all flagged to clear its neighbours at once.',
    controls: [
      ['Click', 'Reveal a square'],
      ['Right-click', 'Place / remove a flag'],
      ['Long-press', 'Flag on touch screens'],
      ['F', 'Flag the focused square'],
      ['R', 'New game'],
    ],
    scoreLabel: 'Time',
    lowerIsBetter: true,
    homeVariant: 'easy',
    bestLabel: 'Best (Easy)',
    format: (ms) => (ms / 1000).toFixed(1) + 's',
    art: `<svg viewBox="0 0 160 100" aria-hidden="true" font-family="JetBrains Mono,monospace" font-weight="700" text-anchor="middle"><g fill="#fff"><rect x="46" y="16" width="20" height="20" rx="5" opacity=".95"/><rect x="70" y="16" width="20" height="20" rx="5" opacity=".95"/><rect x="94" y="16" width="20" height="20" rx="5" opacity=".4"/><rect x="46" y="40" width="20" height="20" rx="5" opacity=".95"/><rect x="70" y="40" width="20" height="20" rx="5" opacity=".95"/><rect x="94" y="40" width="20" height="20" rx="5" opacity=".4"/><rect x="46" y="64" width="20" height="20" rx="5" opacity=".4"/><rect x="70" y="64" width="20" height="20" rx="5" opacity=".4"/><rect x="94" y="64" width="20" height="20" rx="5" opacity=".4"/></g><text x="80" y="55" font-size="13" fill="#ea580c">2</text><text x="56" y="31" font-size="13" fill="#2563eb">1</text><path d="M102 30V20" stroke="#fff" stroke-width="2"/><path d="M102 20h8l-2 3 2 3h-8z" fill="#fff"/></svg>`,

    mount(api) {
      const { h } = GL;
      let level = GL.store.get('mines:level', 'easy');
      if (!LEVELS[level]) level = 'easy';
      let flagMode = false;

      const board = h('div', { class: 'mines', role: 'grid' });
      const wrap = h('div', { class: 'mines-wrap' }, board);
      api.root.append(wrap);

      const flagBtn = h('button', {
        type: 'button', class: 'btn btn-block flag-toggle', 'aria-pressed': 'false',
        onclick: () => setFlagMode(!flagMode),
      });
      api.options.append(
        GL.ui.segmented({
          label: 'Difficulty',
          value: level,
          options: Object.entries(LEVELS).map(([value, L]) => ({ value, label: L.label })),
          onChange: (v) => {
            level = v;
            GL.store.set('mines:level', v);
            reset();
          },
        }),
        flagBtn);

      function setFlagMode(on) {
        flagMode = on;
        flagBtn.setAttribute('aria-pressed', String(on));
        flagBtn.innerHTML = FLAG + `<span>Flag mode: ${on ? 'On' : 'Off'}</span>`;
        board.classList.toggle('flagging', on);
      }
      setFlagMode(false);

      let cells, L, state, revealed, flags, startTime, timer;

      function reset() {
        L = LEVELS[level];
        api.setVariant(level);
        board.style.setProperty('--mg', L.cols > 20 ? '2px' : '3px');
        clearInterval(timer);
        state = 'ready';
        revealed = 0;
        flags = 0;
        cells = [];
        board.style.setProperty('--cols', L.cols);
        board.classList.remove('lost', 'won');
        const frag = document.createDocumentFragment();
        for (let r = 0; r < L.rows; r++)
          for (let c = 0; c < L.cols; c++) {
            const el = h('button', { type: 'button', class: 'cell', 'data-i': cells.length, 'aria-label': `Row ${r + 1}, column ${c + 1}, hidden` });
            cells.push({ r, c, mine: false, n: 0, open: false, flag: false, el });
            frag.append(el);
          }
        board.replaceChildren(frag);
        api.setScore(0, false);
        updateMines();
        api.hideOverlay();
      }

      const neighbours = (cell) => {
        const out = [];
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const r = cell.r + dr, c = cell.c + dc;
            if (r >= 0 && c >= 0 && r < L.rows && c < L.cols) out.push(cells[r * L.cols + c]);
          }
        return out;
      };

      function placeMines(safe) {
        const banned = new Set([safe, ...neighbours(safe)]);
        let pool = cells.filter((c) => !banned.has(c));
        if (pool.length < L.mines) pool = cells.filter((c) => c !== safe);
        for (let i = 0; i < L.mines; i++) {
          const j = i + Math.floor(Math.random() * (pool.length - i));
          [pool[i], pool[j]] = [pool[j], pool[i]];
          pool[i].mine = true;
        }
        for (const cell of cells) cell.n = neighbours(cell).filter((n) => n.mine).length;
      }

      function startTimer() {
        startTime = performance.now();
        timer = setInterval(() => api.setScore(performance.now() - startTime, false), 100);
      }

      function updateMines() {
        api.stat('mines', 'Mines left', L.mines - flags, false);
      }

      function paint(cell, delay = 0) {
        const { el } = cell;
        el.classList.toggle('open', cell.open);
        el.classList.toggle('flag', cell.flag && !cell.open);
        el.style.setProperty('--d', delay + 'ms');
        if (cell.open) {
          el.dataset.n = cell.mine ? 'x' : cell.n;
          el.innerHTML = cell.mine ? MINE : cell.n || '';
          el.setAttribute('aria-label', `Row ${cell.r + 1}, column ${cell.c + 1}, ${cell.mine ? 'mine' : cell.n ? cell.n + ' adjacent' : 'empty'}`);
        } else {
          el.innerHTML = cell.flag ? FLAG : '';
          el.setAttribute('aria-label', `Row ${cell.r + 1}, column ${cell.c + 1}, ${cell.flag ? 'flagged' : 'hidden'}`);
        }
      }

      // Opens a cell, flood-filling through empty squares. Returns true if a mine was hit.
      function open(start) {
        const stack = [start];
        while (stack.length) {
          const cell = stack.pop();
          if (cell.open || cell.flag) continue;
          cell.open = true;
          if (cell.mine) {
            paint(cell);
            return true;
          }
          revealed++;
          const dist = Math.max(Math.abs(cell.r - start.r), Math.abs(cell.c - start.c));
          paint(cell, Math.min(dist * 18, 360));
          if (cell.n === 0) stack.push(...neighbours(cell));
        }
        return false;
      }

      function reveal(cell) {
        if (state === 'won' || state === 'lost' || cell.flag) return;
        if (state === 'ready') {
          placeMines(cell);
          state = 'playing';
          startTimer();
        }
        let boom = null;
        if (cell.open) {
          // chord: open all neighbours if the right number of flags surround this number
          const around = neighbours(cell);
          if (!cell.n || around.filter((n) => n.flag).length !== cell.n) return;
          for (const n of around) if (!n.flag && !n.open && open(n)) boom = boom || n;
        } else if (open(cell)) {
          boom = cell;
        }
        if (boom) lose(boom);
        else if (revealed === L.rows * L.cols - L.mines) win();
      }

      function toggleFlag(cell) {
        if (cell.open || state === 'won' || state === 'lost') return;
        cell.flag = !cell.flag;
        flags += cell.flag ? 1 : -1;
        paint(cell);
        updateMines();
      }

      function lose(hit) {
        state = 'lost';
        clearInterval(timer);
        board.classList.add('lost');
        hit.el.classList.add('boom');
        let i = 0;
        for (const cell of cells) {
          if (cell.mine && !cell.flag && cell !== hit) {
            cell.open = true;
            paint(cell, 120 + Math.min(i++ * 25, 900));
          } else if (cell.flag && !cell.mine) {
            cell.el.classList.add('wrong');
          }
        }
        setTimeout(() => {
          if (state !== 'lost') return;
          api.overlay({
            kicker: 'Boom',
            title: 'You hit a mine',
            text: `${Math.round((revealed / (L.rows * L.cols - L.mines)) * 100)}% of the ${L.label.toLowerCase()} field cleared.`,
            tone: 'lose',
            actions: [
              { label: 'Try again', primary: true, onClick: reset },
              { label: 'View board', onClick: api.hideOverlay },
            ],
          });
        }, 900);
      }

      function win() {
        state = 'won';
        clearInterval(timer);
        const time = Math.round(performance.now() - startTime);
        api.setScore(time, false);
        board.classList.add('won');
        for (const cell of cells) if (cell.mine && !cell.flag) {
          cell.flag = true;
          paint(cell);
        }
        flags = L.mines;
        updateMines();
        const record = api.submit(time);
        setTimeout(() => api.overlay({
          kicker: record ? 'New best time' : 'Field cleared',
          title: api.format(time),
          text: `${L.label} · ${L.cols}×${L.rows} · ${L.mines} mines`,
          tone: 'win',
          actions: [{ label: 'Play again', primary: true, onClick: reset }],
        }), 400);
      }

      const cellFrom = (e) => {
        const el = e.target.closest('.cell');
        return el ? cells[+el.dataset.i] : null;
      };

      // long-press to flag on touch screens
      let press = null;
      board.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse') return;
        const cell = cellFrom(e);
        if (!cell) return;
        press = {
          cell, x: e.clientX, y: e.clientY, fired: false,
          timer: setTimeout(() => {
            press.fired = true;
            toggleFlag(cell);
            if (navigator.vibrate) navigator.vibrate(12);
          }, 380),
        };
      });
      const cancelPress = (e) => {
        if (!press) return;
        if (e.type === 'pointermove' && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 10) return;
        clearTimeout(press.timer);
        if (e.type !== 'pointerup') press = null;
      };
      ['pointerup', 'pointercancel', 'pointermove'].forEach((ev) => board.addEventListener(ev, cancelPress));

      board.addEventListener('click', (e) => {
        const cell = cellFrom(e);
        if (!cell) return;
        if (press && press.fired) {
          press = null;
          return;
        }
        press = null;
        if (flagMode && !cell.open) toggleFlag(cell);
        else reveal(cell);
      });
      board.addEventListener('contextmenu', (e) => {
        const cell = cellFrom(e);
        if (!cell) return;
        e.preventDefault();
        toggleFlag(cell);
      });
      board.addEventListener('keydown', (e) => {
        const cell = cellFrom(e);
        if (!cell) return;
        if (e.key.toLowerCase() === 'f') toggleFlag(cell);
        const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
        const m = moves[e.key];
        if (m) {
          const r = cell.r + m[0], c = cell.c + m[1];
          if (r >= 0 && c >= 0 && r < L.rows && c < L.cols) cells[r * L.cols + c].el.focus();
        }
      });

      reset();

      return {
        restart: reset,
        destroy() {
          clearInterval(timer);
        },
      };
    },
  });
})();
