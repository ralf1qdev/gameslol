(function () {
  'use strict';

  const N = 8;
  const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const WEIGHTS = [
    100, -20, 10, 5, 5, 10, -20, 100,
    -20, -50, -2, -2, -2, -2, -50, -20,
    10, -2, 1, 1, 1, 1, -2, 10,
    5, -2, 1, 0, 0, 1, -2, 5,
    5, -2, 1, 0, 0, 1, -2, 5,
    10, -2, 1, 1, 1, 1, -2, 10,
    -20, -50, -2, -2, -2, -2, -50, -20,
    100, -20, 10, 5, 5, 10, -20, 100,
  ];
  const MODES = {
    easy: { label: 'Easy', depth: 1, random: 0.4 },
    hard: { label: 'Hard', depth: 4, random: 0 },
    pvp: { label: '2 players' },
  };

  /* ---------- rules (board: 0 empty, 1 black, 2 white) ---------- */
  function flips(b, i, p) {
    if (b[i]) return [];
    const r0 = Math.floor(i / N), c0 = i % N, out = [];
    for (const [dr, dc] of DIRS) {
      const line = [];
      let r = r0 + dr, c = c0 + dc;
      while (r >= 0 && r < N && c >= 0 && c < N && b[r * N + c] === 3 - p) {
        line.push(r * N + c);
        r += dr;
        c += dc;
      }
      if (line.length && r >= 0 && r < N && c >= 0 && c < N && b[r * N + c] === p) out.push(...line);
    }
    return out;
  }

  function movesFor(b, p) {
    const out = [];
    for (let i = 0; i < N * N; i++) {
      const f = flips(b, i, p);
      if (f.length) out.push({ i, f });
    }
    return out;
  }

  function apply(b, m, p) {
    const nb = b.slice();
    nb[m.i] = p;
    for (const k of m.f) nb[k] = p;
    return nb;
  }

  function evaluate(b, me) {
    let s = 0, mine = 0, theirs = 0;
    for (let i = 0; i < N * N; i++) {
      if (b[i] === me) { s += WEIGHTS[i]; mine++; }
      else if (b[i]) { s -= WEIGHTS[i]; theirs++; }
    }
    const mob = movesFor(b, me).length - movesFor(b, 3 - me).length;
    if (mine + theirs > 54) s += (mine - theirs) * 8;
    return s + mob * 6;
  }

  function search(b, depth, alpha, beta, me, turn) {
    const moves = movesFor(b, turn);
    if (depth === 0) return evaluate(b, me);
    if (!moves.length) {
      if (!movesFor(b, 3 - turn).length) {
        const diff = b.filter((v) => v === me).length - b.filter((v) => v && v !== me).length;
        return diff * 1000;
      }
      return search(b, depth - 1, alpha, beta, me, 3 - turn);
    }
    if (turn === me) {
      let best = -Infinity;
      for (const m of moves) {
        best = Math.max(best, search(apply(b, m, turn), depth - 1, alpha, beta, me, 3 - turn));
        alpha = Math.max(alpha, best);
        if (alpha >= beta) break;
      }
      return best;
    }
    let best = Infinity;
    for (const m of moves) {
      best = Math.min(best, search(apply(b, m, turn), depth - 1, alpha, beta, me, 3 - turn));
      beta = Math.min(beta, best);
      if (alpha >= beta) break;
    }
    return best;
  }

  GL.register({
    id: 'reversi',
    name: 'Reversi',
    category: 'Strategy',
    hue: 140,
    tagline: 'Outflank, flip, and own the board.',
    howTo: 'Place a disc so it sandwiches a line of your opponent’s discs between it and another of yours — they all flip to your colour. If you can’t move, you pass. When the board fills up, whoever has more discs wins. Corners are gold.',
    controls: [
      ['Click', 'Place a disc on a highlighted square'],
      ['R', 'Restart the game'],
    ],
    noScore: true,
    art: `<svg viewBox="0 0 160 100" aria-hidden="true"><rect x="40" y="10" width="80" height="80" rx="10" fill="#fff" opacity=".2"/><path d="M60 10v80M80 10v80M100 10v80M40 30h80M40 50h80M40 70h80" stroke="#fff" opacity=".3"/><circle cx="70" cy="40" r="8" fill="#fff"/><circle cx="90" cy="60" r="8" fill="#fff"/><circle cx="90" cy="40" r="8" fill="#0f172a"/><circle cx="70" cy="60" r="8" fill="#0f172a"/><circle cx="110" cy="40" r="8" fill="#0f172a" opacity=".85"/></svg>`,

    mount(api) {
      const { h } = GL;
      let mode = GL.store.get('reversi:mode', 'hard');
      if (!MODES[mode]) mode = 'hard';

      const grid = h('div', { class: 'rv' });
      const status = h('div', { class: 'ttt-status', 'aria-live': 'polite' });
      const next = h('button', { type: 'button', class: 'btn btn-primary ttt-next', hidden: true, onclick: () => newGame() }, 'Play again', h('kbd', {}, '↵'));
      api.root.append(h('div', { class: 'rv-wrap' }, status, grid, next));

      const cells = Array.from({ length: N * N }, (_, i) => {
        const el = h('button', { type: 'button', class: 'rv-cell', 'aria-label': `Square ${i + 1}` });
        el.addEventListener('click', () => humanMove(i));
        return el;
      });
      grid.append(...cells);

      api.options.append(
        GL.ui.segmented({
          label: 'Opponent',
          value: mode,
          options: Object.entries(MODES).map(([value, m]) => ({ value, label: m.label })),
          onChange: (v) => {
            mode = v;
            GL.store.set('reversi:mode', v);
            newGame();
          },
        }));

      let board, turn, legal, over, thinking, aiTimer, lastMove;
      const record = GL.store.get('reversi:record', { wins: 0, losses: 0 });
      const vsAI = () => mode !== 'pvp';

      function counts() {
        let b = 0, w = 0;
        for (const v of board) { if (v === 1) b++; else if (v === 2) w++; }
        return { b, w };
      }

      function stats(animate) {
        const { b, w } = counts();
        api.stat('black', vsAI() ? 'You ●' : 'Black', b, animate);
        api.stat('white', vsAI() ? 'Computer' : 'White', w, animate);
        if (vsAI()) api.stat('record', 'W – L', `${record.wins} – ${record.losses}`, false);
      }

      function newGame() {
        clearTimeout(aiTimer);
        board = Array(N * N).fill(0);
        board[27] = board[36] = 2;
        board[28] = board[35] = 1;
        turn = 1;
        over = false;
        thinking = false;
        lastMove = -1;
        legal = movesFor(board, turn);
        next.hidden = true;
        cells.forEach((el) => { el.innerHTML = ''; el.className = 'rv-cell'; });
        render(true);
        stats(false);
        begin();
      }

      function begin() {
        legal = movesFor(board, turn);
        if (!legal.length) {
          if (!movesFor(board, 3 - turn).length) return finish();
          setStatus(`${who(turn)} has no moves — pass`, turn);
          turn = 3 - turn;
          aiTimer = setTimeout(begin, 900);
          return;
        }
        if (vsAI() && turn === 2) {
          setStatus('Computer is thinking…', 2);
          render();
          thinking = true;
          aiTimer = setTimeout(aiMove, 450);
        } else {
          setStatus(vsAI() ? 'Your move' : `${who(turn)} to move`, turn);
          render();
        }
      }

      const who = (p) => (vsAI() ? (p === 1 ? 'You' : 'Computer') : p === 1 ? 'Black' : 'White');

      function setStatus(text, p) {
        status.textContent = text;
        status.dataset.who = p === 1 ? 'B' : p === 2 ? 'W' : '';
      }

      function humanMove(i) {
        if (over || thinking || (vsAI() && turn === 2)) return;
        const m = legal.find((x) => x.i === i);
        if (m) play(m);
      }

      function aiMove() {
        thinking = false;
        const md = MODES[mode];
        let pick;
        if (Math.random() < md.random) {
          pick = legal[Math.floor(Math.random() * legal.length)];
        } else {
          let best = -Infinity;
          for (const m of legal) {
            const s = search(apply(board, m, 2), md.depth - 1, -Infinity, Infinity, 2, 1) + Math.random();
            if (s > best) { best = s; pick = m; }
          }
        }
        play(pick);
      }

      function play(m) {
        board = apply(board, m, turn);
        lastMove = m.i;
        GL.sound.tone(turn === 1 ? 440 : 360, 50, 'triangle', 0.04);
        render(false, m.f);
        stats(true);
        turn = 3 - turn;
        aiTimer = setTimeout(begin, 280);
      }

      function finish() {
        over = true;
        legal = [];
        render();
        const { b, w } = counts();
        let text;
        if (b === w) text = `Draw, ${b}–${w}`;
        else if (vsAI()) {
          const won = b > w;
          won ? record.wins++ : record.losses++;
          GL.store.set('reversi:record', record);
          text = won ? `You win ${b}–${w}!` : `Computer wins ${w}–${b}`;
        } else text = `${b > w ? 'Black' : 'White'} wins ${Math.max(b, w)}–${Math.min(b, w)}`;
        setStatus(text, b === w ? 0 : b > w ? 1 : 2);
        stats(true);
        next.hidden = false;
      }

      function render(initial, flipped = []) {
        const showHints = !over && !thinking && !(vsAI() && turn === 2);
        const hints = new Set(showHints ? legal.map((m) => m.i) : []);
        cells.forEach((el, i) => {
          const v = board[i];
          let disc = el.firstChild;
          if (v && !disc) {
            disc = h('span', { class: 'rv-disc' + (initial ? '' : ' place') });
            el.append(disc);
          }
          if (disc) {
            const color = v === 1 ? 'b' : 'w';
            if (disc.dataset.c && disc.dataset.c !== color && flipped.includes(i)) {
              disc.classList.remove('flip');
              void disc.offsetWidth;
              disc.classList.add('flip');
            }
            disc.dataset.c = color;
          }
          el.classList.toggle('hint', hints.has(i));
          el.classList.toggle('last', i === lastMove);
          el.disabled = !hints.has(i);
        });
      }

      const off = GL.listen(window, 'keydown', (e) => {
        if (e.key === 'Enter' && over && !e.target.closest('button')) newGame();
      });

      newGame();
      return {
        restart: newGame,
        destroy() {
          clearTimeout(aiTimer);
          off();
        },
      };
    },
  });
})();
