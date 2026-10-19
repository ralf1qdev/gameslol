(function () {
  'use strict';

  const PADS = [
    { name: 'green', freq: 415, key: 'q' },
    { name: 'red', freq: 311, key: 'w' },
    { name: 'yellow', freq: 252, key: 'a' },
    { name: 'blue', freq: 209, key: 's' },
  ];

  GL.register({
    id: 'echo',
    name: 'Echo',
    category: 'Reflex',
    hue: 120,
    tagline: 'Watch the pattern, play it back, one more each round.',
    howTo: 'The pads light up in a sequence. Repeat it in the same order. Every round adds one more step and plays a little faster. One wrong press ends the game.',
    controls: [
      ['Click', 'Press a pad'],
      ['Q W A S', 'Pads (matching the layout)'],
      ['1-4', 'Pads in order'],
      ['Space', 'Start'],
    ],
    scoreLabel: 'Round',
    art: `<svg viewBox="0 0 160 100" aria-hidden="true"><g transform="translate(80 50)"><path d="M-4-4V-40A36 36 0 0 0-40-4z" fill="#fff"/><path d="M4-4V-40A36 36 0 0 1 40-4z" fill="#fff" opacity=".55"/><path d="M-4 4V40A36 36 0 0 1-40 4z" fill="#fff" opacity=".55"/><path d="M4 4V40A36 36 0 0 0 40 4z" fill="#fff" opacity=".55"/><circle r="13" fill="#fff" opacity=".3"/></g></svg>`,

    mount(api) {
      const { h } = GL;
      const center = h('button', { type: 'button', class: 'echo-center', onclick: () => state === 'idle' && start() });
      const pads = PADS.map((p, i) => h('button', { type: 'button', class: 'echo-pad ' + p.name, 'aria-label': `${p.name} pad`, onpointerdown: (e) => { e.preventDefault(); press(i); } }));
      const ring = h('div', { class: 'echo' }, pads, center);
      api.root.append(ring);

      const soundBtn = h('button', { type: 'button', class: 'btn btn-block', onclick: () => { GL.sound.on = !GL.sound.on; paintSound(); } });
      const paintSound = () => { soundBtn.textContent = `Sound: ${GL.sound.on ? 'On' : 'Off'}`; };
      paintSound();
      api.options.append(soundBtn);

      let seq, step, state, timers = [], startBest;

      const later = (fn, ms) => timers.push(setTimeout(fn, ms));
      const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

      function centerText(main, sub) {
        center.innerHTML = `<strong>${main}</strong>${sub ? `<small>${sub}</small>` : ''}`;
      }

      function reset() {
        clearTimers();
        seq = [];
        step = 0;
        state = 'idle';
        startBest = api.best() || 0;
        ring.classList.remove('fail', 'listen');
        pads.forEach((p) => p.classList.remove('lit'));
        api.setScore(0, false);
        api.hideOverlay();
        centerText('Start', 'or press Space');
      }

      function start() {
        reset();
        nextRound();
      }

      function light(i, ms) {
        pads[i].classList.add('lit');
        GL.sound.tone(PADS[i].freq, ms, 'triangle', 0.1);
        later(() => pads[i].classList.remove('lit'), ms);
      }

      function nextRound() {
        seq.push(Math.floor(Math.random() * 4));
        step = 0;
        state = 'showing';
        ring.classList.remove('listen');
        centerText(seq.length, 'watch');
        const gap = Math.max(220, 620 - seq.length * 24);
        seq.forEach((p, k) => later(() => light(p, gap * 0.7), 600 + k * gap));
        later(() => {
          state = 'input';
          ring.classList.add('listen');
          centerText(seq.length, 'your turn');
        }, 600 + seq.length * gap);
      }

      function press(i) {
        if (state !== 'input') return;
        if (i !== seq[step]) return fail(i);
        light(i, 220);
        step++;
        if (step === seq.length) {
          state = 'showing';
          api.setScore(seq.length);
          api.submit(seq.length);
          centerText('✓', 'nice');
          later(nextRound, 800);
        }
      }

      function fail(i) {
        state = 'over';
        pads[i].classList.add('lit');
        later(() => pads[i].classList.remove('lit'), 400);
        ring.classList.add('fail');
        ring.classList.remove('listen');
        GL.sound.tone(90, 600, 'sawtooth', 0.08);
        const score = seq.length - 1;
        const record = score > startBest;
        centerText('✕', 'oops');
        later(() => api.overlay({
          kicker: record ? 'New personal best' : 'Wrong pad',
          title: `${score} ${score === 1 ? 'round' : 'rounds'}`,
          text: `The next pad was ${PADS[seq[step]].name}.`,
          tone: record ? 'win' : 'lose',
          actions: [{ label: 'Try again', primary: true, onClick: start }],
        }), 700);
      }

      const off = GL.listen(window, 'keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
        const k = e.key.toLowerCase();
        if (k === ' ' && state === 'idle') return start();
        let i = PADS.findIndex((p) => p.key === k);
        if (i < 0 && /^[1-4]$/.test(k)) i = +k - 1;
        if (i >= 0) press(i);
      });

      reset();
      return {
        restart: reset,
        destroy() {
          clearTimers();
          off();
        },
      };
    },
  });
})();
