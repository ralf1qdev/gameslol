(function () {
  'use strict';

  const COLS = 7;
  const ROWS = 6;
  const ORDER = [3, 2, 4, 1, 5, 0, 6];
  const MODES = {
    easy: { label: 'Easy', depth: 2, random: 0.35 },
    medium: { label: 'Medium', depth: 4, random: 0.08 },
    hard: { label: 'Hard', depth: 7, random: 0 },
    pvp: { label: '2 players' },
  };

  /* ---------- engine (board[c][r], r = 0 is the bottom) ---------- */
  function createEngine() {
    const b = Array.from({ length: COLS }, () => Array(ROWS).fill(0));
    const height = Array(COLS).fill(0);
    let count = 0;
    const e = {
      b, height,
      get count() { return count; },
      playable: (c) => height[c] < ROWS,
      drop(c, p) { b[c][height[c]++] = p; count++; },
      undo(c) { b[c][--height[c]] = 0; count--; },
      // Does the piece at (c, r) complete a line of four? Returns the winning cells or null.
      line(c, r) {
        const p = b[c][r];
        for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
          const cells = [[c, r]];
          for (const s of [1, -1]) {
            let x = c + dc * s, y = r + dr * s;
            while (x >= 0 && x < COLS && y >= 0 && y < ROWS && b[x][y] === p) {
              cells.push([x, y]);
              x += dc * s;
              y += dr * s;
            }
          }
          if (cells.length >= 4) return cells;
        }
        return null;
      },
    };
    return e;
  }

  function scoreWindow(a, me) {
    let mine = 0, theirs = 0;
    for (const v of a) {
      if (v === me) mine++;
      else if (v) theirs++;
    }
    if (mine && theirs) return 0;
    if (mine === 4) return 1000;
    if (mine === 3) return 6;
    if (mine === 2) return 2;
    if (theirs === 3) return -5;
    if (theirs === 2) return -1;
    return 0;
  }

  function evaluate(e, me) {
    const { b } = e;
    let s = 0;
    for (let r = 0; r < ROWS; r++) if (b[3][r] === me) s += 3; else if (b[3][r]) s -= 3;
    for (let c = 0; c < COLS; c++)
      for (let r = 0; r < ROWS; r++) {
        if (c <= COLS - 4) s += scoreWindow([b[c][r], b[c + 1][r], b[c + 2][r], b[c + 3][r]], me);
        if (r <= ROWS - 4) s += scoreWindow([b[c][r], b[c][r + 1], b[c][r + 2], b[c][r + 3]], me);
        if (c <= COLS - 4 && r <= ROWS - 4) s += scoreWindow([b[c][r], b[c + 1][r + 1], b[c + 2][r + 2], b[c + 3][r + 3]], me);
        if (c <= COLS - 4 && r >= 3) s += scoreWindow([b[c][r], b[c + 1][r - 1], b[c + 2][r - 2], b[c + 3][r - 3]], me);
      }
    return s;
  }

  function negamax(e, depth, alpha, beta, me) {
    if (e.count === COLS * ROWS) return 0;
    for (const c of ORDER) {
      if (!e.playable(c)) continue;
      e.drop(c, me);
      const win = e.line(c, e.height[c] - 1);
      e.undo(c);
      if (win) return 100000 + depth;
    }
    if (depth === 0) return evaluate(e, me);
    let best = -Infinity;
    for (const c of ORDER) {
      if (!e.playable(c)) continue;
      e.drop(c, me);
      const s = -negamax(e, depth - 1, -beta, -alpha, 3 - me);
      e.undo(c);
      if (s > best) best = s;
      if (s > alpha) alpha = s;
      if (alpha >= beta) break;
    }
    return best;
  }

  function bestColumn(e, me, depth) {
    let best = -Infinity, picks = [];
    for (const c of ORDER) {
      if (!e.playable(c)) continue;
      e.drop(c, me);
      const s = e.line(c, e.height[c] - 1) ? 1e9 : -negamax(e, depth - 1, -Infinity, Infinity, 3 - me);
      e.undo(c);
      if (s > best) { best = s; picks = [c]; }
      else if (s === best) picks.push(c);
    }
    return picks[0];
  }

  GL.register({
    id: 'connect4',
    name: 'Connect Four',
    category: 'Strategy',
    hue: 0,
    tagline: 'Drop discs, block threats, line up four.',
    howTo: 'Take turns dropping discs into the columns. The first to connect four in a row — horizontally, vertically or diagonally — wins. Watch for traps: the computer plans several moves ahead.',
    controls: [
      ['Click', 'Drop a disc in a column'],
      ['1-7', 'Drop by column number'],
      ['← →', 'Choose a column'],
      ['Space', 'Drop in the chosen column'],
      ['R', 'Restart the round'],
    ],
    noScore: true,
    art: `<svg viewBox="0 0 160 100" aria-hidden="true"><rect x="36" y="14" width="88" height="74" rx="10" fill="#fff" opacity=".25"/><g fill="#fff" opacity=".35"><circle cx="52" cy="30" r="7"/><circle cx="72" cy="30" r="7"/><circle cx="92" cy="30" r="7"/><circle cx="112" cy="30" r="7"/><circle cx="52" cy="50" r="7"/><circle cx="112" cy="50" r="7"/></g><g fill="#fde047"><circle cx="72" cy="50" r="7"/><circle cx="52" cy="70" r="7"/><circle cx="112" cy="70" r="7"/></g><g fill="#fff"><circle cx="92" cy="50" r="7"/><circle cx="72" cy="70" r="7"/><circle cx="92" cy="70" r="7"/></g></svg>`,

    mount(api) {
      const { h } = GL;
      let mode = GL.store.get('c4:mode', 'medium');
      if (!MODES[mode]) mode = 'medium';

      const grid = h('div', { class: 'c4' });
      const status = h('div', { class: 'ttt-status', 'aria-live': 'polite' });
      const next = h('button', { type: 'button', class: 'btn btn-primary ttt-next', hidden: true, onclick: () => newRound() }, 'Next round', h('kbd', {}, '↵'));
      api.root.append(h('div', { class: 'c4-wrap' }, status, grid, next));

      const cellEls = [];
      for (let r = ROWS - 1; r >= 0; r--)
        for (let c = 0; c < COLS; c++) {
          const el = h('div', { class: 'c4-cell', 'data-c': c });
          cellEls[c * ROWS + r] = el;
          grid.append(el);
        }
      grid.addEventListener('click', (e) => {
        const cell = e.target.closest('.c4-cell');
        if (cell) humanDrop(+cell.dataset.c);
      });
      grid.addEventListener('pointerover', (e) => {
        const cell = e.target.closest('.c4-cell');
        if (cell) setHover(+cell.dataset.c);
      });
      grid.addEventListener('pointerleave', () => setHover(-1));

      api.options.append(
        GL.ui.segmented({
          label: 'Opponent',
          value: mode,
          options: Object.entries(MODES).map(([value, m]) => ({ value, label: m.label })),
          onChange: (v) => {
            mode = v;
            GL.store.set('c4:mode', v);
            resetMatch();
          },
        }),
        h('button', { type: 'button', class: 'btn btn-block', onclick: () => resetMatch() }, 'Reset scores'));

      let eng, turn, starter = 1, over, thinking, aiTimer, tally, hover = -1;
      const vsAI = () => mode !== 'pvp';
      const names = () => (vsAI() ? { 1: 'You', 2: 'Computer' } : { 1: 'Yellow', 2: 'Red' });

      function showTally(animate) {
        const n = names();
        api.stat('p1', n[1], tally[1], animate);
        api.stat('draw', 'Draws', tally.draw, animate);
        api.stat('p2', n[2], tally[2], animate);
      }

      function setStatus(text, who) {
        status.textContent = text;
        status.dataset.who = who === 1 ? 'Y' : who === 2 ? 'R' : '';
      }

      function resetMatch() {
        tally = { 1: 0, 2: 0, draw: 0 };
        starter = 1;
        showTally(false);
        newRound(true);
      }

      function newRound(keepStarter) {
        clearTimeout(aiTimer);
        if (!keepStarter) starter = 3 - starter;
        eng = createEngine();
        turn = starter;
        over = false;
        thinking = false;
        grid.classList.remove('done');
        cellEls.forEach((el) => { el.innerHTML = ''; el.classList.remove('win'); });
        next.hidden = true;
        prompt();
        if (vsAI() && turn === 2) aiTurn();
      }

      function prompt() {
        const n = names();
        if (vsAI()) setStatus(turn === 1 ? 'Your move' : 'Computer is thinking…', turn);
        else setStatus(`${n[turn]} to move`, turn);
        setHover(hover);
      }

      function setHover(c) {
        hover = c;
        grid.querySelectorAll('.c4-cell.hover').forEach((el) => el.classList.remove('hover'));
        if (c < 0 || over || thinking || (vsAI() && turn !== 1) || !eng.playable(c)) return;
        const el = cellEls[c * ROWS + eng.height[c]];
        el.classList.add('hover');
        el.dataset.p = turn;
      }

      function humanDrop(c) {
        if (over || thinking || (vsAI() && turn !== 1)) return;
        play(c);
      }

      function play(c) {
        if (!eng.playable(c)) return;
        const r = eng.height[c];
        eng.drop(c, turn);
        const disc = h('span', { class: 'c4-disc p' + turn, style: `--fall:${ROWS - r}` });
        const el = cellEls[c * ROWS + r];
        el.classList.remove('hover');
        el.append(disc);
        GL.sound.tone(turn === 1 ? 520 : 400, 60, 'triangle', 0.04);
        const win = eng.line(c, r);
        if (win) return finish(turn, win);
        if (eng.count === COLS * ROWS) return finish(0);
        turn = 3 - turn;
        prompt();
        if (vsAI() && turn === 2) aiTurn();
      }

      function aiTurn() {
        thinking = true;
        setHover(-1);
        aiTimer = setTimeout(() => {
          const m = MODES[mode];
          let c;
          if (Math.random() < m.random) {
            const open = ORDER.filter((k) => eng.playable(k));
            c = open[Math.floor(Math.random() * open.length)];
          } else {
            c = bestColumn(eng, 2, m.depth);
          }
          thinking = false;
          play(c);
        }, 380);
      }

      function finish(winner, cells) {
        over = true;
        grid.classList.add('done');
        setHover(-1);
        const n = names();
        if (winner) {
          tally[winner]++;
          setTimeout(() => cells.forEach(([c, r]) => cellEls[c * ROWS + r].classList.add('win')), 350);
          if (vsAI()) setStatus(winner === 1 ? 'Four in a row — you win!' : 'The computer connects four', winner);
          else setStatus(`${n[winner]} wins!`, winner);
        } else {
          tally.draw++;
          setStatus('Board full — it’s a draw', 0);
        }
        showTally(true);
        next.hidden = false;
      }

      const off = GL.listen(window, 'keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (/^[1-7]$/.test(e.key)) return humanDrop(+e.key - 1);
        const d = GL.dirFromKey(e);
        if (d === 'left' || d === 'right') {
          let c = hover < 0 ? 3 : hover + (d === 'left' ? -1 : 1);
          c = Math.max(0, Math.min(COLS - 1, c));
          setHover(c);
        } else if (e.key === ' ' && hover >= 0) {
          humanDrop(hover);
        } else if (e.key === 'Enter' && over && !e.target.closest('button')) {
          newRound();
        }
      });

      resetMatch();
      return {
        restart: () => newRound(true),
        destroy() {
          clearTimeout(aiTimer);
          off();
        },
      };
    },
  });
})();
