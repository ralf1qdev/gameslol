(function () {
  'use strict';

  const W = 400;
  const H = 600;
  const GROUND = 72;
  const BIRD_X = 110;
  const BIRD_R = 15;
  const GRAVITY = 1500;
  const FLAP = -440;
  const PIPE_W = 66;
  const GAP = 160;
  const SPEED = 170;
  const SPAWN_EVERY = 1.45;

  GL.register({
    id: 'flap',
    name: 'Flap',
    category: 'Arcade',
    hue: 48,
    tagline: 'One button, endless pipes, zero mercy.',
    howTo: 'Tap to flap and keep the bird in the air. Fly through the gaps between pipes — each one you clear is a point. Touch a pipe or the ground and it’s over.',
    controls: [
      ['Space ↑', 'Flap'],
      ['Click', 'Flap'],
      ['Tap', 'Flap on touch screens'],
      ['P', 'Pause'],
    ],
    pausable: true,
    art: `<svg viewBox="0 0 160 100" aria-hidden="true"><g fill="#fff"><rect x="98" y="0" width="22" height="34" rx="3" opacity=".55"/><rect x="94" y="28" width="30" height="10" rx="3" opacity=".75"/><rect x="98" y="66" width="22" height="34" rx="3" opacity=".55"/><rect x="94" y="62" width="30" height="10" rx="3" opacity=".75"/><circle cx="56" cy="50" r="14"/></g><circle cx="61" cy="46" r="3" fill="#0f172a"/><path d="M68 51l10 3-10 3z" fill="#f97316"/><ellipse cx="50" cy="54" rx="7" ry="4" fill="#fde68a"/></svg>`,

    mount(api) {
      const { canvas, ctx } = GL.canvas(W, H, '', 420);
      api.root.append(canvas);
      api.root.classList.add('no-scroll');

      let bird, pipes, spawnT, groundX, clouds, deadAt;

      const game = GL.realtime(api, {
        reset() {
          bird = { y: H / 2 - 40, vy: 0, wing: 0 };
          pipes = [];
          spawnT = 0.6;
          groundX = 0;
          deadAt = 0;
          clouds = Array.from({ length: 5 }, (_, i) => ({ x: i * 110 + Math.random() * 60, y: 50 + Math.random() * 200, s: 0.6 + Math.random() * 0.7 }));
        },
        onStart() {
          flap();
        },
        update(dt, now) {
          bird.vy += GRAVITY * dt;
          bird.y += bird.vy * dt;
          bird.wing += dt * 14;

          if (!deadAt) {
            groundX = (groundX + SPEED * dt) % 24;
            spawnT -= dt;
            if (spawnT <= 0) {
              spawnT = SPAWN_EVERY;
              const min = 90, max = H - GROUND - 90 - GAP;
              pipes.push({ x: W + 10, top: min + Math.random() * (max - min), passed: false });
            }
            for (const p of pipes) {
              p.x -= SPEED * dt;
              if (!p.passed && p.x + PIPE_W < BIRD_X - BIRD_R) {
                p.passed = true;
                game.add(1);
                GL.sound.tone(880, 80, 'triangle', 0.05);
              }
              const hitX = BIRD_X + BIRD_R > p.x + 3 && BIRD_X - BIRD_R < p.x + PIPE_W - 3;
              const hitY = bird.y - BIRD_R + 3 < p.top || bird.y + BIRD_R - 3 > p.top + GAP;
              if (hitX && hitY) die(now);
            }
            pipes = pipes.filter((p) => p.x > -PIPE_W - 10);
            for (const c of clouds) {
              c.x -= SPEED * 0.2 * c.s * dt;
              if (c.x < -80) c.x = W + 40;
            }
          }
          if (bird.y < BIRD_R) { bird.y = BIRD_R; bird.vy = 0; }
          if (bird.y + BIRD_R >= H - GROUND) {
            bird.y = H - GROUND - BIRD_R;
            die(now);
            game.gameOver(350);
          }
        },
        draw(dt, now) {
          const c = GL.colors();
          const sky = ctx.createLinearGradient(0, 0, 0, H);
          sky.addColorStop(0, c.dark ? '#0f1630' : '#7dd3fc');
          sky.addColorStop(1, c.dark ? '#1e2a52' : '#e0f2fe');
          ctx.fillStyle = sky;
          ctx.fillRect(0, 0, W, H);

          ctx.fillStyle = c.dark ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.85)';
          for (const cl of clouds) {
            ctx.beginPath();
            ctx.arc(cl.x, cl.y, 20 * cl.s, 0, Math.PI * 2);
            ctx.arc(cl.x + 22 * cl.s, cl.y - 8 * cl.s, 24 * cl.s, 0, Math.PI * 2);
            ctx.arc(cl.x + 46 * cl.s, cl.y, 18 * cl.s, 0, Math.PI * 2);
            ctx.fill();
          }

          for (const p of pipes) {
            drawPipe(p.x, 0, p.top, true, c);
            drawPipe(p.x, p.top + GAP, H - GROUND - p.top - GAP, false, c);
          }

          // ground
          ctx.fillStyle = c.dark ? '#3b2f1e' : '#e7c48a';
          ctx.fillRect(0, H - GROUND, W, GROUND);
          ctx.fillStyle = c.dark ? '#2f8f4e' : '#4ade80';
          ctx.fillRect(0, H - GROUND, W, 12);
          ctx.fillStyle = c.dark ? 'rgba(0,0,0,.18)' : 'rgba(0,0,0,.07)';
          for (let x = -groundX; x < W; x += 24) ctx.fillRect(x, H - GROUND + 20, 12, 6);

          // bird
          const bob = game.state === 'ready' ? Math.sin(now / 220) * 6 : 0;
          const angle = game.state === 'ready' ? 0 : Math.max(-0.45, Math.min(1.3, bird.vy / 600));
          ctx.save();
          ctx.translate(BIRD_X, bird.y + bob);
          ctx.rotate(angle);
          ctx.fillStyle = '#facc15';
          ctx.beginPath();
          ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fde68a';
          ctx.beginPath();
          ctx.ellipse(-5, 3 + Math.sin(bird.wing) * 3, 8, 5, -0.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(6, -5, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(7.5, -5, 2.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#f97316';
          ctx.beginPath();
          ctx.moveTo(11, 0);
          ctx.lineTo(22, 3);
          ctx.lineTo(11, 7);
          ctx.fill();
          ctx.restore();

          // score
          if (game.state !== 'ready') {
            ctx.font = '800 56px Inter, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.lineWidth = 6;
            ctx.strokeStyle = 'rgba(0,0,0,.18)';
            ctx.strokeText(game.score, W / 2, 36);
            ctx.fillStyle = '#fff';
            ctx.fillText(game.score, W / 2, 36);
          } else {
            GL.canvasHint(ctx, W, H - GROUND - 60, 'Tap, click or press Space');
          }

          if (deadAt) {
            const t = Math.max(0, 1 - (now - deadAt) / 300);
            if (t > 0) {
              ctx.fillStyle = '#fff';
              ctx.globalAlpha = t * 0.7;
              ctx.fillRect(0, 0, W, H);
              ctx.globalAlpha = 1;
            }
          }
        },
      });

      function drawPipe(x, y, h, top, c) {
        const body = c.dark ? '#22a35a' : '#34c46b';
        const edge = c.dark ? '#178045' : '#22a055';
        ctx.fillStyle = body;
        ctx.fillRect(x, y, PIPE_W, h);
        ctx.fillStyle = 'rgba(255,255,255,.18)';
        ctx.fillRect(x + 8, y, 8, h);
        ctx.fillStyle = edge;
        const capY = top ? y + h - 24 : y;
        GL.roundRect(ctx, x - 5, capY, PIPE_W + 10, 24, 6);
        ctx.fill();
      }

      function die(now) {
        if (deadAt) return;
        deadAt = now;
        bird.vy = Math.min(bird.vy, -120);
        GL.sound.tone(160, 220, 'square', 0.04);
      }

      function flap() {
        if (game.state === 'ready') return game.start();
        if (game.state !== 'running' || deadAt) return;
        bird.vy = FLAP;
        GL.sound.tone(520, 60, 'sine', 0.03);
      }

      const offs = [
        GL.listen(window, 'keydown', (e) => {
          if ((e.key === ' ' || e.key === 'ArrowUp' || e.key.toLowerCase() === 'w') && !e.repeat) {
            e.preventDefault();
            flap();
          }
        }),
        GL.listen(canvas, 'pointerdown', (e) => {
          e.preventDefault();
          flap();
        }),
      ];

      game.reset();
      return game.instance(() => offs.forEach((off) => off()));
    },
  });
})();
