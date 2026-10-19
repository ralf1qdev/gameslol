(function () {
  'use strict';

  const SIZES = { 3: '3×3', 4: '4×4', 5: '5×5' };

  GL.register({
    id: 'slide',
    name: 'Slide Puzzle',
    category: 'Puzzle',
    hue: 30,
    tagline: 'The classic fifteen puzzle. Put the numbers back in order.',
    howTo: 'Slide tiles into the empty space until the numbers read in order, left to right and top to bottom, with the gap in the bottom-right corner. Click any tile in the same row or column as the gap to slide several at once.',
    controls: [
      ['Click', 'Slide a tile (or a whole row)'],
      ['↑ ↓ ← →', 'Slide a tile into the gap'],
      ['R', 'Shuffle'],
    ],
    scoreLabel: 'Moves',
    lowerIsBetter: true,
    homeVariant: '4',
    bestLabel: 'Fewest moves (4×4)',
    art: `<svg viewBox="0 0 160 100" aria-hidden="true" font-family="Inter,system-ui,sans-serif" font-weight="800" font-size="14" text-anchor="middle"><g fill="#fff"><rect x="44" y="14" width="22" height="22" rx="5"/><rect x="69" y="14" width="22" height="22" rx="5"/><rect x="94" y="14" width="22" height="22" rx="5"/><rect x="44" y="39" width="22" height="22" rx="5"/><rect x="69" y="39" width="22" height="22" rx="5"/><rect x="94" y="39" width="22" height="22" rx="5"/><rect x="44" y="64" width="22" height="22" rx="5"/><rect x="69" y="64" width="22" height="22" rx="5" opacity=".6"/></g><g fill="#c2410c"><text x="55" y="30">1</text><text x="80" y="30">2</text><text x="105" y="30">3</text><text x="55" y="55">4</text><text x="80" y="55">5</text><text x="105" y="55">6</text><text x="55" y="80">7</text><text x="80" y="80">8</text></g></svg>`,

    mount(api) {
      const { h } = GL;
      let n = +GL.store.get('slide:size', 4);
      if (!SIZES[n]) n = 4;

      const board = h('div', { class: 'slide' });
      api.root.append(board);
      api.root.classList.add('no-scroll');
      api.options.append(GL.ui.segmented({
        label: 'Size',
        value: String(n),
        options: Object.entries(SIZES).map(([value, label]) => ({ value, label })),
        onChange: (v) => {
          n = +v;
          GL.store.set('slide:size', n);
          reset();
        },
      }));

      let pos, tiles, empty, moves, startTime, timer, solved;

      function reset() {
        api.setVariant(String(n));
        clearInterval(timer);
        timer = null;
        solved = false;
        moves = 0;
        board.style.setProperty('--n', n);
        board.classList.remove('solved');
        // pos[k] = cell index of tile k (k = 0..n*n-2); start solved, then random-walk the gap
        pos = Array.from({ length: n * n - 1 }, (_, k) => k);
        empty = n * n - 1;
        let last = -1;
        for (let s = 0; s < n * n * 30; s++) {
          const opts = neighbours(empty).filter((c) => c !== last);
          const c = opts[Math.floor(Math.random() * opts.length)];
          const k = pos.indexOf(c);
          pos[k] = empty;
          last = empty;
          empty = c;
        }
        if (isSolved()) return reset();
        tiles = pos.map((_, k) => {
          const el = h('button', { type: 'button', class: 'slide-tile', style: `--h:${20 + (k / (n * n)) * 60}` }, h('span', {}, k + 1));
          el.addEventListener('click', () => clickTile(k));
          return el;
        });
        board.replaceChildren(...tiles);
        api.setScore(0, false);
        api.stat('time', 'Time', '0s', false);
        api.hideOverlay();
        render();
      }

      function neighbours(c) {
        const r = Math.floor(c / n), col = c % n, out = [];
        if (r > 0) out.push(c - n);
        if (r < n - 1) out.push(c + n);
        if (col > 0) out.push(c - 1);
        if (col < n - 1) out.push(c + 1);
        return out;
      }

      const isSolved = () => pos.every((c, k) => c === k);

      function render() {
        tiles.forEach((el, k) => {
          el.style.setProperty('--r', Math.floor(pos[k] / n));
          el.style.setProperty('--c', pos[k] % n);
          el.classList.toggle('home', pos[k] === k);
        });
      }

      // Slides every tile between the gap and cell `c` (same row or column) toward the gap.
      function slideFrom(c) {
        if (solved) return;
        const er = Math.floor(empty / n), ec = empty % n, r = Math.floor(c / n), col = c % n;
        if (er !== r && ec !== col) return;
        if (c === empty) return;
        const step = er === r ? (col > ec ? 1 : -1) : (r > er ? n : -n);
        while (empty !== c) {
          const next = empty + step;
          const k = pos.indexOf(next);
          pos[k] = empty;
          empty = next;
          moves++;
        }
        if (!timer) {
          startTime = performance.now();
          timer = setInterval(() => api.stat('time', 'Time', Math.floor((performance.now() - startTime) / 1000) + 's', false), 250);
        }
        GL.sound.tone(420 + Math.random() * 60, 40, 'triangle', 0.03);
        api.setScore(moves);
        render();
        if (isSolved()) win();
      }

      const clickTile = (k) => slideFrom(pos[k]);

      function win() {
        solved = true;
        clearInterval(timer);
        board.classList.add('solved');
        const secs = Math.floor((performance.now() - startTime) / 1000);
        const record = api.submit(moves);
        setTimeout(() => api.overlay({
          kicker: record ? 'New best' : 'Solved',
          title: `${moves} moves`,
          text: `${SIZES[n]} in ${secs}s.`,
          tone: 'win',
          actions: [{ label: 'Shuffle again', primary: true, onClick: reset }],
        }), 500);
      }

      const off = GL.listen(window, 'keydown', (e) => {
        const d = GL.dirFromKey(e);
        if (!d) return;
        e.preventDefault();
        // the arrow says which way a tile moves, so the source is on the opposite side of the gap
        const r = Math.floor(empty / n), c = empty % n;
        if (d === 'left' && c < n - 1) slideFrom(empty + 1);
        if (d === 'right' && c > 0) slideFrom(empty - 1);
        if (d === 'up' && r < n - 1) slideFrom(empty + n);
        if (d === 'down' && r > 0) slideFrom(empty - n);
      });
      const unswipe = GL.swipe(board, (d) => {
        if (d === 'tap') return;
        const r = Math.floor(empty / n), c = empty % n;
        if (d === 'left' && c < n - 1) slideFrom(empty + 1);
        if (d === 'right' && c > 0) slideFrom(empty - 1);
        if (d === 'up' && r < n - 1) slideFrom(empty + n);
        if (d === 'down' && r > 0) slideFrom(empty - n);
      }, 40);

      reset();
      return {
        restart: reset,
        destroy() {
          clearInterval(timer);
          off();
          unswipe();
        },
      };
    },
  });
})();
