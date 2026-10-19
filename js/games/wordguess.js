(function () {
  'use strict';

  const ROWS = 6;
  const LEN = 5;
  const KEYS = ['qwertyuiop', 'asdfghjkl', '↵zxcvbnm⌫'];
  const RANK = { absent: 1, present: 2, correct: 3 };

  // Scores a guess against the answer, handling repeated letters correctly.
  function score(guess, answer) {
    const res = Array(LEN).fill('absent');
    const left = {};
    for (let i = 0; i < LEN; i++) {
      if (guess[i] === answer[i]) res[i] = 'correct';
      else left[answer[i]] = (left[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < LEN; i++) {
      if (res[i] !== 'correct' && left[guess[i]]) {
        res[i] = 'present';
        left[guess[i]]--;
      }
    }
    return res;
  }

  function loadWords(cb) {
    if (GL.WORDS) return cb();
    let s = document.querySelector('script[data-words]');
    if (!s) {
      s = document.createElement('script');
      s.src = 'js/data/words.js';
      s.dataset.words = '';
      document.head.append(s);
    }
    s.addEventListener('load', cb, { once: true });
  }

  GL.register({
    id: 'wordguess',
    name: 'Word Guess',
    category: 'Puzzle',
    hue: 100,
    tagline: 'Six tries to find the hidden five-letter word.',
    howTo: 'Guess the five-letter word in six tries. After each guess, green means the letter is in the right spot, yellow means it’s in the word but somewhere else, and grey means it isn’t in the word at all.',
    controls: [
      ['A-Z', 'Type a letter'],
      ['Enter', 'Submit a guess'],
      ['⌫', 'Delete a letter'],
      ['R', 'Next word (after a round)'],
    ],
    scoreLabel: 'Streak',
    bestLabel: 'Best streak',
    art: `<svg viewBox="0 0 160 100" aria-hidden="true" font-family="Inter,system-ui,sans-serif" font-weight="800" font-size="17" text-anchor="middle"><g><rect x="22" y="32" width="22" height="22" rx="4" fill="#fff"/><rect x="48" y="32" width="22" height="22" rx="4" fill="#fde047"/><rect x="74" y="32" width="22" height="22" rx="4" fill="#fff"/><rect x="100" y="32" width="22" height="22" rx="4" fill="#fff" opacity=".5"/><rect x="126" y="32" width="12" height="22" rx="4" fill="#fff" opacity=".3"/></g><g fill="#166534"><text x="33" y="49">W</text><text x="59" y="49" fill="#713f12">O</text><text x="85" y="49">R</text><text x="111" y="49" fill="#fff">D</text></g><g opacity=".45" fill="#fff"><rect x="22" y="60" width="22" height="6" rx="3"/><rect x="48" y="60" width="22" height="6" rx="3"/><rect x="74" y="60" width="22" height="6" rx="3"/></g></svg>`,

    mount(api) {
      const { h } = GL;
      const board = h('div', { class: 'wg-board' });
      const kb = h('div', { class: 'wg-kb' });
      const toast = h('div', { class: 'wg-toast', 'aria-live': 'polite' });
      api.root.append(h('div', { class: 'wg-wrap' }, toast, board, kb));

      const tiles = Array.from({ length: ROWS }, () => Array.from({ length: LEN }, () => h('div', { class: 'wg-tile' })));
      const rows = tiles.map((r) => h('div', { class: 'wg-row' }, r));
      board.append(...rows);

      const keyEls = {};
      for (const line of KEYS) {
        const rowEl = h('div', { class: 'wg-kb-row' });
        for (const ch of line) {
          const label = ch === '↵' ? 'Enter' : ch;
          const el = h('button', { type: 'button', class: 'wg-key' + (ch === '↵' || ch === '⌫' ? ' wide' : ''), 'aria-label': ch === '⌫' ? 'Delete' : label, onclick: () => press(ch) }, label);
          keyEls[ch] = el;
          rowEl.append(el);
        }
        kb.append(rowEl);
      }

      let answer, guesses, current, done, busy, toastT;
      const record = GL.store.get('words:record', { played: 0, wins: 0, streak: 0 });

      function stats(animate) {
        api.setScore(record.streak, animate);
        api.stat('played', 'Played', record.played, animate);
        api.stat('winrate', 'Win %', record.played ? Math.round((record.wins / record.played) * 100) : 0, animate);
      }

      function reset() {
        if (answer && guesses.length && !done) {
          // abandoning a game in progress counts as a loss
          record.played++;
          record.streak = 0;
          GL.store.set('words:record', record);
        }
        const list = GL.WORDS.answers;
        answer = list[Math.floor(Math.random() * list.length)];
        guesses = [];
        current = '';
        done = false;
        busy = false;
        tiles.flat().forEach((t) => { t.textContent = ''; t.className = 'wg-tile'; });
        Object.values(keyEls).forEach((k) => { delete k.dataset.state; });
        api.hideOverlay();
        stats(false);
        paint();
      }

      function say(msg, ms = 1400) {
        toast.textContent = msg;
        toast.classList.add('show');
        clearTimeout(toastT);
        toastT = setTimeout(() => toast.classList.remove('show'), ms);
      }

      function paint() {
        const r = guesses.length;
        if (r >= ROWS) return;
        tiles[r].forEach((t, i) => {
          const ch = current[i] || '';
          if (t.textContent !== ch) {
            t.textContent = ch;
            t.classList.toggle('filled', !!ch);
            if (ch) {
              t.classList.remove('pop');
              void t.offsetWidth;
              t.classList.add('pop');
            }
          }
        });
      }

      function press(ch) {
        if (done || busy || !answer) return;
        if (ch === '⌫') current = current.slice(0, -1);
        else if (ch === '↵') return submit();
        else if (current.length < LEN) current += ch;
        paint();
      }

      function submit() {
        const row = rows[guesses.length];
        if (current.length < LEN) {
          say('Not enough letters');
          return shake(row);
        }
        if (current !== answer && !GL.WORDS.valid.includes(current) && !GL.WORDS.answers.includes(current)) {
          say('Not in word list');
          return shake(row);
        }
        const res = score(current, answer);
        const guess = current;
        const r = guesses.length;
        guesses.push(guess);
        current = '';
        busy = true;
        res.forEach((state, i) => {
          setTimeout(() => {
            tiles[r][i].classList.add('flip', state);
            GL.sound.tone(state === 'correct' ? 660 : state === 'present' ? 520 : 300, 60, 'sine', 0.025);
          }, i * 260);
        });
        setTimeout(() => {
          busy = false;
          res.forEach((state, i) => {
            const k = keyEls[guess[i]];
            if (!k.dataset.state || RANK[state] > RANK[k.dataset.state]) k.dataset.state = state;
          });
          if (guess === answer) finish(true);
          else if (guesses.length === ROWS) finish(false);
        }, LEN * 260 + 250);
      }

      function shake(row) {
        row.classList.remove('shake');
        void row.offsetWidth;
        row.classList.add('shake');
      }

      function finish(won) {
        done = true;
        record.played++;
        if (won) {
          record.wins++;
          record.streak++;
          tiles[guesses.length - 1].forEach((t, i) => setTimeout(() => t.classList.add('bounce'), i * 90));
        } else {
          record.streak = 0;
        }
        GL.store.set('words:record', record);
        const best = api.submit(record.streak);
        stats(true);
        const praise = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'][guesses.length - 1];
        setTimeout(() => api.overlay({
          kicker: won ? (best ? 'New best streak' : praise) : 'Out of guesses',
          title: answer.toUpperCase(),
          text: won ? `Solved in ${guesses.length}/${ROWS}. Streak: ${record.streak}.` : 'Streak reset. Next one’s yours.',
          tone: won ? 'win' : 'lose',
          actions: [{ label: 'Next word', primary: true, onClick: reset }],
        }), won ? 900 : 400);
      }

      const off = GL.listen(window, 'keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const k = e.key;
        if (k === 'Enter' && api.stage.querySelector('.overlay:not([hidden])')) return;
        if (k === 'Enter') { e.preventDefault(); press('↵'); }
        else if (k === 'Backspace') press('⌫');
        else if (/^[a-z]$/i.test(k) && !(k.toLowerCase() === 'r' && done)) {
          e.stopPropagation();
          press(k.toLowerCase());
        }
      }, true);

      say('Loading words…', 60000);
      loadWords(() => {
        toast.classList.remove('show');
        reset();
      });

      return {
        restart: () => GL.WORDS && reset(),
        destroy() {
          off();
          clearTimeout(toastT);
        },
      };
    },
  });
})();
