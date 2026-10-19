(function () {
  'use strict';

  /* ==========================================================================
     Engine. Board is 64 squares, index 0 = a8 … 63 = h1. Pieces: 'PNBRQK' white, 'pnbrqk' black.
     ========================================================================== */
  const FILES = 'abcdefgh';
  const KN = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const KG = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const BD = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const RD = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  const MATE = 100000;

  // Piece-square tables from white's point of view (index 0 = a8).
  const PST = {
    p: [0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5, -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0, 0],
    n: [-50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30, 0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20, 20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20, -40, -50, -40, -30, -30, -30, -30, -40, -50],
    b: [-20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10, 0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20, -10, -10, -10, -10, -10, -10, -20],
    r: [0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0],
    q: [-20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5, 5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5, 5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10, -10, -20],
    k: [-30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -30, -40, -40, -50, -50, -40, -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20, -20, -20, -10, 20, 20, 0, 0, 0, 0, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20],
  };

  const isW = (p) => p !== null && p === p.toUpperCase();
  const side = (p) => (p === null ? null : isW(p) ? 'w' : 'b');
  const sqName = (i) => FILES[i % 8] + (8 - (i >> 3));
  const on = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;

  function initial() {
    const rows = ['rnbqkbnr', 'pppppppp', '........', '........', '........', '........', 'PPPPPPPP', 'RNBQKBNR'];
    return { b: rows.join('').split('').map((ch) => (ch === '.' ? null : ch)), turn: 'w', castle: 'KQkq', ep: -1, half: 0 };
  }

  function attacked(b, sq, by) {
    const r = sq >> 3, c = sq & 7;
    const W = by === 'w';
    const pr = r + (W ? 1 : -1);
    for (const dc of [-1, 1]) if (on(pr, c + dc) && b[pr * 8 + c + dc] === (W ? 'P' : 'p')) return true;
    for (const [dr, dc] of KN) if (on(r + dr, c + dc) && b[(r + dr) * 8 + c + dc] === (W ? 'N' : 'n')) return true;
    for (const [dr, dc] of KG) if (on(r + dr, c + dc) && b[(r + dr) * 8 + c + dc] === (W ? 'K' : 'k')) return true;
    for (const [dirs, a, q] of [[BD, W ? 'B' : 'b', W ? 'Q' : 'q'], [RD, W ? 'R' : 'r', W ? 'Q' : 'q']]) {
      for (const [dr, dc] of dirs) {
        let rr = r + dr, cc = c + dc;
        while (on(rr, cc)) {
          const p = b[rr * 8 + cc];
          if (p) {
            if (p === a || p === q) return true;
            break;
          }
          rr += dr;
          cc += dc;
        }
      }
    }
    return false;
  }

  const kingSq = (b, color) => b.indexOf(color === 'w' ? 'K' : 'k');
  const inCheck = (s) => attacked(s.b, kingSq(s.b, s.turn), s.turn === 'w' ? 'b' : 'w');

  function pseudo(s, capturesOnly) {
    const { b, turn } = s;
    const out = [];
    const enemy = turn === 'w' ? 'b' : 'w';
    const add = (from, to, extra) => out.push({ from, to, capture: !!b[to] || !!(extra && extra.ep), ...extra });
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p || side(p) !== turn) continue;
      const r = i >> 3, c = i & 7, t = p.toLowerCase();
      if (t === 'p') {
        const dir = turn === 'w' ? -1 : 1;
        const startRow = turn === 'w' ? 6 : 1;
        const lastRow = turn === 'w' ? 0 : 7;
        const push = (to, extra) => {
          if ((to >> 3) === lastRow) for (const promo of ['q', 'r', 'b', 'n']) add(i, to, { ...extra, promo });
          else add(i, to, extra);
        };
        const one = (r + dir) * 8 + c;
        if (!capturesOnly && on(r + dir, c) && !b[one]) {
          push(one);
          const two = (r + 2 * dir) * 8 + c;
          if (r === startRow && !b[two]) add(i, two, { double: true });
        }
        for (const dc of [-1, 1]) {
          if (!on(r + dir, c + dc)) continue;
          const to = (r + dir) * 8 + c + dc;
          if (b[to] && side(b[to]) === enemy) push(to);
          else if (to === s.ep) add(i, to, { ep: true });
        }
      } else if (t === 'n' || t === 'k') {
        for (const [dr, dc] of t === 'n' ? KN : KG) {
          if (!on(r + dr, c + dc)) continue;
          const to = (r + dr) * 8 + c + dc;
          if (!b[to] ? !capturesOnly : side(b[to]) === enemy) add(i, to);
        }
        if (t === 'k' && !capturesOnly) {
          const W = turn === 'w', home = W ? 60 : 4;
          if (i === home && !attacked(b, home, enemy)) {
            if (s.castle.includes(W ? 'K' : 'k') && !b[home + 1] && !b[home + 2] && !attacked(b, home + 1, enemy) && !attacked(b, home + 2, enemy)) add(i, home + 2, { castle: true });
            if (s.castle.includes(W ? 'Q' : 'q') && !b[home - 1] && !b[home - 2] && !b[home - 3] && !attacked(b, home - 1, enemy) && !attacked(b, home - 2, enemy)) add(i, home - 2, { castle: true });
          }
        }
      } else {
        const dirs = t === 'b' ? BD : t === 'r' ? RD : BD.concat(RD);
        for (const [dr, dc] of dirs) {
          let rr = r + dr, cc = c + dc;
          while (on(rr, cc)) {
            const to = rr * 8 + cc;
            if (b[to]) {
              if (side(b[to]) === enemy) add(i, to);
              break;
            }
            if (!capturesOnly) add(i, to);
            rr += dr;
            cc += dc;
          }
        }
      }
    }
    return out;
  }

  function make(s, m) {
    const b = s.b.slice();
    const p = b[m.from];
    const W = s.turn === 'w';
    b[m.to] = m.promo ? (W ? m.promo.toUpperCase() : m.promo) : p;
    b[m.from] = null;
    if (m.ep) b[m.to + (W ? 8 : -8)] = null;
    if (m.castle) {
      if (m.to % 8 === 6) { b[m.to - 1] = b[m.to + 1]; b[m.to + 1] = null; }
      else { b[m.to + 1] = b[m.to - 2]; b[m.to - 2] = null; }
    }
    let castle = s.castle;
    if (p === 'K') castle = castle.replace(/[KQ]/g, '');
    if (p === 'k') castle = castle.replace(/[kq]/g, '');
    for (const [sq, flag] of [[63, 'K'], [56, 'Q'], [7, 'k'], [0, 'q']]) if (m.from === sq || m.to === sq) castle = castle.replace(flag, '');
    return {
      b,
      turn: W ? 'b' : 'w',
      castle,
      ep: m.double ? (m.from + m.to) / 2 : -1,
      half: p.toLowerCase() === 'p' || m.capture ? 0 : s.half + 1,
    };
  }

  function legal(s, capturesOnly) {
    return pseudo(s, capturesOnly).filter((m) => {
      const n = make(s, m);
      return !attacked(n.b, kingSq(n.b, s.turn), n.turn);
    });
  }

  function evaluate(s) {
    let score = 0;
    for (let i = 0; i < 64; i++) {
      const p = s.b[i];
      if (!p) continue;
      const t = p.toLowerCase();
      if (isW(p)) score += VALUE[t] + PST[t][i];
      else score -= VALUE[t] + PST[t][(7 - (i >> 3)) * 8 + (i & 7)];
    }
    return s.turn === 'w' ? score : -score;
  }

  const orderKey = (s, m) => (m.capture ? 10 * VALUE[(s.b[m.to] || 'p').toLowerCase()] - VALUE[s.b[m.from].toLowerCase()] + 1000 : 0) + (m.promo === 'q' ? 800 : 0);
  const ordered = (s, moves) => moves.sort((a, b) => orderKey(s, b) - orderKey(s, a));

  const TIMEOUT = {};
  function think(s, maxDepth, ms) {
    const deadline = performance.now() + ms;
    let nodes = 0;
    const tick = () => { if ((++nodes & 1023) === 0 && performance.now() > deadline) throw TIMEOUT; };

    function quiesce(st, alpha, beta, qd) {
      tick();
      const stand = evaluate(st);
      if (stand >= beta) return beta;
      if (stand > alpha) alpha = stand;
      if (qd > 5) return alpha;
      for (const m of ordered(st, legal(st, true))) {
        const sc = -quiesce(make(st, m), -beta, -alpha, qd + 1);
        if (sc >= beta) return beta;
        if (sc > alpha) alpha = sc;
      }
      return alpha;
    }

    function negamax(st, depth, alpha, beta, ply) {
      tick();
      const moves = legal(st);
      if (!moves.length) return inCheck(st) ? -MATE + ply : 0;
      if (st.half >= 100) return 0;
      if (depth === 0) return quiesce(st, alpha, beta, 0);
      for (const m of ordered(st, moves)) {
        const sc = -negamax(make(st, m), depth - 1, -beta, -alpha, ply + 1);
        if (sc >= beta) return beta;
        if (sc > alpha) alpha = sc;
      }
      return alpha;
    }

    // shuffle first so equally good moves vary between games (the sort is stable)
    let rootMoves = ordered(s, legal(s).sort(() => Math.random() - 0.5));
    let best = rootMoves[0];
    for (let d = 1; d <= maxDepth; d++) {
      try {
        let alpha = -Infinity, bestD = null;
        const scored = [];
        for (const m of rootMoves) {
          const sc = -negamax(make(s, m), d - 1, -Infinity, -alpha, 1);
          scored.push([sc, m]);
          if (sc > alpha) { alpha = sc; bestD = m; }
        }
        best = bestD;
        rootMoves = scored.sort((a, b) => b[0] - a[0]).map((x) => x[1]); // best-first for the next iteration
        if (alpha > MATE - 100) break;
      } catch (e) {
        if (e !== TIMEOUT) throw e;
        break;
      }
    }
    return best;
  }

  function san(s, m) {
    let str;
    if (m.castle) str = m.to % 8 === 6 ? 'O-O' : 'O-O-O';
    else {
      const p = s.b[m.from].toUpperCase();
      str = '';
      if (p !== 'P') {
        str = p;
        const rivals = legal(s).filter((o) => o.to === m.to && o.from !== m.from && s.b[o.from] === s.b[m.from]);
        if (rivals.length) {
          if (!rivals.some((o) => o.from % 8 === m.from % 8)) str += FILES[m.from % 8];
          else if (!rivals.some((o) => o.from >> 3 === m.from >> 3)) str += 8 - (m.from >> 3);
          else str += sqName(m.from);
        }
      }
      if (m.capture) str += (p === 'P' ? FILES[m.from % 8] : '') + 'x';
      str += sqName(m.to);
      if (m.promo) str += '=' + m.promo.toUpperCase();
    }
    const n = make(s, m);
    if (inCheck(n)) str += legal(n).length ? '+' : '#';
    return str;
  }

  function insufficient(b) {
    const pieces = b.filter((p) => p && p.toLowerCase() !== 'k');
    if (!pieces.length) return true;
    return pieces.length === 1 && 'nbNB'.includes(pieces[0]);
  }

  const posKey = (s) => s.b.map((p) => p || '.').join('') + s.turn + s.castle + s.ep;

  /* ==========================================================================
     Pieces (original flat SVG designs)
     ========================================================================== */
  const BASE = '<path d="M10 38h25a2 2 0 0 1 2 2v1H8v-1a2 2 0 0 1 2-2z"/>';
  const SHAPES = {
    p: '<circle cx="22.5" cy="13" r="5.5"/><path d="M17 20h11l-1.5 2.5c2.5 3 3.5 7 4 12.5H14.5c.5-5.5 1.5-9.5 4-12.5z"/>' + BASE,
    r: '<path d="M12 8h4.5v3h3V8h6v3h3V8H33v7l-3 3v14l3 3H12l3-3V18l-3-3z"/><path class="d" d="M15 18h15"/>' + BASE,
    n: '<path d="M13.5 35c0-6 2.5-9.5 6-12.5-2.5-.3-4.6.6-6.6 2.2l-2.6-3c1.2-4.8 4.6-9 9-11l1.2-3.4 2.4 2.7C29 11 33 16.4 33 23.5c0 4.2-1 8-2.2 11.5z"/><circle class="e" cx="20.5" cy="14.5" r="1.4"/>' + BASE,
    b: '<circle cx="22.5" cy="7" r="2.6"/><path d="M22.5 9.6c-5.2 3.6-7.8 8.2-7.8 12.4 0 3.6 2 6.2 3.7 7.3L17.5 35h10l-.9-5.7c1.7-1.1 3.7-3.7 3.7-7.3 0-4.2-2.6-8.8-7.8-12.4z"/><path class="d" d="M20 20.5l5.5-5.5M18.5 30h8"/>' + BASE,
    q: '<path d="M11 15.5l3.6 14.5h15.8L34 15.5l-5.6 7-2-9.8-3.9 9-3.9-9-2 9.8z"/><g><circle cx="11" cy="13.5" r="2.3"/><circle cx="16.6" cy="10.6" r="2.3"/><circle cx="22.5" cy="10" r="2.3"/><circle cx="28.4" cy="10.6" r="2.3"/><circle cx="34" cy="13.5" r="2.3"/></g><path d="M14 30h17l1.5 5h-20z"/>' + BASE,
    k: '<path d="M21 3.5h3v3h3v3h-3v3.5h-3V9.5h-3v-3h3z"/><path d="M13.6 31c-2.2-5-3.2-9.4-1.2-12.4 2.2-3.3 6.6-3.2 10.1.9 3.5-4.1 7.9-4.2 10.1-.9 2 3 1 7.4-1.2 12.4z"/><path d="M13.5 31h18l1 4h-20z"/><path class="d" d="M22.5 19.5V30"/>' + BASE,
  };
  const pieceSVG = (p) => `<svg viewBox="0 0 45 45" class="cp ${isW(p) ? 'cw' : 'cb'}" aria-hidden="true">${SHAPES[p.toLowerCase()]}</svg>`;

  const MODES = {
    easy: { label: 'Easy', depth: 1, ms: 200, random: 0.3 },
    medium: { label: 'Medium', depth: 2, ms: 700, random: 0 },
    hard: { label: 'Hard', depth: 5, ms: 1600, random: 0 },
    pvp: { label: '2 players' },
  };

  GL.register({
    id: 'chess',
    name: 'Chess',
    category: 'Strategy',
    hue: 30,
    tagline: 'The full game, against a computer that thinks ahead.',
    howTo: 'Click a piece to see where it can go, then click a highlighted square to move. All the rules are in: castling, en passant, promotion, check, checkmate, stalemate, threefold repetition and the fifty-move rule.',
    controls: [
      ['Click', 'Select a piece, then its destination'],
      ['U', 'Take back a move'],
      ['F', 'Flip the board'],
      ['R', 'New game'],
    ],
    noScore: true,
    art: `<svg viewBox="0 0 160 100" aria-hidden="true"><g transform="translate(36 14) scale(1.6)" fill="#fff" stroke="#fff" stroke-linejoin="round">${SHAPES.k}</g><g transform="translate(80 30) scale(1.25)" fill="#fff" opacity=".6">${SHAPES.n}</g></svg>`,

    mount(api) {
      const { h } = GL;
      let mode = GL.store.get('chess:mode', 'medium');
      if (!MODES[mode]) mode = 'medium';
      let human = GL.store.get('chess:color', 'w');
      let flipped = false;
      const record = GL.store.get('chess:record', { w: 0, d: 0, l: 0 });

      const boardEl = h('div', { class: 'chess' });
      const status = h('div', { class: 'ttt-status', 'aria-live': 'polite' });
      const capTop = h('div', { class: 'chess-caps' });
      const capBottom = h('div', { class: 'chess-caps' });
      const next = h('button', { type: 'button', class: 'btn btn-primary ttt-next', hidden: true, onclick: () => newGame() }, 'New game', h('kbd', {}, '↵'));
      api.root.append(h('div', { class: 'chess-wrap' }, status, capTop, boardEl, capBottom, next));

      const squares = Array.from({ length: 64 }, (_, i) => {
        const el = h('button', { type: 'button', class: 'csq', 'data-i': i });
        el.addEventListener('click', () => clickSquare(i));
        return el;
      });
      boardEl.append(...squares);

      const movesEl = h('ol', { class: 'chess-moves' });
      const undoBtn = h('button', { type: 'button', class: 'btn', html: 'Undo <kbd>U</kbd>', onclick: () => undo() });
      const flipBtn = h('button', { type: 'button', class: 'btn', html: 'Flip <kbd>F</kbd>', onclick: () => { flipped = !flipped; render(); } });
      api.options.append(
        GL.ui.segmented({
          label: 'Opponent',
          value: mode,
          options: Object.entries(MODES).map(([value, m]) => ({ value, label: m.label })),
          onChange: (v) => { mode = v; GL.store.set('chess:mode', v); newGame(); },
        }),
        GL.ui.segmented({
          label: 'Play as',
          value: human,
          options: [{ value: 'w', label: 'White' }, { value: 'b', label: 'Black' }],
          onChange: (v) => { human = v; GL.store.set('chess:color', v); newGame(); },
        }),
        h('div', { class: 'actions' }, undoBtn, flipBtn),
        h('section', { class: 'panel chess-log' }, h('h4', {}, 'Moves'), movesEl));

      let state, history, positions, selected, targets, lastMove, over, thinking, aiTimer, animate;
      const vsAI = () => mode !== 'pvp';
      const aiColor = () => (human === 'w' ? 'b' : 'w');

      function stats(anim) {
        if (vsAI()) {
          api.stat('w', 'Wins', record.w, anim);
          api.stat('d', 'Draws', record.d, anim);
          api.stat('l', 'Losses', record.l, anim);
        }
      }

      function newGame() {
        clearTimeout(aiTimer);
        state = initial();
        history = [];
        positions = { [posKey(state)]: 1 };
        selected = -1;
        targets = [];
        lastMove = null;
        over = false;
        thinking = false;
        animate = null;
        flipped = vsAI() && human === 'b';
        next.hidden = true;
        api.hideOverlay();
        stats(false);
        afterMove();
      }

      function clickSquare(i) {
        if (over || thinking || (vsAI() && state.turn !== human)) return;
        const p = state.b[i];
        const t = targets.filter((m) => m.to === i);
        if (selected >= 0 && t.length) {
          if (t.length > 1) return choosePromotion(t);
          return play(t[0]);
        }
        if (p && side(p) === state.turn) {
          selected = i === selected ? -1 : i;
          targets = selected >= 0 ? legal(state).filter((m) => m.from === i) : [];
        } else {
          selected = -1;
          targets = [];
        }
        render();
      }

      function choosePromotion(options) {
        const names = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };
        api.overlay({
          kicker: 'Promotion',
          title: 'Choose a piece',
          actions: options.map((m) => ({ label: names[m.promo], primary: m.promo === 'q', onClick: () => { api.hideOverlay(); play(m); } })),
        });
      }

      function play(m) {
        const notation = san(state, m);
        history.push({ state, move: m, san: notation });
        state = make(state, m);
        const key = posKey(state);
        positions[key] = (positions[key] || 0) + 1;
        lastMove = m;
        animate = m;
        selected = -1;
        targets = [];
        GL.sound.tone(m.capture ? 300 : 520, m.capture ? 90 : 50, 'triangle', 0.05);
        afterMove();
      }

      function afterMove() {
        const moves = legal(state);
        const check = inCheck(state);
        const mover = state.turn === 'w' ? 'White' : 'Black';
        let result = null;
        if (!moves.length) result = check ? { winner: state.turn === 'w' ? 'b' : 'w', why: 'checkmate' } : { winner: null, why: 'stalemate' };
        else if (state.half >= 100) result = { winner: null, why: 'the fifty-move rule' };
        else if (positions[posKey(state)] >= 3) result = { winner: null, why: 'threefold repetition' };
        else if (insufficient(state.b)) result = { winner: null, why: 'insufficient material' };

        render(check);
        renderLog();

        if (result) return finish(result);
        if (vsAI() && state.turn === aiColor()) {
          setStatus(check ? 'Check! Computer is thinking…' : 'Computer is thinking…', state.turn);
          thinking = true;
          aiTimer = setTimeout(aiMove, 260);
        } else if (vsAI()) {
          setStatus(check ? 'Check! Your move' : 'Your move', state.turn);
        } else {
          setStatus(`${mover} to move${check ? ' — check!' : ''}`, state.turn);
        }
      }

      function aiMove() {
        const md = MODES[mode];
        let m;
        const moves = legal(state);
        if (Math.random() < md.random) m = moves[Math.floor(Math.random() * moves.length)];
        else m = think(state, md.depth, md.ms);
        thinking = false;
        play(m);
      }

      function finish({ winner, why }) {
        over = true;
        let text;
        if (!winner) text = `Draw by ${why}`;
        else text = `${winner === 'w' ? 'White' : 'Black'} wins by ${why}`;
        if (vsAI()) {
          if (!winner) record.d++;
          else if (winner === human) record.w++;
          else record.l++;
          GL.store.set('chess:record', record);
          stats(true);
          if (winner) text = winner === human ? `Checkmate — you win!` : `Checkmate — the computer wins`;
        }
        setStatus(text, winner || '');
        next.hidden = false;
      }

      function undo() {
        if (!history.length || (thinking && vsAI())) return;
        clearTimeout(aiTimer);
        thinking = false;
        // in vs-computer games, step back to the last position where it was the human's turn
        do {
          const key = posKey(state);
          positions[key]--;
          state = history.pop().state;
        } while (vsAI() && history.length && state.turn !== human);
        lastMove = history.length ? history[history.length - 1].move : null;
        over = false;
        next.hidden = true;
        selected = -1;
        targets = [];
        animate = null;
        afterMove();
      }

      function setStatus(text, who) {
        status.textContent = text;
        status.dataset.who = who === 'w' ? 'W' : who === 'b' ? 'B' : '';
      }

      function render(check) {
        const kingInCheck = check ? kingSq(state.b, state.turn) : -1;
        const targetSet = new Map(targets.map((m) => [m.to, m]));
        squares.forEach((el, i) => {
          // visual position: flip by reversing order
          const vis = flipped ? 63 - i : i;
          el.style.order = vis;
          const r = i >> 3, c = i & 7;
          el.className = 'csq ' + ((r + c) % 2 ? 'sq-d' : 'sq-l');
          if (lastMove && (i === lastMove.from || i === lastMove.to)) el.classList.add('last');
          if (i === selected) el.classList.add('sel');
          if (i === kingInCheck) el.classList.add('check');
          const tm = targetSet.get(i);
          if (tm) el.classList.add(tm.capture ? 'cap' : 'dot');
          const vr = vis >> 3, vc = vis & 7;
          let coords = '';
          if (vc === 0) coords += `<span class="rank">${8 - r}</span>`;
          if (vr === 7) coords += `<span class="file">${FILES[c]}</span>`;
          const p = state.b[i];
          el.innerHTML = coords + (p ? pieceSVG(p) : '');
          el.setAttribute('aria-label', sqName(i) + (p ? ' ' + (isW(p) ? 'white ' : 'black ') + { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }[p.toLowerCase()] : ''));
        });
        if (animate) {
          const svgEl = squares[animate.to].querySelector('.cp');
          if (svgEl) {
            const sign = flipped ? -1 : 1;
            const dx = ((animate.from & 7) - (animate.to & 7)) * 100 * sign;
            const dy = ((animate.from >> 3) - (animate.to >> 3)) * 100 * sign;
            svgEl.style.setProperty('--dx', dx + '%');
            svgEl.style.setProperty('--dy', dy + '%');
            svgEl.classList.add('moving');
          }
          animate = null;
        }
        renderCaptures();
        undoBtn.disabled = !history.length;
      }

      function renderCaptures() {
        const start = { p: 8, n: 2, b: 2, r: 2, q: 1 };
        const count = { w: { ...start }, b: { ...start } };
        for (const p of state.b) if (p && p.toLowerCase() !== 'k') count[side(p)][p.toLowerCase()]--;
        const strip = (color) => {
          // pieces of `color` that have been captured
          let html = '';
          let material = 0;
          for (const t of ['q', 'r', 'b', 'n', 'p']) {
            for (let k = 0; k < count[color][t]; k++) html += pieceSVG(color === 'w' ? t.toUpperCase() : t);
            material += count[color][t] * VALUE[t];
          }
          return { html, material };
        };
        const lostW = strip('w'), lostB = strip('b');
        const diff = (lostB.material - lostW.material) / 100; // positive: white is ahead
        const bottomColor = flipped ? 'b' : 'w';
        const topColor = bottomColor === 'w' ? 'b' : 'w';
        // each player's strip shows the pieces they captured
        const show = (el, color) => {
          const taken = color === 'w' ? lostB : lostW;
          const lead = color === 'w' ? diff : -diff;
          el.innerHTML = taken.html + (lead > 0 ? `<span class="lead">+${Math.round(lead)}</span>` : '');
        };
        show(capBottom, bottomColor);
        show(capTop, topColor);
      }

      function renderLog() {
        movesEl.replaceChildren();
        for (let k = 0; k < history.length; k += 2) {
          movesEl.append(h('li', {}, h('span', {}, history[k].san), h('span', {}, history[k + 1] ? history[k + 1].san : '')));
        }
        movesEl.scrollTop = movesEl.scrollHeight;
      }

      const off = GL.listen(window, 'keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key.toLowerCase();
        if (k === 'u') undo();
        else if (k === 'f') { flipped = !flipped; render(); }
        else if (e.key === 'Enter' && over && !e.target.closest('button')) newGame();
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

  // exposed for tests
  GL.chessEngine = { initial, legal, make, think, san, inCheck };
})();
