(function () {
  'use strict';

  const LEVELS = {
    easy: { label: 'Easy', clues: 40 },
    medium: { label: 'Medium', clues: 32 },
    hard: { label: 'Hard', clues: 26 },
  };

  /* ---------- solver / generator ---------- */
  const ROW = (i) => Math.floor(i / 9);
  const COL = (i) => i % 9;
  const PEERS = Array.from({ length: 81 }, (_, i) => {
    const r = ROW(i), c = COL(i), br = r - (r % 3), bc = c - (c % 3);
    const set = new Set();
    for (let k = 0; k < 9; k++) {
      set.add(r * 9 + k);
      set.add(k * 9 + c);
      set.add((br + Math.floor(k / 3)) * 9 + bc + (k % 3));
    }
    set.delete(i);
    return [...set];
  });

  function candidates(g, i) {
    let used = 0;
    for (const p of PEERS[i]) used |= 1 << g[p];
    return ~used & 0x3fe; // bits 1..9
  }
  const bits = (m) => { let n = 0; while (m) { m &= m - 1; n++; } return n; };

  // Returns the number of solutions (stops counting at `limit`). Fills g with a solution when `randomFill` is set.
  function search(g, limit, randomFill) {
    let best = -1, bestMask = 0, bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const m = candidates(g, i);
      const n = bits(m);
      if (!n) return 0;
      if (n < bestCount) {
        best = i;
        bestMask = m;
        bestCount = n;
        if (n === 1) break;
      }
    }
    if (best < 0) return 1;
    const digits = [];
    for (let d = 1; d <= 9; d++) if (bestMask & (1 << d)) digits.push(d);
    if (randomFill) digits.sort(() => Math.random() - 0.5);
    let total = 0;
    for (const d of digits) {
      g[best] = d;
      total += search(g, limit - total, randomFill);
      if (total >= limit) {
        if (!randomFill) g[best] = 0;
        return total;
      }
    }
    g[best] = 0;
    return total;
  }

  function generate(clues) {
    const solution = Array(81).fill(0);
    search(solution, 1, true);
    const puzzle = solution.slice();
    const order = [...Array(81).keys()].sort(() => Math.random() - 0.5);
    let filled = 81;
    for (const i of order) {
      if (filled <= clues) break;
      const v = puzzle[i];
      puzzle[i] = 0;
      if (search(puzzle.slice(), 2, false) !== 1) puzzle[i] = v;
      else filled--;
    }
    return { puzzle, solution };
  }

  GL.register({
    id: 'sudoku',
    name: 'Sudoku',
    category: 'Puzzle',
    hue: 210,
    tagline: 'Nine boxes, nine digits, one unique solution.',
    howTo: 'Fill the grid so every row, column and 3×3 box contains the digits 1 to 9 exactly once. Every puzzle has exactly one solution. Use notes to pencil in candidates.',
    controls: [
      ['1-9', 'Enter a digit'],
      ['↑ ↓ ← →', 'Move around the grid'],
      ['⌫', 'Erase'],
      ['N', 'Toggle notes'],
      ['H', 'Hint (reveals a cell)'],
    ],
    scoreLabel: 'Time',
    lowerIsBetter: true,
    homeVariant: 'easy',
    bestLabel: 'Best (Easy)',
    format: (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
    art: `<svg viewBox="0 0 160 100" aria-hidden="true" font-family="JetBrains Mono,monospace" font-weight="700" text-anchor="middle"><rect x="44" y="14" width="72" height="72" rx="8" fill="#fff" opacity=".95"/><path d="M68 14v72M92 14v72M44 38h72M44 62h72" stroke="#3b82f6" stroke-width="2" opacity=".35"/><g font-size="15" fill="#1e3a8a"><text x="56" y="32">5</text><text x="104" y="32">3</text><text x="80" y="56">7</text><text x="56" y="80">9</text></g><text x="104" y="80" font-size="15" fill="#3b82f6">1</text></svg>`,

    mount(api) {
      const { h } = GL;
      let level = GL.store.get('sudoku:level', 'easy');
      if (!LEVELS[level]) level = 'easy';

      const grid = h('div', { class: 'sudoku', role: 'grid' });
      const pad = h('div', { class: 'sudoku-pad' });
      api.root.append(h('div', { class: 'sudoku-wrap' }, grid, pad));

      const notesBtn = h('button', { type: 'button', class: 'btn btn-block', 'aria-pressed': 'false', onclick: () => setNotes(!notesMode) });
      api.options.append(
        GL.ui.segmented({
          label: 'Difficulty',
          value: level,
          options: Object.entries(LEVELS).map(([value, L]) => ({ value, label: L.label })),
          onChange: (v) => {
            level = v;
            GL.store.set('sudoku:level', v);
            reset();
          },
        }),
        notesBtn,
        h('button', { type: 'button', class: 'btn btn-block', onclick: () => hint(), html: 'Hint <kbd>H</kbd>' }));

      const cells = Array.from({ length: 81 }, (_, i) => {
        const el = h('button', { type: 'button', class: 'su-cell', 'data-i': i });
        if (COL(i) % 3 === 2 && COL(i) < 8) el.classList.add('bx');
        if (ROW(i) % 3 === 2 && ROW(i) < 8) el.classList.add('by');
        el.addEventListener('click', () => select(i));
        return el;
      });
      grid.append(...cells);
      for (let d = 1; d <= 9; d++) pad.append(h('button', { type: 'button', class: 'su-key', onclick: () => input(d) }, d));
      pad.append(h('button', { type: 'button', class: 'su-key su-erase', 'aria-label': 'Erase', onclick: () => input(0) }, '⌫'));

      let puzzle, solution, values, notes, given, selected, notesMode = false, mistakes, hints, startTime, timer, done;

      function setNotes(on) {
        notesMode = on;
        notesBtn.setAttribute('aria-pressed', String(on));
        notesBtn.innerHTML = `Notes: ${on ? 'On' : 'Off'} <kbd>N</kbd>`;
        pad.classList.toggle('notes', on);
      }
      setNotes(false);

      function reset() {
        api.setVariant(level);
        clearInterval(timer);
        timer = null;
        done = false;
        ({ puzzle, solution } = generate(LEVELS[level].clues));
        values = puzzle.slice();
        given = puzzle.map(Boolean);
        notes = Array.from({ length: 81 }, () => new Set());
        mistakes = 0;
        hints = 0;
        selected = values.findIndex((v) => !v);
        api.setScore(0, false);
        api.stat('mistakes', 'Mistakes', 0, false);
        api.hideOverlay();
        grid.classList.remove('solved');
        cells.forEach((el) => el.classList.remove('hinted', 'shake'));
        render();
      }

      function startTimer() {
        if (timer || done) return;
        startTime = performance.now();
        timer = setInterval(() => api.setScore(Math.floor((performance.now() - startTime) / 1000), false), 500);
      }

      function select(i) {
        selected = i;
        render();
      }

      function input(d) {
        if (done || selected < 0 || given[selected]) return;
        startTimer();
        const i = selected;
        if (d === 0) {
          values[i] = 0;
          notes[i].clear();
        } else if (notesMode) {
          if (values[i]) return;
          notes[i].has(d) ? notes[i].delete(d) : notes[i].add(d);
        } else {
          if (values[i] === d) return;
          values[i] = d;
          notes[i].clear();
          if (d !== solution[i]) {
            mistakes++;
            api.stat('mistakes', 'Mistakes', mistakes);
            cells[i].classList.remove('shake');
            void cells[i].offsetWidth;
            cells[i].classList.add('shake');
          } else {
            for (const p of PEERS[i]) notes[p].delete(d);
          }
        }
        render();
        if (values.every((v, k) => v === solution[k])) win();
      }

      function hint() {
        if (done) return;
        let i = selected >= 0 && values[selected] !== solution[selected] ? selected : -1;
        if (i < 0) {
          const open = values.map((v, k) => (v !== solution[k] ? k : -1)).filter((k) => k >= 0);
          if (!open.length) return;
          i = open[Math.floor(Math.random() * open.length)];
        }
        startTimer();
        hints++;
        values[i] = solution[i];
        given[i] = true;
        notes[i].clear();
        for (const p of PEERS[i]) notes[p].delete(solution[i]);
        selected = i;
        cells[i].classList.add('hinted');
        render();
        if (values.every((v, k) => v === solution[k])) win();
      }

      function win() {
        done = true;
        clearInterval(timer);
        const secs = Math.max(1, Math.floor((performance.now() - (startTime || performance.now())) / 1000));
        api.setScore(secs, false);
        grid.classList.add('solved');
        // hints and mistakes don't count toward best times
        const clean = !hints && !mistakes;
        const record = clean && api.submit(secs);
        setTimeout(() => api.overlay({
          kicker: record ? 'New best time' : 'Solved',
          title: api.format(secs),
          text: clean
            ? `${LEVELS[level].label} puzzle, flawless.`
            : `${mistakes} mistake${mistakes === 1 ? '' : 's'}, ${hints} hint${hints === 1 ? '' : 's'} — only flawless solves count toward your best.`,
          tone: 'win',
          actions: [{ label: 'New puzzle', primary: true, onClick: reset }],
        }), 700);
      }

      function render() {
        const sv = selected >= 0 ? values[selected] : 0;
        const peers = selected >= 0 ? new Set(PEERS[selected]) : new Set();
        const counts = Array(10).fill(0);
        values.forEach((v, k) => { if (v === solution[k]) counts[v]++; });
        cells.forEach((el, i) => {
          const v = values[i];
          el.classList.toggle('given', given[i]);
          el.classList.toggle('sel', i === selected);
          el.classList.toggle('peer', peers.has(i));
          el.classList.toggle('same', !!sv && v === sv && i !== selected);
          el.classList.toggle('wrong', !!v && v !== solution[i]);
          if (v) {
            el.textContent = v;
          } else if (notes[i].size) {
            el.innerHTML = '<span class="su-notes">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => `<i>${notes[i].has(d) ? d : ''}</i>`).join('') + '</span>';
          } else {
            el.textContent = '';
          }
        });
        [...pad.children].forEach((b, k) => {
          if (k < 9) b.classList.toggle('complete', counts[k + 1] >= 9);
        });
      }

      const off = GL.listen(window, 'keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key.toLowerCase();
        if (/^[1-9]$/.test(k)) input(+k);
        else if (k === 'backspace' || k === 'delete' || k === '0') input(0);
        else if (k === 'n') setNotes(!notesMode);
        else if (k === 'h') hint();
        else {
          const d = GL.dirFromKey(e);
          if (!d || selected < 0) return;
          e.preventDefault();
          let r = ROW(selected), c = COL(selected);
          if (d === 'up') r = (r + 8) % 9;
          if (d === 'down') r = (r + 1) % 9;
          if (d === 'left') c = (c + 8) % 9;
          if (d === 'right') c = (c + 1) % 9;
          select(r * 9 + c);
        }
      });

      reset();
      return {
        restart: reset,
        destroy() {
          clearInterval(timer);
          off();
        },
      };
    },
  });
})();
