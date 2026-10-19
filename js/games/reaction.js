(function () {
  'use strict';

  const ROUNDS = 5;

  GL.register({
    id: 'reaction',
    name: 'Reaction',
    category: 'Reflex',
    hue: 150,
    tagline: 'Wait for green. Then click faster than you think you can.',
    howTo: 'Click to begin, then wait for the panel to turn green — and click the instant it does. Five attempts are averaged into your score. Clicking too early costs you that attempt.',
    controls: [
      ['Click', 'Start / react'],
      ['Space', 'Start / react'],
    ],
    scoreLabel: 'Average',
    lowerIsBetter: true,
    format: (ms) => Math.round(ms) + ' ms',
    art: `<svg viewBox="0 0 160 100" aria-hidden="true"><circle cx="80" cy="54" r="30" fill="none" stroke="#fff" stroke-width="6"/><path d="M80 54V36" stroke="#fff" stroke-width="6" stroke-linecap="round"/><path d="M72 16h16" stroke="#fff" stroke-width="6" stroke-linecap="round"/><path d="M108 26l6-6" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".7"/></svg>`,

    mount(api) {
      const { h } = GL;
      const panel = h('button', { type: 'button', class: 'rx-panel' });
      const dots = h('div', { class: 'rx-dots' });
      api.root.append(h('div', { class: 'rx-wrap' }, panel, dots));
      panel.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        act();
      });

      let state, times, goAt, timer;

      function show(cls, title, sub) {
        panel.className = 'rx-panel ' + cls;
        panel.innerHTML = `<strong>${title}</strong>${sub ? `<span>${sub}</span>` : ''}`;
      }

      function paintDots() {
        dots.replaceChildren(...Array.from({ length: ROUNDS }, (_, i) =>
          h('span', { class: 'rx-dot' + (i < times.length ? ' done' : '') }, i < times.length ? Math.round(times[i]) : '')));
      }

      function reset() {
        clearTimeout(timer);
        state = 'idle';
        times = [];
        api.setScore(null, false);
        api.stat('last', 'Last', '—', false);
        api.hideOverlay();
        paintDots();
        show('idle', 'Click to start', 'Wait for green, then click as fast as you can.');
      }

      function arm() {
        state = 'waiting';
        show('wait', 'Wait for green…', '');
        timer = setTimeout(() => {
          state = 'go';
          goAt = performance.now();
          show('go', 'Click!', '');
        }, 1200 + Math.random() * 2800);
      }

      function act() {
        if (state === 'idle' || state === 'result' || state === 'early') return arm();
        if (state === 'waiting') {
          clearTimeout(timer);
          state = 'early';
          GL.sound.tone(150, 200, 'square', 0.04);
          return show('early', 'Too soon!', 'Click to try that one again.');
        }
        if (state === 'go') {
          const t = performance.now() - goAt;
          times.push(t);
          paintDots();
          api.stat('last', 'Last', Math.round(t) + ' ms');
          GL.sound.tone(880, 60, 'sine', 0.04);
          if (times.length < ROUNDS) {
            state = 'result';
            show('result', Math.round(t) + ' ms', `${ROUNDS - times.length} to go — click to continue.`);
          } else {
            finish();
          }
        }
      }

      function finish() {
        state = 'done';
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        api.setScore(avg);
        const record = api.submit(avg);
        const verdict = avg < 200 ? 'Lightning reflexes.' : avg < 260 ? 'Sharp — faster than most.' : avg < 330 ? 'Solid, about average.' : 'Warm up and try again.';
        show('result', Math.round(avg) + ' ms', 'average');
        api.overlay({
          kicker: record ? 'New best average' : 'Your average',
          title: Math.round(avg) + ' ms',
          text: `${verdict} Best single: ${Math.round(Math.min(...times))} ms.`,
          tone: record ? 'win' : undefined,
          actions: [{ label: 'Go again', primary: true, onClick: reset }],
        });
      }

      const off = GL.listen(window, 'keydown', (e) => {
        if (e.key === ' ' && !e.repeat && state !== 'done') {
          e.preventDefault();
          act();
        }
      });

      reset();
      return {
        restart: reset,
        destroy() {
          clearTimeout(timer);
          off();
        },
      };
    },
  });
})();
