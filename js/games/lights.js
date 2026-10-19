(function () {
  'use strict';

  const N = 5;

  GL.register({
    id: 'lights',
    name: 'Lights Out',
    category: 'Puzzle',
    hue: 52,
    tagline: 'Every switch flips its neighbours. Turn them all off.',
    howTo: 'Clicking a light toggles it and the four lights next to it. Switch every light off to clear the level. Each level starts with more lights scrambled. Finishing within par earns a star.',
    controls: [
      ['Click', 'Toggle a light and its neighbours'],
      ['↑ ↓ ← →', 'Move the cursor'],
      ['Space', 'Toggle at the cursor'],
      ['R', 'Restart from level 1'],
    ],
    scoreLabel: 'Level',
    bestLabel: 'Best level',
    art: `<svg viewBox="0 0 160 100" aria-hidden="true"><g fill="#fff"><rect x="50" y="20" width="16" height="16" rx="4" opacity=".35"/><rect x="72" y="20" width="16" height="16" rx="4"/><rect x="94" y="20" width="16" height="16" rx="4" opacity=".35"/><rect x="50" y="42" width="16" height="16" rx="4"/><rect x="72" y="42" width="16" height="16" rx="4"/><rect x="94" y="42" width="16" height="16" rx="4"/><rect x="50" y="64" width="16" height="16" rx="4" opacity=".35"/><rect x="72" y="64" width="16" height="16" rx="4"/><rect x="94" y="64" width="16" height="16" rx="4" opacity=".35"/></g></svg>`,

    mount(api) {
      const { h } = GL;
      const board = h('div', { class: 'lights' });
      api.root.append(board);

      const cells = Array.from({ length: N * N }, (_, i) => {
        const el = h('button', { type: 'button', class: 'light', 'aria-label': `Light ${i + 1}` });
        el.addEventListener('click', () => press(i, true));
        return el;
      });
      board.append(...cells);

      let lights, level, moves, par, cursor = 12, stars, locked;

      function toggleAt(i) {
        const r = Math.floor(i / N), c = i % N;
        const flip = (k) => { lights[k] = !lights[k]; };
        flip(i);
        if (r > 0) flip(i - N);
        if (r < N - 1) flip(i + N);
        if (c > 0) flip(i - 1);
        if (c < N - 1) flip(i + 1);
      }

      function startLevel() {
        lights = Array(N * N).fill(false);
        // scramble with distinct random presses so the puzzle is always solvable within `par`
        par = Math.min(3 + level, 15);
        const presses = [...Array(N * N).keys()].sort(() => Math.random() - 0.5).slice(0, par);
        presses.forEach(toggleAt);
        if (!lights.some(Boolean)) return startLevel();
        moves = 0;
        locked = false;
        board.classList.remove('cleared');
        api.setScore(level, level > 1);
        api.stat('moves', 'Moves', `0 / par ${par}`, false);
        api.stat('stars', 'Stars', stars, false);
        render();
      }

      function reset() {
        level = 1;
        stars = 0;
        api.hideOverlay();
        startLevel();
      }

      function press(i, fromClick) {
        if (locked) return;
        cursor = i;
        toggleAt(i);
        moves++;
        GL.sound.tone(lights[i] ? 700 : 500, 45, 'sine', 0.03);
        api.stat('moves', 'Moves', `${moves} / par ${par}`, false);
        render(fromClick ? null : i);
        if (!lights.some(Boolean)) cleared();
      }

      function cleared() {
        locked = true;
        board.classList.add('cleared');
        const star = moves <= par;
        if (star) stars++;
        api.submit(level);
        api.stat('stars', 'Stars', stars);
        GL.sound.tone(880, 90, 'triangle', 0.04);
        setTimeout(() => GL.sound.tone(1175, 120, 'triangle', 0.04), 100);
        setTimeout(() => api.overlay({
          kicker: star ? '★ Within par' : 'Level clear',
          title: `Level ${level} done`,
          text: `${moves} moves (par ${par}).`,
          tone: 'win',
          actions: [{
            label: 'Next level', primary: true, onClick: () => {
              level++;
              api.hideOverlay();
              startLevel();
            },
          }],
        }), 500);
      }

      function render() {
        cells.forEach((el, i) => {
          el.classList.toggle('on', lights[i]);
          el.classList.toggle('cursor', i === cursor && board.classList.contains('kbd'));
          el.setAttribute('aria-pressed', String(lights[i]));
        });
      }

      const off = GL.listen(window, 'keydown', (e) => {
        const d = GL.dirFromKey(e);
        if (d) {
          e.preventDefault();
          board.classList.add('kbd');
          const r = Math.floor(cursor / N), c = cursor % N;
          if (d === 'up') cursor = ((r + N - 1) % N) * N + c;
          if (d === 'down') cursor = ((r + 1) % N) * N + c;
          if (d === 'left') cursor = r * N + ((c + N - 1) % N);
          if (d === 'right') cursor = r * N + ((c + 1) % N);
          render();
        } else if (e.key === ' ' && !e.repeat) {
          e.preventDefault();
          board.classList.add('kbd');
          press(cursor);
        }
      });

      reset();
      return { restart: reset, destroy: off };
    },
  });
})();
