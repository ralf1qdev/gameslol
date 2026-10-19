(function () {
  'use strict';

  const HOLES = 9;
  const ROUND_MS = 30000;
  const KEYMAP = { 7: 0, 8: 1, 9: 2, 4: 3, 5: 4, 6: 5, 1: 6, 2: 7, 3: 8 };

  GL.register({
    id: 'whack',
    name: 'Whack-a-Mole',
    category: 'Reflex',
    hue: 36,
    tagline: 'Thirty seconds. Bop every mole. Never bop a bomb.',
    howTo: 'Moles pop out of the holes — hit them before they duck back down. Golden moles are worth 3 points, bombs cost you 5. The pace picks up as the clock runs down.',
    controls: [
      ['Click', 'Whack'],
      ['1-9', 'Whack using the number pad layout'],
      ['Space', 'Start'],
    ],
    art: `<svg viewBox="0 0 160 100" aria-hidden="true"><ellipse cx="80" cy="80" rx="40" ry="10" fill="#fff" opacity=".35"/><path d="M58 80V56a22 22 0 0 1 44 0v24z" fill="#fff"/><circle cx="72" cy="56" r="3" fill="#7c2d12"/><circle cx="88" cy="56" r="3" fill="#7c2d12"/><ellipse cx="80" cy="64" rx="6" ry="4" fill="#fb7185"/><rect x="106" y="10" width="12" height="40" rx="4" fill="#fff" opacity=".7" transform="rotate(35 112 30)"/><rect x="96" y="6" width="30" height="16" rx="5" fill="#fff" transform="rotate(35 112 14)"/></svg>`,

    mount(api) {
      const { h } = GL;
      const holes = Array.from({ length: HOLES }, (_, i) => {
        const mole = h('span', { class: 'mole' });
        const el = h('button', { type: 'button', class: 'hole', 'aria-label': `Hole ${i + 1}` }, h('span', { class: 'hole-mask' }, mole));
        el.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          whack(i);
        });
        return { el, mole, kind: null, until: 0 };
      });
      const field = h('div', { class: 'whack' }, holes.map((x) => x.el));
      const bar = h('div', { class: 'whack-bar' }, h('span'));
      api.root.append(h('div', { class: 'whack-wrap' }, bar, field));

      let score, state, endsAt, nextAt, raf, startBest;

      function reset() {
        cancelAnimationFrame(raf);
        score = 0;
        state = 'ready';
        startBest = api.best() || 0;
        holes.forEach(hide);
        api.setScore(0, false);
        api.stat('time', 'Time', '30s', false);
        bar.firstChild.style.transform = 'scaleX(1)';
        api.overlay({
          kicker: 'Whack-a-Mole',
          title: '30 seconds on the clock',
          text: 'Hit moles, avoid bombs. Golden moles are worth triple.',
          actions: [{ label: 'Start', primary: true, onClick: start }],
        });
      }

      function start() {
        if (state !== 'ready') return;
        api.hideOverlay();
        state = 'running';
        endsAt = performance.now() + ROUND_MS;
        nextAt = 0;
        raf = requestAnimationFrame(tick);
      }

      function hide(hole) {
        hole.kind = null;
        hole.el.classList.remove('up', 'hit', 'gold', 'bomb');
      }

      function tick(now) {
        const left = Math.max(0, endsAt - now);
        const progress = 1 - left / ROUND_MS;
        bar.firstChild.style.transform = `scaleX(${left / ROUND_MS})`;
        api.stat('time', 'Time', Math.ceil(left / 1000) + 's', false);

        for (const hole of holes) if (hole.kind && now > hole.until) hide(hole);

        if (now >= nextAt) {
          const free = holes.filter((x) => !x.kind);
          const pops = progress > 0.6 && Math.random() < 0.35 ? 2 : 1;
          for (let k = 0; k < pops && free.length; k++) {
            const hole = free.splice(Math.floor(Math.random() * free.length), 1)[0];
            const r = Math.random();
            hole.kind = r < 0.1 ? 'gold' : r < 0.24 ? 'bomb' : 'mole';
            hole.until = now + (1100 - progress * 550) * (hole.kind === 'gold' ? 0.75 : 1);
            hole.el.classList.remove('hit');
            hole.el.classList.toggle('gold', hole.kind === 'gold');
            hole.el.classList.toggle('bomb', hole.kind === 'bomb');
            hole.el.classList.add('up');
          }
          nextAt = now + (750 - progress * 420) * (0.6 + Math.random() * 0.6);
        }

        if (left <= 0) return finish();
        raf = requestAnimationFrame(tick);
      }

      function whack(i) {
        if (state === 'ready') return;
        const hole = holes[i];
        if (state !== 'running' || !hole.kind || hole.el.classList.contains('hit')) return;
        const pts = hole.kind === 'gold' ? 3 : hole.kind === 'bomb' ? -5 : 1;
        score = Math.max(0, score + pts);
        api.setScore(score);
        api.submit(score);
        GL.sound.tone(hole.kind === 'bomb' ? 110 : hole.kind === 'gold' ? 1046 : 660, hole.kind === 'bomb' ? 260 : 70, hole.kind === 'bomb' ? 'sawtooth' : 'square', 0.04);
        hole.el.classList.add('hit');
        const pop = h('span', { class: 'whack-pop' + (pts < 0 ? ' neg' : '') }, (pts > 0 ? '+' : '') + pts);
        hole.el.append(pop);
        setTimeout(() => pop.remove(), 700);
        if (hole.kind === 'bomb') {
          field.classList.remove('boom');
          void field.offsetWidth;
          field.classList.add('boom');
        }
        hole.until = performance.now() + 160;
      }

      function finish() {
        state = 'over';
        holes.forEach(hide);
        const record = score > startBest;
        api.overlay({
          kicker: record ? 'New personal best' : 'Time’s up',
          title: `${score} ${score === 1 ? 'point' : 'points'}`,
          text: record ? 'Mole menace.' : `Your best is ${api.best() ?? 0}.`,
          tone: record ? 'win' : 'lose',
          actions: [{ label: 'Play again', primary: true, onClick: () => { reset(); start(); } }],
        });
      }

      const off = GL.listen(window, 'keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
        if (e.key === ' ' && state === 'ready') return start();
        if (KEYMAP[e.key] !== undefined) whack(KEYMAP[e.key]);
      });

      reset();
      return {
        restart: reset,
        destroy() {
          cancelAnimationFrame(raf);
          off();
        },
      };
    },
  });
})();
