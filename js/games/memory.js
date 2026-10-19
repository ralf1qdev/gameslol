(function () {
  'use strict';

  const ICONS = ['🍉', '🚀', '🎸', '🦊', '🌵', '🍩', '🎲', '🐙', '⚡', '🌈', '🍄', '🦄', '🎈', '🐢', '🍋', '🔮', '🌙', '🐝', '🧩', '🍒'];
  const LEVELS = {
    easy: { label: 'Easy', cols: 4, pairs: 8 },
    medium: { label: 'Medium', cols: 5, pairs: 10 },
    hard: { label: 'Hard', cols: 6, pairs: 18 },
  };

  GL.register({
    id: 'memory',
    name: 'Memory',
    category: 'Puzzle',
    hue: 160,
    tagline: 'Flip two cards, find the pairs, train your brain.',
    howTo: 'Flip two cards at a time. Matching pairs stay face up; anything else flips back. Clear the board in as few moves as you can.',
    controls: [
      ['Click', 'Flip a card'],
      ['Tab Enter', 'Flip with the keyboard'],
      ['R', 'Shuffle a new board'],
    ],
    scoreLabel: 'Moves',
    lowerIsBetter: true,
    homeVariant: 'easy',
    bestLabel: 'Fewest moves (Easy)',
    art: `<svg viewBox="0 0 160 100" aria-hidden="true"><rect x="34" y="18" width="40" height="56" rx="8" fill="#fff" transform="rotate(-8 54 46)"/><rect x="86" y="24" width="40" height="56" rx="8" fill="#fff" opacity=".45" transform="rotate(8 106 52)"/><text x="54" y="56" font-size="24" text-anchor="middle" transform="rotate(-8 54 46)">🦊</text></svg>`,

    mount(api) {
      const { h } = GL;
      let level = GL.store.get('memory:level', 'easy');
      if (!LEVELS[level]) level = 'easy';

      const board = h('div', { class: 'memory' });
      api.root.append(board);
      api.options.append(GL.ui.segmented({
        label: 'Board size',
        value: level,
        options: Object.entries(LEVELS).map(([value, L]) => ({ value, label: `${L.label}` })),
        onChange: (v) => {
          level = v;
          GL.store.set('memory:level', v);
          reset();
        },
      }));

      let cards, open, moves, matched, lock, startTime, timer;

      function reset() {
        const L = LEVELS[level];
        api.setVariant(level);
        clearInterval(timer);
        timer = null;
        const pick = ICONS.slice().sort(() => Math.random() - 0.5).slice(0, L.pairs);
        const deck = pick.concat(pick).sort(() => Math.random() - 0.5);
        open = [];
        moves = 0;
        matched = 0;
        lock = false;
        board.style.setProperty('--cols', L.cols);
        cards = deck.map((icon, i) => {
          const el = h('button', { type: 'button', class: 'mem-card', 'aria-label': 'Hidden card', style: `--i:${i}` },
            h('span', { class: 'mem-inner' },
              h('span', { class: 'mem-face mem-back' }),
              h('span', { class: 'mem-face mem-front' }, icon)));
          const card = { icon, el, up: false, done: false };
          el.addEventListener('click', () => flip(card));
          return card;
        });
        board.replaceChildren(...cards.map((c) => c.el));
        api.setScore(0, false);
        api.stat('pairs', 'Pairs', `0/${L.pairs}`, false);
        api.stat('time', 'Time', '0s', false);
        api.hideOverlay();
      }

      function flip(card) {
        if (lock || card.up || card.done) return;
        if (!timer) {
          startTime = performance.now();
          timer = setInterval(() => api.stat('time', 'Time', Math.floor((performance.now() - startTime) / 1000) + 's', false), 250);
        }
        card.up = true;
        card.el.classList.add('up');
        card.el.setAttribute('aria-label', card.icon);
        GL.sound.tone(660, 40, 'sine', 0.03);
        open.push(card);
        if (open.length < 2) return;

        moves++;
        api.setScore(moves);
        const [a, b] = open;
        open = [];
        if (a.icon === b.icon) {
          a.done = b.done = true;
          matched++;
          setTimeout(() => {
            a.el.classList.add('done');
            b.el.classList.add('done');
          }, 250);
          GL.sound.tone(880, 90, 'triangle', 0.04);
          const L = LEVELS[level];
          api.stat('pairs', 'Pairs', `${matched}/${L.pairs}`);
          if (matched === L.pairs) win();
        } else {
          lock = true;
          setTimeout(() => {
            for (const c of [a, b]) {
              c.up = false;
              c.el.classList.remove('up');
              c.el.setAttribute('aria-label', 'Hidden card');
            }
            lock = false;
          }, 750);
        }
      }

      function win() {
        clearInterval(timer);
        const secs = Math.floor((performance.now() - startTime) / 1000);
        const record = api.submit(moves);
        const L = LEVELS[level];
        const perfect = moves === L.pairs;
        setTimeout(() => api.overlay({
          kicker: record ? 'New best' : perfect ? 'Perfect memory' : 'All pairs found',
          title: `${moves} moves`,
          text: `${L.label} board in ${secs}s.${perfect ? ' Not a single miss!' : ''}`,
          tone: 'win',
          actions: [{ label: 'Play again', primary: true, onClick: reset }],
        }), 600);
      }

      reset();
      return {
        restart: reset,
        destroy() { clearInterval(timer); },
      };
    },
  });
})();
