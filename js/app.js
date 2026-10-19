/* GamesLOL shell: routing, home grid, game page and the API each game mounts against. */
(function () {
  'use strict';

  const { h } = GL;
  const root = document.documentElement;
  const app = document.getElementById('app');

  const svg = (body) =>
    `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const ICON = {
    back: svg('<path d="M15 18l-6-6 6-6"/>'),
    arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    restart: svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/>'),
    pause: svg('<path d="M9 5v14M15 5v14"/>'),
    play: svg('<path d="M7 5l12 7-12 7z"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  };

  const CATEGORIES = ['All', 'Arcade', 'Puzzle', 'Strategy', 'Reflex'];
  let filter = 'All';
  let query = '';
  let current = null; // { game, instance, enter }

  /* ---------- theme ---------- */
  const themeBtn = document.getElementById('theme-toggle');
  const effectiveTheme = () => (GL.isDark() ? 'dark' : 'light');
  themeBtn.addEventListener('click', () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    GL.store.set('theme', next);
    GL.invalidateColors();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', GL.invalidateColors);

  /* ---------- routing ---------- */
  function route() {
    const id = location.hash.replace(/^#\/?/, '');
    if (current) {
      current.instance.destroy();
      current = null;
    }
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    const game = GL.games.find((g) => g.id === id);
    if (game) renderGame(game);
    else renderHome();
    window.scrollTo(0, 0);
  }

  /* ---------- home ---------- */
  function card(game, i) {
    const best = game.noScore ? null : GL.getBest(game, game.homeVariant);
    return h('a', { class: 'card', href: '#/' + game.id, style: `--hue:${game.hue};--i:${i}` },
      h('div', { class: 'card-art', html: game.art }),
      h('div', { class: 'card-body' },
        h('div', { class: 'card-head' },
          h('h3', {}, game.name),
          h('span', { class: 'tag' }, game.category)),
        h('p', {}, game.tagline),
        h('div', { class: 'card-foot' },
          h('span', { class: 'card-best' },
            game.noScore
              ? 'vs. computer or a friend'
              : best == null
                ? 'Not played yet'
                : [(game.bestLabel || 'Best') + ' ', h('strong', {}, GL.format(game, best))]),
          h('span', { class: 'card-play', html: 'Play ' + ICON.arrow }))));
  }

  function renderHome() {
    document.title = 'GamesLOL — clean, fast browser games';

    const grid = h('div', { class: 'grid' });
    const empty = h('p', { class: 'empty', hidden: true }, 'No games match that search.');

    const update = () => {
      const q = query.trim().toLowerCase();
      const list = GL.games.filter((g) =>
        (filter === 'All' || g.category === filter) &&
        (!q || (g.name + ' ' + g.tagline + ' ' + g.category).toLowerCase().includes(q)));
      grid.replaceChildren(...list.map(card));
      empty.hidden = list.length > 0;
    };

    const search = h('input', {
      type: 'search', id: 'search', class: 'search-input', placeholder: 'Search games',
      autocomplete: 'off', 'aria-label': 'Search games', value: query,
      oninput: (e) => { query = e.target.value; update(); },
    });

    const chips = h('div', { class: 'chips', role: 'tablist' }, CATEGORIES.map((c) =>
      h('button', {
        type: 'button', class: 'chip', role: 'tab', 'aria-selected': String(c === filter),
        onclick: (e) => {
          filter = c;
          chips.querySelectorAll('.chip').forEach((b) => b.setAttribute('aria-selected', String(b === e.currentTarget)));
          update();
        },
      }, c)));

    const view = h('section', { class: 'view home' },
      h('div', { class: 'hero' },
        h('div', { class: 'eyebrow' }, h('span', { class: 'pulse' }),
          `${GL.games.length} games · no ads · no sign-up`),
        h('h1', {}, 'Play something ', h('span', { class: 'grad' }, 'good'), '.'),
        h('p', { class: 'lede' },
          'A small, carefully made arcade. Every game loads instantly, works with keyboard and touch, and remembers your best scores.')),
      h('div', { class: 'toolbar' },
        h('label', { class: 'search' }, h('span', { class: 'search-icon', html: ICON.search }), search,
          h('kbd', { class: 'search-kbd' }, '/')),
        chips),
      grid,
      empty);

    app.replaceChildren(view);
    update();
  }

  /* ---------- game page ---------- */
  function renderGame(game) {
    document.title = game.name + ' · GamesLOL';

    const overlay = h('div', { class: 'overlay', hidden: true });
    const inner = h('div', { class: 'stage-inner' });
    const stage = h('div', { class: 'stage', style: '--hue:' + game.hue }, inner, overlay);
    const stats = h('div', { class: 'stats' });
    const options = h('div', { class: 'options' });

    /* stats */
    const statEls = {};
    function stat(key, label, value, animate = true) {
      let s = statEls[key];
      if (!s) {
        s = statEls[key] = {
          box: h('div', { class: 'stat' }),
          label: h('span', { class: 'stat-label' }),
          value: h('span', { class: 'stat-value' }),
        };
        s.box.append(s.label, s.value);
        stats.append(s.box);
      }
      s.label.textContent = label;
      const text = String(value);
      if (s.value.textContent === text) return;
      s.value.textContent = text;
      if (animate) {
        s.value.classList.remove('bump');
        void s.value.offsetWidth;
        s.value.classList.add('bump');
      }
    }

    let variant = game.homeVariant;
    let variantLabel = '';
    function refreshBest(celebrate) {
      if (game.noScore) return;
      stat('best', variantLabel ? 'Best · ' + variantLabel : 'Best', GL.format(game, GL.getBest(game, variant)), false);
      statEls.best.box.classList.toggle('is-record', !!celebrate);
    }

    /* overlay */
    let overlayActions = [];
    function showOverlay({ kicker, title, text, actions = [], tone }) {
      overlayActions = actions;
      overlay.className = 'overlay' + (tone ? ' tone-' + tone : '');
      overlay.replaceChildren(h('div', { class: 'overlay-card' },
        kicker ? h('div', { class: 'overlay-kicker' }, kicker) : null,
        title ? h('h2', { class: 'overlay-title' }, title) : null,
        text ? h('p', { class: 'overlay-text' }, text) : null,
        actions.length
          ? h('div', { class: 'overlay-actions' }, actions.map((a) =>
            h('button', { type: 'button', class: 'btn' + (a.primary ? ' btn-primary' : ''), onclick: a.onClick },
              a.label, a.primary ? h('kbd', {}, '↵') : null)))
          : null));
      overlay.hidden = false;
    }
    function hideOverlay() {
      overlay.hidden = true;
      overlayActions = [];
    }

    /* buttons */
    const restartBtn = h('button', {
      type: 'button', class: 'btn btn-primary',
      html: ICON.restart + '<span>New game</span><kbd>R</kbd>',
      onclick: () => current && current.instance.restart(),
    });
    const pauseBtn = game.pausable
      ? h('button', { type: 'button', class: 'btn', onclick: () => current && current.instance.togglePause() })
      : null;
    const setPaused = (paused) => {
      if (pauseBtn) pauseBtn.innerHTML = (paused ? ICON.play : ICON.pause) + `<span>${paused ? 'Resume' : 'Pause'}</span><kbd>P</kbd>`;
    };
    setPaused(false);

    const others = GL.games.filter((g) => g !== game);
    const view = h('section', { class: 'view game-view' },
      h('div', { class: 'game-head' },
        h('a', { class: 'back', href: '#/', html: ICON.back + '<span>All games</span>' }),
        h('div', { class: 'game-title' },
          h('div', { class: 'game-icon', style: '--hue:' + game.hue, html: game.art }),
          h('div', {},
            h('h1', {}, game.name),
            h('p', {}, game.tagline)))),
      h('div', { class: 'game-layout' },
        stage,
        h('aside', { class: 'sidebar' },
          stats,
          h('div', { class: 'actions' }, restartBtn, pauseBtn),
          options,
          h('section', { class: 'panel howto' },
            h('h4', {}, 'How to play'),
            h('p', {}, game.howTo),
            h('ul', { class: 'controls' }, game.controls.map(([keys, desc]) =>
              h('li', {},
                h('span', { class: 'keys' }, keys.split(' ').map((k) => h('kbd', {}, k))),
                h('span', { class: 'desc' }, desc))))))),
      h('div', { class: 'more' },
        h('h4', {}, 'More games'),
        h('div', { class: 'more-row' }, others.map((g) =>
          h('a', { class: 'mini-card', href: '#/' + g.id, style: '--hue:' + g.hue },
            h('span', { class: 'game-icon', html: g.art }),
            h('span', {}, h('strong', {}, g.name), h('small', {}, g.category)))))));

    app.replaceChildren(view);

    const api = {
      root: inner,
      stage,
      options,
      setScore(value, animate) {
        if (game.noScore) return;
        stat('score', game.scoreLabel || 'Score', GL.format(game, value), animate !== false);
      },
      stat,
      best: () => GL.getBest(game, variant),
      setVariant(v, label) {
        variant = v;
        variantLabel = label || '';
        refreshBest();
      },
      submit(score) {
        const isRecord = GL.submitBest(game, score, variant);
        if (isRecord) refreshBest(true);
        return isRecord;
      },
      overlay: showOverlay,
      hideOverlay,
      setPaused,
      format: (v) => GL.format(game, v),
    };

    if (!game.noScore) {
      api.setScore(0, false);
      refreshBest();
    }

    current = {
      game,
      instance: game.mount(api),
      enter() {
        const primary = overlayActions.find((a) => a.primary);
        if (primary && !overlay.hidden) {
          primary.onClick();
          return true;
        }
        return false;
      },
    };
  }

  /* ---------- global keys ---------- */
  const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ']);
  document.addEventListener('keydown', (e) => {
    const typing = e.target.closest && e.target.closest('input, textarea, select');
    if (!current) {
      if (e.key === '/' && !typing) {
        const search = document.getElementById('search');
        if (search) {
          e.preventDefault();
          search.focus();
        }
      }
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (SCROLL_KEYS.has(e.key)) e.preventDefault();

    const key = e.key.toLowerCase();
    if (key === 'r' && !e.repeat) {
      current.instance.restart();
    } else if ((key === 'p' || key === 'escape') && current.instance.togglePause && !e.repeat) {
      current.instance.togglePause();
    } else if (key === 'enter' && !e.target.closest('button, a')) {
      if (current.enter()) e.preventDefault();
    }
  });

  // Mouse clicks shouldn't leave buttons focused, or Space would re-trigger them mid-game.
  document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('button');
    if (btn && e.detail > 0) btn.blur();
  });

  const autoPause = () => current && current.instance.pause && current.instance.pause();
  document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
  window.addEventListener('blur', autoPause);

  window.addEventListener('hashchange', route);
  route();
})();
