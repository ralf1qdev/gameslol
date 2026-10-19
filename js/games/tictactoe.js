(function () {
  'use strict';

  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  const MODES = {
    easy: { label: 'Easy', smart: 0.25 },
    medium: { label: 'Medium', smart: 0.7 },
    hard: { label: 'Unbeatable', smart: 1 },
    pvp: { label: '2 players' },
  };
  const MARK = {
    X: '<svg viewBox="0 0 100 100" class="mark mark-x" aria-hidden="true"><path d="M24 24L76 76"/><path d="M76 24L24 76"/></svg>',
    O: '<svg viewBox="0 0 100 100" class="mark mark-o" aria-hidden="true"><circle cx="50" cy="50" r="27"/></svg>',
  };

  function outcome(b) {
    for (const line of LINES) {
      const [a, c, d] = line;
      if (b[a] && b[a] === b[c] && b[a] === b[d]) return { winner: b[a], line };
    }
    return b.every(Boolean) ? { winner: null } : null;
  }

  function minimax(b, turn, ai, depth) {
    const o = outcome(b);
    if (o) return o.winner === ai ? 10 - depth : o.winner ? depth - 10 : 0;
    let best = turn === ai ? -Infinity : Infinity;
    for (let i = 0; i < 9; i++) {
      if (b[i]) continue;
      b[i] = turn;
      const score = minimax(b, turn === 'X' ? 'O' : 'X', ai, depth + 1);
      b[i] = null;
      best = turn === ai ? Math.max(best, score) : Math.min(best, score);
    }
    return best;
  }

  function bestMove(b, ai) {
    let best = -Infinity, moves = [];
    for (let i = 0; i < 9; i++) {
      if (b[i]) continue;
      b[i] = ai;
      const score = minimax(b, ai === 'X' ? 'O' : 'X', ai, 1);
      b[i] = null;
      if (score > best) { best = score; moves = [i]; }
      else if (score === best) moves.push(i);
    }
    return moves[Math.floor(Math.random() * moves.length)];
  }

  GL.register({
    id: 'tictactoe',
    name: 'Tic-Tac-Toe',
    category: 'Strategy',
    hue: 222,
    tagline: 'Three in a row against an AI that never blinks.',
    howTo: 'Take turns placing your mark. First to line up three — across, down or diagonally — wins the round. On Unbeatable the computer plays perfectly: a draw is a good result.',
    controls: [
      ['Click', 'Place your mark'],
      ['1-9', 'Place by number'],
      ['R', 'Restart the round'],
    ],
    noScore: true,
    art: `<svg viewBox="0 0 160 100" aria-hidden="true" fill="none" stroke="#fff" stroke-linecap="round"><g stroke-width="3" opacity=".45"><path d="M68 14v72M92 14v72M44 38h72M44 62h72"/></g><g stroke-width="6"><path d="M50 20l12 12M62 20L50 32M98 68l12 12M110 68L98 80"/><circle cx="80" cy="50" r="7"/><circle cx="104" cy="26" r="7"/></g></svg>`,

    mount(api) {
      const { h } = GL;
      let mode = GL.store.get('ttt:mode', 'hard');
      if (!MODES[mode]) mode = 'hard';
      let board, turn, starter = 'X', over, thinking, aiTimer, tally;

      const cellEls = Array.from({ length: 9 }, (_, i) =>
        h('button', { type: 'button', class: 'ttt-cell', 'aria-label': `Square ${i + 1}`, onclick: () => play(i, true) }));
      const status = h('div', { class: 'ttt-status', 'aria-live': 'polite' });
      const grid = h('div', { class: 'ttt' }, cellEls);
      const next = h('button', { type: 'button', class: 'btn btn-primary ttt-next', hidden: true, onclick: () => newRound() },
        'Next round', h('kbd', {}, '↵'));
      api.root.append(h('div', { class: 'ttt-wrap' }, status, grid, next));

      api.options.append(
        GL.ui.segmented({
          label: 'Opponent',
          value: mode,
          options: Object.entries(MODES).map(([value, m]) => ({ value, label: m.label })),
          onChange: (v) => {
            mode = v;
            GL.store.set('ttt:mode', v);
            resetMatch();
          },
        }),
        h('button', { type: 'button', class: 'btn btn-block', onclick: () => resetMatch() }, 'Reset scores'));

      const vsAI = () => mode !== 'pvp';
      const names = () => (vsAI() ? { X: 'You', O: 'Computer' } : { X: 'Player X', O: 'Player O' });

      function showTally(animate) {
        const n = names();
        api.stat('x', n.X, tally.X, animate);
        api.stat('draw', 'Draws', tally.draw, animate);
        api.stat('o', n.O, tally.O, animate);
      }

      function setStatus(text, who) {
        status.textContent = text;
        status.dataset.who = who || '';
      }

      function resetMatch() {
        tally = { X: 0, O: 0, draw: 0 };
        starter = 'X';
        showTally(false);
        newRound(true);
      }

      function newRound(keepStarter) {
        clearTimeout(aiTimer);
        if (!keepStarter) starter = starter === 'X' ? 'O' : 'X';
        board = Array(9).fill(null);
        turn = starter;
        over = false;
        thinking = false;
        grid.classList.remove('done');
        cellEls.forEach((el) => {
          el.innerHTML = '';
          el.className = 'ttt-cell';
          el.disabled = false;
        });
        next.hidden = true;
        prompt();
        if (vsAI() && turn === 'O') aiTurn();
      }

      function prompt() {
        if (vsAI()) setStatus(turn === 'X' ? 'Your move' : 'Computer is thinking…', turn);
        else setStatus(`Player ${turn} to move`, turn);
      }

      function play(i, byHuman) {
        if (over || board[i] || thinking) return;
        if (byHuman && vsAI() && turn !== 'X') return;
        board[i] = turn;
        cellEls[i].innerHTML = MARK[turn];
        cellEls[i].classList.add('taken', 'is-' + turn.toLowerCase());
        cellEls[i].setAttribute('aria-label', `Square ${i + 1}, ${turn}`);
        const o = outcome(board);
        if (o) return finish(o);
        turn = turn === 'X' ? 'O' : 'X';
        prompt();
        if (vsAI() && turn === 'O') aiTurn();
      }

      function aiTurn() {
        thinking = true;
        aiTimer = setTimeout(() => {
          thinking = false;
          const empty = board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
          const i = Math.random() < MODES[mode].smart
            ? bestMove(board.slice(), 'O')
            : empty[Math.floor(Math.random() * empty.length)];
          play(i, false);
        }, 320 + Math.random() * 260);
      }

      function finish(o) {
        over = true;
        grid.classList.add('done');
        cellEls.forEach((el) => { el.disabled = true; });
        if (o.winner) {
          o.line.forEach((i) => cellEls[i].classList.add('win'));
          tally[o.winner]++;
          const n = names();
          if (vsAI()) setStatus(o.winner === 'X' ? 'You win this round!' : 'The computer wins this one', o.winner);
          else setStatus(`${n[o.winner]} wins!`, o.winner);
        } else {
          tally.draw++;
          setStatus('It’s a draw', '');
        }
        showTally(true);
        next.hidden = false;
      }

      function onKey(e) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (/^[1-9]$/.test(e.key)) play(+e.key - 1, true);
        else if (e.key === 'Enter' && over && !e.target.closest('button')) newRound();
      }
      window.addEventListener('keydown', onKey);

      resetMatch();

      return {
        restart: () => newRound(true),
        destroy() {
          clearTimeout(aiTimer);
          window.removeEventListener('keydown', onKey);
        },
      };
    },
  });
})();
