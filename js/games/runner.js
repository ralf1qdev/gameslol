(function () {
  'use strict';

  const W = 760;
  const H = 280;
  const FLOOR = H - 48;
  const PX = 90;
  const GRAVITY = 2600;
  const JUMP = -820;

  GL.register({
    id: 'runner',
    name: 'Runner',
    category: 'Arcade',
    hue: 24,
    tagline: 'Jump the cacti, duck the birds, run forever.',
    howTo: 'Your runner speeds up the longer you survive. Jump over cacti, duck under low-flying birds, and see how far you can get. Hold jump for a higher leap.',
    controls: [
      ['Space ↑', 'Jump (hold to go higher)'],
      ['↓', 'Duck / fast fall'],
      ['Tap', 'Jump on touch screens'],
      ['P', 'Pause'],
    ],
    pausable: true,
    art: `<svg viewBox="0 0 160 100" aria-hidden="true"><path d="M10 80h140" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".6"/><rect x="36" y="38" width="24" height="26" rx="8" fill="#fff"/><circle cx="53" cy="47" r="3" fill="#0f172a"/><path d="M42 64v10M54 64v6" stroke="#fff" stroke-width="5" stroke-linecap="round"/><g fill="#fff" opacity=".85"><rect x="104" y="52" width="12" height="28" rx="5"/><rect x="96" y="58" width="8" height="12" rx="4"/><rect x="116" y="62" width="8" height="10" rx="4"/></g><path d="M74 30l8-4 8 4" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/></svg>`,
    format: (v) => Math.floor(v).toLocaleString(),

    mount(api) {
      const { canvas, ctx } = GL.canvas(W, H, 'wide', 860);
      api.root.append(canvas);
      api.root.classList.add('no-scroll');

      let p, obstacles, speed, dist, spawnIn, groundOff, holding, ducking, deadAt, hills, milestone;

      const game = GL.realtime(api, {
        reset() {
          p = { y: FLOOR, vy: 0, step: 0 };
          obstacles = [];
          speed = 360;
          dist = 0;
          spawnIn = 1.1;
          groundOff = 0;
          holding = false;
          ducking = false;
          deadAt = 0;
          milestone = 100;
          hills = Array.from({ length: 6 }, (_, i) => ({ x: i * 160, h: 30 + Math.random() * 40 }));
        },
        onStart() {
          jump();
        },
        update(dt, now) {
          speed = Math.min(980, speed + 9 * dt);
          dist += speed * dt * 0.025;
          const shown = Math.floor(dist);
          if (shown !== game.score) game.setScore(shown);
          if (shown >= milestone) {
            milestone += 100;
            GL.sound.tone(990, 70, 'triangle', 0.04);
            setTimeout(() => GL.sound.tone(1320, 90, 'triangle', 0.04), 80);
          }

          const grav = !holding && p.vy < 0 ? GRAVITY * 2.1 : ducking ? GRAVITY * 2.4 : GRAVITY;
          p.vy += grav * dt;
          p.y += p.vy * dt;
          if (p.y >= FLOOR) { p.y = FLOOR; p.vy = 0; }
          p.step += dt * speed / 40;
          groundOff = (groundOff + speed * dt) % 40;
          for (const hl of hills) {
            hl.x -= speed * 0.15 * dt;
            if (hl.x < -160) { hl.x += 6 * 160; hl.h = 30 + Math.random() * 40; }
          }

          spawnIn -= dt;
          if (spawnIn <= 0) {
            spawnObstacle();
            spawnIn = (0.75 + Math.random() * 0.9) * (520 / speed) + 0.25;
          }
          for (const o of obstacles) {
            o.x -= speed * dt;
            if (o.bird) o.flap += dt * 10;
          }
          obstacles = obstacles.filter((o) => o.x + o.w > -20);

          const box = hitbox();
          for (const o of obstacles) {
            if (box.x < o.x + o.w - 4 && box.x + box.w > o.x + 4 && box.y < o.y + o.h - 4 && box.y + box.h > o.y + 4) {
              deadAt = now;
              GL.sound.tone(140, 260, 'square', 0.05);
              game.gameOver(400);
              return;
            }
          }
        },
        draw(dt, now) {
          const c = GL.colors();
          ctx.fillStyle = c.board;
          ctx.fillRect(0, 0, W, H);

          ctx.fillStyle = c.dark ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.035)';
          for (const hl of hills) {
            ctx.beginPath();
            ctx.ellipse(hl.x + 80, FLOOR + 4, 110, hl.h, 0, Math.PI, 0);
            ctx.fill();
          }

          ctx.strokeStyle = c.muted;
          ctx.globalAlpha = 0.5;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, FLOOR + 1);
          ctx.lineTo(W, FLOOR + 1);
          ctx.stroke();
          ctx.fillStyle = c.muted;
          for (let x = -groundOff; x < W; x += 40) {
            ctx.fillRect(x, FLOOR + 10, 10, 2);
            ctx.fillRect(x + 22, FLOOR + 22, 5, 2);
          }
          ctx.globalAlpha = 1;

          for (const o of obstacles) {
            if (o.bird) drawBird(o, c);
            else drawCactus(o, c);
          }
          drawRunner(c, now);

          if (game.state === 'ready') GL.canvasHint(ctx, W, 60, 'Press Space or tap to run');
          if (game.state !== 'ready') {
            ctx.font = '700 15px "JetBrains Mono", monospace';
            ctx.textAlign = 'right';
            ctx.textBaseline = 'top';
            ctx.fillStyle = c.muted;
            const best = api.best();
            ctx.fillText((best ? 'HI ' + String(Math.floor(best)).padStart(5, '0') + '   ' : '') + String(game.score).padStart(5, '0'), W - 20, 18);
          }
        },
      });

      function spawnObstacle() {
        if (dist > 150 && Math.random() < 0.28) {
          const heights = [FLOOR - 24, FLOOR - 40, FLOOR - 90];
          obstacles.push({ bird: true, x: W + 20, y: heights[Math.floor(Math.random() * 3)] - 18, w: 42, h: 26, flap: 0 });
        } else {
          const count = 1 + Math.floor(Math.random() * Math.min(3, 1 + dist / 200));
          const tall = Math.random() < 0.5;
          const w = 18 * count + 4 * (count - 1);
          const h = tall ? 54 : 38;
          obstacles.push({ x: W + 20, y: FLOOR - h, w, h, count });
        }
      }

      function hitbox() {
        return ducking && p.y >= FLOOR - 1
          ? { x: PX - 4, y: p.y - 26, w: 50, h: 26 }
          : { x: PX, y: p.y - 46, w: 34, h: 46 };
      }

      function drawRunner(c, now) {
        const b = hitbox();
        const body = c.text;
        ctx.fillStyle = body;
        GL.roundRect(ctx, b.x, b.y, b.w, b.h - 8, 10);
        ctx.fill();
        // eye
        ctx.fillStyle = c.board;
        ctx.beginPath();
        ctx.arc(b.x + b.w - 10, b.y + 11, 3.5, 0, Math.PI * 2);
        ctx.fill();
        if (deadAt) {
          ctx.strokeStyle = c.board;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(b.x + b.w - 14, b.y + 7);
          ctx.lineTo(b.x + b.w - 6, b.y + 15);
          ctx.stroke();
        }
        // legs
        ctx.fillStyle = body;
        const onGround = p.y >= FLOOR - 1 && game.state === 'running';
        const s = onGround ? Math.sin(p.step) : 0.3;
        ctx.fillRect(b.x + 8, b.y + b.h - 10, 6, 10 - Math.max(0, s) * 6);
        ctx.fillRect(b.x + b.w - 16, b.y + b.h - 10, 6, 10 - Math.max(0, -s) * 6);
      }

      function drawCactus(o, c) {
        ctx.fillStyle = c.dark ? '#3ecf7a' : '#22a35a';
        for (let i = 0; i < o.count; i++) {
          const x = o.x + i * 22;
          GL.roundRect(ctx, x + 4, o.y, 10, o.h, 5);
          ctx.fill();
          GL.roundRect(ctx, x - 1, o.y + o.h * 0.3, 6, o.h * 0.3, 3);
          ctx.fill();
          GL.roundRect(ctx, x + 13, o.y + o.h * 0.2, 6, o.h * 0.28, 3);
          ctx.fill();
        }
      }

      function drawBird(o, c) {
        ctx.fillStyle = c.bad;
        ctx.beginPath();
        ctx.ellipse(o.x + 22, o.y + 15, 16, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(o.x + 4, o.y + 13);
        ctx.lineTo(o.x - 4, o.y + 17);
        ctx.lineTo(o.x + 6, o.y + 18);
        ctx.fill();
        const wy = Math.sin(o.flap) * 12;
        ctx.beginPath();
        ctx.moveTo(o.x + 14, o.y + 13);
        ctx.lineTo(o.x + 24, o.y + 13 + wy);
        ctx.lineTo(o.x + 30, o.y + 13);
        ctx.fill();
      }

      function jump() {
        if (game.state === 'ready') return game.start();
        if (game.state !== 'running') return;
        holding = true;
        if (p.y >= FLOOR - 1) {
          p.vy = JUMP;
          GL.sound.tone(620, 60, 'triangle', 0.03);
        }
      }

      const offs = [
        GL.listen(window, 'keydown', (e) => {
          const k = e.key;
          if ((k === ' ' || k === 'ArrowUp' || k.toLowerCase() === 'w') && !e.repeat) {
            e.preventDefault();
            jump();
          } else if (k === 'ArrowDown' || k.toLowerCase() === 's') {
            e.preventDefault();
            ducking = true;
          }
        }),
        GL.listen(window, 'keyup', (e) => {
          const k = e.key;
          if (k === ' ' || k === 'ArrowUp' || k.toLowerCase() === 'w') holding = false;
          if (k === 'ArrowDown' || k.toLowerCase() === 's') ducking = false;
        }),
        GL.listen(canvas, 'pointerdown', (e) => {
          e.preventDefault();
          // tap the lower third to duck, anywhere else to jump
          if (GL.canvasPoint(canvas, W, H, e).y > H * 0.75 && game.state === 'running') ducking = true;
          else jump();
        }),
        GL.listen(window, 'pointerup', () => {
          holding = false;
          ducking = false;
        }),
      ];

      game.reset();
      return game.instance(() => offs.forEach((off) => off()));
    },
  });
})();
