(function () {
  'use strict';

  const W = 640;
  const H = 480;
  const COLS = 10;
  const MARGIN = 24;
  const GAP = 6;
  const TOP = 56;
  const BRICK_H = 18;
  const PADDLE_Y = H - 34;
  const BALL_R = 7;
  const LIVES = 3;

  GL.register({
    id: 'breaker',
    name: 'Brick Breaker',
    category: 'Arcade',
    hue: 330,
    tagline: 'Bounce, smash, clear the wall.',
    howTo: 'Keep the ball in play with your paddle and break every brick to advance. Where the ball hits the paddle decides its angle. Each level adds rows, tougher bricks and a faster ball.',
    controls: [
      ['Mouse', 'Move the paddle'],
      ['← →', 'Move the paddle (or A D)'],
      ['Space', 'Launch the ball'],
      ['Tap', 'Launch on touch screens'],
      ['P', 'Pause'],
    ],
    pausable: true,
    art: `<svg viewBox="0 0 160 100" aria-hidden="true"><g fill="#fff"><rect x="26" y="16" width="24" height="10" rx="3"/><rect x="54" y="16" width="24" height="10" rx="3"/><rect x="82" y="16" width="24" height="10" rx="3" opacity=".4"/><rect x="110" y="16" width="24" height="10" rx="3"/><rect x="26" y="30" width="24" height="10" rx="3" opacity=".7"/><rect x="54" y="30" width="24" height="10" rx="3" opacity=".4"/><rect x="82" y="30" width="24" height="10" rx="3" opacity=".7"/><rect x="110" y="30" width="24" height="10" rx="3" opacity=".7"/><circle cx="92" cy="60" r="6"/><rect x="62" y="80" width="40" height="8" rx="4"/></g><path d="M92 60L76 46" stroke="#fff" stroke-width="2" stroke-dasharray="3 4" opacity=".6"/></svg>`,

    mount(api) {
      const { canvas, ctx } = GL.canvas(W, H, 'wide');
      api.root.append(canvas);
      api.root.classList.add('no-scroll');

      let bricks, paddle, ball, score, lives, level, state, startBest, particles, trail, keys, banner, shake;

      function buildLevel() {
        const rows = Math.min(5 + level, 9);
        const bw = (W - MARGIN * 2 - GAP * (COLS - 1)) / COLS;
        bricks = [];
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < COLS; c++) {
            // later levels punch gaps in the pattern
            if (level > 2 && (r + c * (level % 3 + 1)) % 7 === 0) continue;
            const hp = level >= 2 && r < Math.min(level - 1, 3) ? 2 : 1;
            bricks.push({ x: MARGIN + c * (bw + GAP), y: TOP + r * (BRICK_H + GAP), w: bw, h: BRICK_H, row: r, rows, hp, max: hp });
          }
        banner = { text: 'Level ' + level, t: 0 };
      }

      function resetBall() {
        ball = { x: paddle.x, y: PADDLE_Y - BALL_R - 1, vx: 0, vy: 0, speed: 330 + (level - 1) * 30, stuck: true };
        trail = [];
      }

      function reset() {
        score = 0;
        lives = LIVES;
        level = 1;
        particles = [];
        keys = { left: false, right: false };
        shake = 0;
        startBest = api.best() || 0;
        paddle = { x: W / 2, w: 104, h: 12 };
        buildLevel();
        resetBall();
        state = 'running';
        api.hideOverlay();
        api.setPaused(false);
        api.setScore(0, false);
        updateStats(false);
      }

      function updateStats(animate = true) {
        api.stat('level', 'Level', level, animate);
        api.stat('lives', 'Lives', '●'.repeat(lives) + '○'.repeat(Math.max(0, LIVES - lives)), animate);
      }

      function launch() {
        if (state !== 'running' || !ball.stuck) return;
        const angle = (Math.random() * 0.6 - 0.3);
        ball.vx = Math.sin(angle) * ball.speed;
        ball.vy = -Math.cos(angle) * ball.speed;
        ball.stuck = false;
      }

      function togglePause() {
        if (state === 'running') {
          state = 'paused';
          api.setPaused(true);
          api.overlay({
            kicker: 'Paused',
            title: 'Paused',
            text: 'Press P or Resume to continue.',
            actions: [{ label: 'Resume', primary: true, onClick: togglePause }],
          });
        } else if (state === 'paused') {
          state = 'running';
          api.setPaused(false);
          api.hideOverlay();
        }
      }

      function burst(x, y, color, n = 10) {
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const s = 40 + Math.random() * 160;
          particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 1, color, size: 2 + Math.random() * 2.5 });
        }
      }

      const brickColor = (b) => `hsl(${(330 - (b.row / Math.max(b.rows - 1, 1)) * 150 + 360) % 360} 80% ${GL.colors().dark ? 62 : 58}%)`;

      function step(dt) {
        const s = dt / 1000;
        if (keys.left) paddle.x -= 640 * s;
        if (keys.right) paddle.x += 640 * s;
        paddle.x = Math.max(paddle.w / 2, Math.min(W - paddle.w / 2, paddle.x));

        if (ball.stuck) {
          ball.x = paddle.x;
          ball.y = PADDLE_Y - BALL_R - 1;
          return;
        }

        const dist = Math.hypot(ball.vx, ball.vy) * s;
        const steps = Math.max(1, Math.ceil(dist / 4));
        for (let i = 0; i < steps; i++) {
          const px = ball.x, py = ball.y;
          ball.x += (ball.vx * s) / steps;
          ball.y += (ball.vy * s) / steps;

          if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx); }
          if (ball.x > W - BALL_R) { ball.x = W - BALL_R; ball.vx = -Math.abs(ball.vx); }
          if (ball.y < BALL_R) { ball.y = BALL_R; ball.vy = Math.abs(ball.vy); }

          // paddle
          const half = paddle.w / 2;
          if (ball.vy > 0 && ball.y + BALL_R >= PADDLE_Y && py + BALL_R <= PADDLE_Y + 2 &&
            ball.x >= paddle.x - half - BALL_R && ball.x <= paddle.x + half + BALL_R) {
            const rel = Math.max(-1, Math.min(1, (ball.x - paddle.x) / half));
            const angle = rel * (Math.PI / 3);
            ball.speed = Math.min(ball.speed * 1.015, 640);
            ball.vx = Math.sin(angle) * ball.speed;
            ball.vy = -Math.cos(angle) * ball.speed;
            ball.y = PADDLE_Y - BALL_R;
          }

          // bricks
          for (const b of bricks) {
            if (b.hp <= 0) continue;
            const cx = Math.max(b.x, Math.min(ball.x, b.x + b.w));
            const cy = Math.max(b.y, Math.min(ball.y, b.y + b.h));
            if ((ball.x - cx) ** 2 + (ball.y - cy) ** 2 > BALL_R * BALL_R) continue;
            const fromSide = px < b.x || px > b.x + b.w;
            if (fromSide) ball.vx = -ball.vx;
            else ball.vy = -ball.vy;
            ball.x = px;
            ball.y = py;
            b.hp--;
            const color = brickColor(b);
            if (b.hp <= 0) {
              score += (b.rows - b.row) * 10 * b.max;
              burst(b.x + b.w / 2, b.y + b.h / 2, color, 12);
            } else {
              score += 5;
              burst(ball.x, ball.y, color, 4);
            }
            api.setScore(score);
            api.submit(score);
            break;
          }

          if (ball.y > H + BALL_R * 2) {
            lives--;
            shake = 1;
            updateStats();
            if (lives <= 0) return gameOver();
            resetBall();
            return;
          }
        }

        trail.push({ x: ball.x, y: ball.y });
        if (trail.length > 8) trail.shift();

        if (bricks.every((b) => b.hp <= 0)) {
          level++;
          score += 250;
          api.setScore(score);
          api.submit(score);
          paddle.w = Math.max(72, 104 - (level - 1) * 4);
          buildLevel();
          resetBall();
          updateStats();
        }
      }

      function gameOver() {
        state = 'over';
        const record = score > startBest;
        api.overlay({
          kicker: record ? 'New personal best' : 'Game over',
          title: score.toLocaleString() + ' points',
          text: `You reached level ${level}.`,
          tone: record ? 'win' : 'lose',
          actions: [{ label: 'Play again', primary: true, onClick: reset }],
        });
      }

      function draw(dt) {
        const c = GL.colors();
        ctx.save();
        if (shake > 0) {
          ctx.translate((Math.random() - 0.5) * 8 * shake, (Math.random() - 0.5) * 8 * shake);
          shake = Math.max(0, shake - dt / 300);
        }
        ctx.fillStyle = c.board;
        ctx.fillRect(-10, -10, W + 20, H + 20);

        for (const b of bricks) {
          if (b.hp <= 0) continue;
          ctx.fillStyle = brickColor(b);
          GL.roundRect(ctx, b.x, b.y, b.w, b.h, 5);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.25)';
          GL.roundRect(ctx, b.x + 3, b.y + 3, b.w - 6, 4, 2);
          ctx.fill();
          if (b.max > 1 && b.hp === b.max) {
            ctx.strokeStyle = 'rgba(255,255,255,.7)';
            ctx.lineWidth = 2;
            GL.roundRect(ctx, b.x + 1, b.y + 1, b.w - 2, b.h - 2, 4);
            ctx.stroke();
          } else if (b.max > 1) {
            ctx.strokeStyle = 'rgba(0,0,0,.25)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(b.x + b.w * 0.3, b.y + 2);
            ctx.lineTo(b.x + b.w * 0.45, b.y + b.h * 0.6);
            ctx.lineTo(b.x + b.w * 0.38, b.y + b.h - 2);
            ctx.stroke();
          }
        }

        // particles
        const s = dt / 1000;
        particles = particles.filter((p) => (p.life -= s * 1.6) > 0);
        for (const p of particles) {
          p.vy += 500 * s;
          p.x += p.vx * s;
          p.y += p.vy * s;
          ctx.globalAlpha = p.life;
          ctx.fillStyle = p.color;
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;

        // paddle
        ctx.fillStyle = c.text;
        GL.roundRect(ctx, paddle.x - paddle.w / 2, PADDLE_Y, paddle.w, paddle.h, 6);
        ctx.fill();

        // ball + trail
        trail.forEach((t, i) => {
          ctx.globalAlpha = (i / trail.length) * 0.25;
          ctx.fillStyle = c.accent;
          ctx.beginPath();
          ctx.arc(t.x, t.y, BALL_R * (i / trail.length), 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        ctx.fillStyle = c.accent;
        ctx.shadowColor = c.accent;
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.font = '600 14px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (ball.stuck && state === 'running') {
          ctx.fillStyle = c.muted;
          ctx.fillText('Click, tap or press Space to launch', W / 2, PADDLE_Y - 60);
        }
        if (banner && banner.t < 1400) {
          banner.t += dt;
          const a = Math.min(1, banner.t / 200, (1400 - banner.t) / 300);
          ctx.globalAlpha = a;
          ctx.fillStyle = c.text;
          ctx.font = '800 34px Inter, system-ui, sans-serif';
          ctx.fillText(banner.text, W / 2, H / 2 + 30);
          ctx.globalAlpha = 1;
        }
        ctx.restore();
      }

      const stopLoop = GL.loop((dt) => {
        if (state === 'running') step(dt);
        draw(dt);
      });

      function onPointer(e) {
        if (state !== 'running') return;
        paddle.x = GL.canvasPoint(canvas, W, H, e).x;
      }
      function onDown(e) {
        onPointer(e);
        launch();
      }
      canvas.addEventListener('pointermove', onPointer);
      canvas.addEventListener('pointerdown', onDown);

      function onKey(e) {
        const d = GL.dirFromKey(e);
        if (d === 'left' || d === 'right') {
          keys[d] = e.type === 'keydown';
          e.preventDefault();
        } else if (e.key === ' ' && e.type === 'keydown') {
          e.preventDefault();
          if (state === 'over') reset();
          else launch();
        }
      }
      window.addEventListener('keydown', onKey);
      window.addEventListener('keyup', onKey);

      reset();

      return {
        restart: reset,
        togglePause,
        pause: () => state === 'running' && togglePause(),
        destroy() {
          stopLoop();
          window.removeEventListener('keydown', onKey);
          window.removeEventListener('keyup', onKey);
        },
      };
    },
  });
})();
