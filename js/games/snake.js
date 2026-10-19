(function () {
  'use strict';

  const N = 20;
  const CELL = 24;
  const SIZE = N * CELL;
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

  GL.register({
    id: 'snake',
    name: 'Snake',
    category: 'Arcade',
    hue: 152,
    tagline: 'The classic. Eat, grow, don’t bite yourself.',
    howTo: 'Steer the snake to the food. Every bite makes you longer and a little faster. Hitting a wall or your own tail ends the run.',
    controls: [
      ['↑ ↓ ← →', 'Steer (or W A S D)'],
      ['Swipe', 'Steer on touch screens'],
      ['Space', 'Start / pause'],
      ['R', 'Restart'],
    ],
    pausable: true,
    art: `<svg viewBox="0 0 160 100" aria-hidden="true"><path d="M30 72H72V36h46v22" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><circle cx="118" cy="58" r="9" fill="#fff"/><circle cx="121" cy="56" r="2" fill="#0f172a"/><circle cx="138" cy="30" r="6" fill="#fff" opacity=".85"/></svg>`,

    mount(api) {
      const { canvas, ctx } = GL.canvas(SIZE, SIZE, 'square');
      api.root.append(canvas);
      api.root.classList.add('no-scroll');

      let snake, prev, dir, queue, food, score, state, acc, step, deathAt, startBest;
      let particles = [];

      function reset() {
        const mid = Math.floor(N / 2);
        snake = [{ x: 7, y: mid }, { x: 6, y: mid }, { x: 5, y: mid }, { x: 4, y: mid }];
        prev = snake.map((p) => ({ ...p }));
        dir = 'right';
        queue = [];
        score = 0;
        acc = 0;
        step = 130;
        deathAt = 0;
        state = 'ready';
        particles = [];
        startBest = api.best() || 0;
        placeFood();
        api.setScore(0, false);
        api.hideOverlay();
        api.setPaused(false);
      }

      function placeFood() {
        const free = [];
        for (let y = 0; y < N; y++)
          for (let x = 0; x < N; x++)
            if (!snake.some((p) => p.x === x && p.y === y)) free.push({ x, y });
        food = free[Math.floor(Math.random() * free.length)] || { x: -1, y: -1 };
      }

      function start() {
        if (state !== 'ready' && state !== 'paused') return;
        state = 'running';
        api.hideOverlay();
        api.setPaused(false);
      }

      function togglePause() {
        if (state === 'running') {
          state = 'paused';
          api.setPaused(true);
          api.overlay({
            kicker: 'Paused',
            title: 'Take a breath',
            text: `Score ${score}. Press Space or P to continue.`,
            actions: [{ label: 'Resume', primary: true, onClick: start }],
          });
        } else if (state === 'paused' || state === 'ready') {
          start();
        }
      }

      function steer(d) {
        if (state === 'over') return;
        if (state !== 'running') start();
        const last = queue.length ? queue[queue.length - 1] : dir;
        if (d === last || d === OPPOSITE[last]) return;
        if (queue.length < 3) queue.push(d);
      }

      function tick(now) {
        if (queue.length) dir = queue.shift();
        const [dx, dy] = DIRS[dir];
        const head = { x: snake[0].x + dx, y: snake[0].y + dy };
        const eats = head.x === food.x && head.y === food.y;
        const body = eats ? snake : snake.slice(0, -1);
        if (head.x < 0 || head.y < 0 || head.x >= N || head.y >= N || body.some((p) => p.x === head.x && p.y === head.y)) {
          return die(now);
        }
        prev = snake.map((p) => ({ ...p }));
        snake.unshift(head);
        if (eats) {
          score++;
          api.setScore(score);
          api.submit(score);
          step = Math.max(58, 130 - score * 2.5);
          burst(food.x * CELL + CELL / 2, food.y * CELL + CELL / 2);
          placeFood();
        } else {
          snake.pop();
        }
      }

      function die(now) {
        state = 'over';
        deathAt = now;
        acc = step; // freeze the interpolation at the last valid position
        const record = score > startBest;
        setTimeout(() => {
          if (state !== 'over') return;
          api.overlay({
            kicker: record ? 'New personal best' : 'Game over',
            title: `${score} ${score === 1 ? 'point' : 'points'}`,
            text: record ? 'That’s your longest snake yet.' : `Your best is ${api.best() ?? 0}. Go again?`,
            tone: record ? 'win' : 'lose',
            actions: [{ label: 'Play again', primary: true, onClick: reset }],
          });
        }, 450);
      }

      function burst(x, y) {
        for (let i = 0; i < 14; i++) {
          const a = (Math.PI * 2 * i) / 14 + Math.random() * 0.4;
          const s = 60 + Math.random() * 90;
          particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1 });
        }
      }

      function draw(now, dt) {
        const c = GL.colors();
        const snakeColor = `hsl(152 ${c.dark ? '62% 52%' : '58% 42%'})`;
        const snakeTail = `hsl(172 ${c.dark ? '62% 42%' : '58% 36%'})`;

        ctx.fillStyle = c.board;
        ctx.fillRect(0, 0, SIZE, SIZE);
        ctx.fillStyle = c.boardAlt;
        for (let y = 0; y < N; y++)
          for (let x = (y % 2); x < N; x += 2) ctx.fillRect(x * CELL, y * CELL, CELL, CELL);

        // food
        if (food.x >= 0) {
          const pulse = 1 + Math.sin(now / 160) * 0.08;
          const fx = food.x * CELL + CELL / 2, fy = food.y * CELL + CELL / 2;
          ctx.fillStyle = c.bad;
          ctx.shadowColor = c.bad;
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.arc(fx, fy + 1, CELL * 0.32 * pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = c.good;
          ctx.beginPath();
          ctx.ellipse(fx + 3, fy - CELL * 0.3, 4, 2.2, -0.6, 0, Math.PI * 2);
          ctx.fill();
        }

        // snake, interpolated between ticks for smooth motion
        const k = Math.min(acc / step, 1);
        const pts = snake.map((p, i) => {
          const from = prev[i] || p;
          return { x: (from.x + (p.x - from.x) * k) * CELL + CELL / 2, y: (from.y + (p.y - from.y) * k) * CELL + CELL / 2 };
        });
        const head = pts[0], tail = pts[pts.length - 1];
        const grad = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
        grad.addColorStop(0, snakeTail);
        grad.addColorStop(1, snakeColor);
        ctx.strokeStyle = grad;
        ctx.lineWidth = CELL * 0.66;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(tail.x, tail.y);
        for (let i = pts.length - 2; i >= 0; i--) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();

        ctx.fillStyle = snakeColor;
        ctx.beginPath();
        ctx.arc(head.x, head.y, CELL * 0.4, 0, Math.PI * 2);
        ctx.fill();

        // eyes
        const look = DIRS[queue[0] || dir];
        const px = -look[1], py = look[0];
        for (const side of [-1, 1]) {
          const ex = head.x + look[0] * 4 + px * side * 5;
          const ey = head.y + look[1] * 4 + py * side * 5;
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(ex, ey, 3.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#0b0b0f';
          ctx.beginPath();
          ctx.arc(ex + look[0] * 1.2, ey + look[1] * 1.2, 1.7, 0, Math.PI * 2);
          ctx.fill();
        }

        // particles
        const s = dt / 1000;
        particles = particles.filter((p) => (p.life -= s * 2.2) > 0);
        ctx.fillStyle = c.bad;
        for (const p of particles) {
          p.x += p.vx * s;
          p.y += p.vy * s;
          ctx.globalAlpha = p.life;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2.5 * p.life + 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;

        // death flash
        if (state === 'over') {
          const t = Math.max(0, 1 - (now - deathAt) / 500);
          if (t > 0) {
            ctx.fillStyle = c.bad;
            ctx.globalAlpha = t * 0.25;
            ctx.fillRect(0, 0, SIZE, SIZE);
            ctx.globalAlpha = 1;
          }
        }

        if (state === 'ready') hint('Press an arrow key or swipe to start', c);
      }

      function hint(text, c) {
        ctx.font = '600 14px Inter, system-ui, sans-serif';
        const w = ctx.measureText(text).width + 32;
        const x = (SIZE - w) / 2, y = SIZE - 62;
        ctx.fillStyle = c.surface;
        ctx.globalAlpha = 0.92;
        GL.roundRect(ctx, x, y, w, 36, 18);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = c.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, SIZE / 2, y + 18);
      }

      const stopLoop = GL.loop((dt, now) => {
        if (state === 'running') {
          acc += dt;
          while (acc >= step && state === 'running') {
            acc -= step;
            tick(now);
          }
        }
        draw(now, dt);
      });

      function onKey(e) {
        const d = GL.dirFromKey(e);
        if (d) {
          e.preventDefault();
          steer(d);
        } else if (e.key === ' ' && !e.repeat) {
          e.preventDefault();
          if (state === 'over') reset();
          else togglePause();
        }
      }
      window.addEventListener('keydown', onKey);
      const unswipe = GL.swipe(api.root, (d) => {
        if (d === 'tap') {
          if (state === 'ready' || state === 'paused') start();
        } else {
          steer(d);
        }
      });

      reset();

      return {
        restart: reset,
        togglePause,
        pause: () => state === 'running' && togglePause(),
        destroy() {
          stopLoop();
          unswipe();
          window.removeEventListener('keydown', onKey);
        },
      };
    },
  });
})();
