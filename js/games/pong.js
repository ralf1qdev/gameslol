(function () {
  'use strict';

  const W = 720;
  const H = 440;
  const PAD_W = 12;
  const PAD_H = 84;
  const BALL = 9;
  const TO_WIN = 7;
  const LEVELS = {
    easy: { label: 'Easy', speed: 260, error: 60 },
    normal: { label: 'Normal', speed: 380, error: 30 },
    hard: { label: 'Hard', speed: 560, error: 12 },
  };

  GL.register({
    id: 'pong',
    name: 'Pong',
    category: 'Arcade',
    hue: 190,
    tagline: 'The original. First to seven wins.',
    howTo: 'Move your paddle (left) to return the ball. Hitting it with the edge of the paddle sends it at a sharper angle, and every rally speeds it up. First to 7 points takes the match.',
    controls: [
      ['Mouse', 'Move your paddle'],
      ['↑ ↓', 'Move your paddle (or W S)'],
      ['Drag', 'Move on touch screens'],
      ['Space', 'Serve'],
      ['P', 'Pause'],
    ],
    pausable: true,
    noScore: true,
    art: `<svg viewBox="0 0 160 100" aria-hidden="true"><g fill="#fff"><rect x="28" y="30" width="8" height="34" rx="4"/><rect x="124" y="42" width="8" height="34" rx="4"/><circle cx="90" cy="40" r="6"/></g><path d="M80 10v80" stroke="#fff" stroke-width="2" stroke-dasharray="5 6" opacity=".5"/><path d="M40 52l44-10" stroke="#fff" stroke-width="2" stroke-dasharray="3 4" opacity=".55"/></svg>`,

    mount(api) {
      const { canvas, ctx } = GL.canvas(W, H, 'wide', 820);
      api.root.append(canvas);
      api.root.classList.add('no-scroll');

      let level = GL.store.get('pong:level', 'normal');
      if (!LEVELS[level]) level = 'normal';
      api.options.append(GL.ui.segmented({
        label: 'Opponent',
        value: level,
        options: Object.entries(LEVELS).map(([value, l]) => ({ value, label: l.label })),
        onChange: (v) => {
          level = v;
          GL.store.set('pong:level', v);
          game.reset();
        },
      }));

      let you, cpu, ball, serving, keys, aimOffset, flash, wins = GL.store.get('pong:wins', 0);

      function serve(dir) {
        ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, speed: 380, dir };
        serving = 0.9;
        aimOffset = (Math.random() - 0.5) * LEVELS[level].error * 2;
      }

      function stats(animate) {
        api.stat('you', 'You', you.score, animate);
        api.stat('cpu', 'Computer', cpu.score, animate);
        api.stat('wins', 'Matches won', wins, animate);
      }

      const game = GL.realtime(api, {
        ready: { kicker: 'Pong', title: 'First to seven', text: 'Move with the mouse, arrow keys or by dragging.' },
        reset() {
          you = { y: H / 2, score: 0 };
          cpu = { y: H / 2, score: 0 };
          keys = { up: false, down: false };
          flash = null;
          serve(Math.random() < 0.5 ? -1 : 1);
          stats(false);
        },
        update(dt) {
          if (keys.up) you.y -= 560 * dt;
          if (keys.down) you.y += 560 * dt;
          you.y = clampPad(you.y);

          // computer tracks the ball when it's coming, drifts to centre otherwise
          const L = LEVELS[level];
          const target = ball.vx > 0 ? ball.y + aimOffset : H / 2;
          const diff = target - cpu.y;
          cpu.y = clampPad(cpu.y + Math.sign(diff) * Math.min(Math.abs(diff), L.speed * dt));

          if (serving > 0) {
            serving -= dt;
            if (serving <= 0) {
              const a = (Math.random() - 0.5) * 0.8;
              ball.vx = Math.cos(a) * ball.speed * ball.dir;
              ball.vy = Math.sin(a) * ball.speed;
            }
            return;
          }

          const steps = Math.ceil((ball.speed * dt) / 6);
          for (let i = 0; i < steps; i++) {
            ball.x += (ball.vx * dt) / steps;
            ball.y += (ball.vy * dt) / steps;
            if (ball.y < BALL) { ball.y = BALL; ball.vy = Math.abs(ball.vy); GL.sound.tone(300, 40); }
            if (ball.y > H - BALL) { ball.y = H - BALL; ball.vy = -Math.abs(ball.vy); GL.sound.tone(300, 40); }
            if (ball.vx < 0 && ball.x - BALL < 32 + PAD_W && ball.x > 20 && Math.abs(ball.y - you.y) < PAD_H / 2 + BALL) hit(you, 1);
            if (ball.vx > 0 && ball.x + BALL > W - 32 - PAD_W && ball.x < W - 20 && Math.abs(ball.y - cpu.y) < PAD_H / 2 + BALL) hit(cpu, -1);
          }

          if (ball.x < -20) point(cpu, 1);
          else if (ball.x > W + 20) point(you, -1);
        },
        draw(dt, now) {
          const c = GL.colors();
          ctx.fillStyle = c.board;
          ctx.fillRect(0, 0, W, H);
          ctx.strokeStyle = c.dark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.1)';
          ctx.setLineDash([10, 12]);
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(W / 2, 12);
          ctx.lineTo(W / 2, H - 12);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.font = '800 64px Inter, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = c.dark ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,.08)';
          ctx.fillText(you.score, W / 2 - 80, 28);
          ctx.fillText(cpu.score, W / 2 + 80, 28);

          ctx.fillStyle = c.accent;
          GL.roundRect(ctx, 32, you.y - PAD_H / 2, PAD_W, PAD_H, 6);
          ctx.fill();
          ctx.fillStyle = c.text;
          GL.roundRect(ctx, W - 32 - PAD_W, cpu.y - PAD_H / 2, PAD_W, PAD_H, 6);
          ctx.fill();

          const blink = serving > 0 ? 0.4 + 0.6 * Math.abs(Math.sin(now / 120)) : 1;
          ctx.globalAlpha = blink;
          ctx.fillStyle = c.text;
          ctx.beginPath();
          ctx.arc(ball.x, ball.y, BALL, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;

          if (flash && now - flash.t < 500) {
            ctx.fillStyle = flash.color;
            ctx.globalAlpha = 0.18 * (1 - (now - flash.t) / 500);
            ctx.fillRect(flash.side < 0 ? 0 : W / 2, 0, W / 2, H);
            ctx.globalAlpha = 1;
          }
        },
      });

      const clampPad = (y) => Math.max(PAD_H / 2, Math.min(H - PAD_H / 2, y));

      function hit(pad, dir) {
        const rel = Math.max(-1, Math.min(1, (ball.y - pad.y) / (PAD_H / 2)));
        const angle = rel * 1.0;
        ball.speed = Math.min(ball.speed * 1.06, 980);
        ball.vx = Math.cos(angle) * ball.speed * dir;
        ball.vy = Math.sin(angle) * ball.speed;
        ball.x = dir > 0 ? 32 + PAD_W + BALL : W - 32 - PAD_W - BALL;
        aimOffset = (Math.random() - 0.5) * LEVELS[level].error * 2;
        GL.sound.tone(dir > 0 ? 520 : 440, 60, 'square', 0.03);
      }

      function point(who, serveDir) {
        who.score++;
        flash = { t: performance.now(), side: who === you ? 1 : -1, color: who === you ? GL.colors().good : GL.colors().bad };
        stats(true);
        if (who.score >= TO_WIN) {
          const won = who === you;
          if (won) {
            wins++;
            GL.store.set('pong:wins', wins);
            stats(true);
          }
          game.state = 'over';
          api.overlay({
            kicker: won ? 'Match won' : 'Match lost',
            title: `${you.score} – ${cpu.score}`,
            text: won ? `You beat the ${LEVELS[level].label.toLowerCase()} computer.` : 'Shake it off and go again.',
            tone: won ? 'win' : 'lose',
            actions: [{ label: 'Rematch', primary: true, onClick: () => { game.reset(); game.start(); } }],
          });
          return;
        }
        serve(serveDir);
      }

      const offs = [
        GL.listen(canvas, 'pointermove', (e) => {
          if (game.state === 'running') you.y = clampPad(GL.canvasPoint(canvas, W, H, e).y);
        }),
        GL.listen(canvas, 'pointerdown', () => game.state === 'ready' && game.start()),
        GL.listen(window, 'keydown', (e) => {
          const d = GL.dirFromKey(e);
          if (d === 'up' || d === 'down') keys[d] = true;
          if (e.key === ' ' && game.state === 'ready') game.start();
        }),
        GL.listen(window, 'keyup', (e) => {
          const d = GL.dirFromKey(e);
          if (d === 'up' || d === 'down') keys[d] = false;
        }),
      ];

      game.reset();
      return game.instance(() => offs.forEach((off) => off()));
    },
  });
})();
