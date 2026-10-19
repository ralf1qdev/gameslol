(function () {
  'use strict';

  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const red = (c) => c.s === 1 || c.s === 2;
  const TAB_Y = 1.3; // tableau top, in card heights
  const DOWN_GAP = 0.11;
  const UP_GAP = 0.27;

  GL.register({
    id: 'solitaire',
    name: 'Solitaire',
    category: 'Strategy',
    hue: 145,
    tagline: 'Klondike, the classic patience game. Build up all four suits.',
    howTo: 'Move every card to the four foundations, Ace to King by suit. In the tableau, stack cards downward in alternating colours; only Kings go into empty columns. Click the deck to draw. Tap a card to send it to the best spot, or drag it where you want.',
    controls: [
      ['Click', 'Move a card to the best spot'],
      ['Drag', 'Move a card or a stack'],
      ['Space', 'Draw from the deck'],
      ['U', 'Undo'],
      ['R', 'New deal'],
    ],
    scoreLabel: 'Time',
    lowerIsBetter: true,
    homeVariant: '1',
    bestLabel: 'Fastest (draw 1)',
    format: (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,
    art: `<svg viewBox="0 0 160 100" aria-hidden="true" font-family="Inter,system-ui,sans-serif" font-weight="800"><rect x="40" y="22" width="40" height="56" rx="6" fill="#fff" opacity=".5" transform="rotate(-12 60 50)"/><rect x="62" y="18" width="40" height="56" rx="6" fill="#fff" transform="rotate(6 82 46)"/><text x="72" y="38" font-size="13" fill="#dc2626" transform="rotate(6 82 46)">A</text><text x="82" y="58" font-size="22" fill="#dc2626" text-anchor="middle" transform="rotate(6 82 46)">♥</text></svg>`,

    mount(api) {
      const { h } = GL;
      let drawCount = +GL.store.get('sol:draw', 1) === 3 ? 3 : 1;

      const board = h('div', { class: 'sol' });
      api.root.append(h('div', { class: 'sol-wrap' }, board));

      const undoBtn = h('button', { type: 'button', class: 'btn', html: 'Undo <kbd>U</kbd>', onclick: () => undo() });
      const hintBtn = h('button', { type: 'button', class: 'btn', html: 'Hint', onclick: () => hint() });
      api.options.append(
        GL.ui.segmented({
          label: 'Draw',
          value: String(drawCount),
          options: [{ value: '1', label: 'One card' }, { value: '3', label: 'Three cards' }],
          onChange: (v) => { drawCount = +v; GL.store.set('sol:draw', drawCount); deal(); },
        }),
        h('div', { class: 'actions' }, undoBtn, hintBtn));

      // pile slots
      const slot = (x, y, cls, label) => {
        const el = h('div', { class: 'sol-slot ' + cls, style: `--x:${x};--y:${y}` }, label || '');
        board.append(el);
        return el;
      };
      const stockSlot = slot(0, 0, 'stock', '↻');
      stockSlot.addEventListener('click', () => drawStock());
      slot(1, 0, 'waste');
      for (let f = 0; f < 4; f++) slot(3 + f, 0, 'found', SUITS[f]);
      for (let t = 0; t < 7; t++) slot(t, TAB_Y, 'tab', 'K');

      let st, history, els = new Map(), moves, startTime, timer, won, autoTimer;

      function deal() {
        clearInterval(timer);
        clearInterval(autoTimer);
        timer = null;
        won = false;
        moves = 0;
        api.setVariant(String(drawCount));
        const deck = [];
        let id = 0;
        for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) deck.push({ id: id++, s, r, up: false });
        for (let i = deck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        st = { stock: [], waste: [], found: [[], [], [], []], tab: [[], [], [], [], [], [], []] };
        for (let t = 0; t < 7; t++) {
          for (let k = 0; k <= t; k++) st.tab[t].push(deck.pop());
          st.tab[t][t].up = true;
        }
        st.stock = deck;
        history = [];
        els.forEach((el) => el.remove());
        els.clear();
        for (const c of allCards()) {
          const el = h('div', { class: 'card' + (red(c) ? ' red' : ''), 'data-id': c.id },
            h('span', { class: 'c-face' },
              h('span', { class: 'c-tl' }, RANKS[c.r], h('i', {}, SUITS[c.s] + '︎')),
              h('span', { class: 'c-mid' }, SUITS[c.s] + '︎'),
              h('span', { class: 'c-br' }, RANKS[c.r], h('i', {}, SUITS[c.s] + '︎'))),
            h('span', { class: 'c-back' }));
          el.addEventListener('pointerdown', (e) => pointerDown(e, c));
          els.set(c.id, el);
          board.append(el);
        }
        api.setScore(0, false);
        api.stat('moves', 'Moves', 0, false);
        api.hideOverlay();
        render(true);
      }

      const allCards = () => [...st.stock, ...st.waste, ...st.found.flat(), ...st.tab.flat()];
      const snapshot = () => JSON.stringify(st);

      function startClock() {
        if (timer || won) return;
        startTime = performance.now();
        timer = setInterval(() => api.setScore(Math.floor((performance.now() - startTime) / 1000), false), 500);
      }

      function commit(prev) {
        history.push(prev);
        if (history.length > 200) history.shift();
        moves++;
        api.stat('moves', 'Moves', moves);
        startClock();
        // flip newly exposed tableau cards
        for (const col of st.tab) if (col.length && !col[col.length - 1].up) col[col.length - 1].up = true;
        render();
        checkWin();
      }

      function drawStock() {
        if (won) return;
        const prev = snapshot();
        if (!st.stock.length) {
          if (!st.waste.length) return;
          st.stock = st.waste.reverse().map((c) => ({ ...c, up: false }));
          st.waste = [];
        } else {
          for (let k = 0; k < drawCount && st.stock.length; k++) {
            const c = st.stock.pop();
            c.up = true;
            st.waste.push(c);
          }
        }
        GL.sound.tone(700, 30, 'triangle', 0.02);
        commit(prev);
      }

      /* ---------- rules ---------- */
      function canFound(card, f) {
        const pile = st.found[f];
        if (card.s !== f) return false;
        return pile.length ? pile[pile.length - 1].r === card.r - 1 : card.r === 1;
      }
      function canTab(card, t) {
        const col = st.tab[t];
        if (!col.length) return card.r === 13;
        const top = col[col.length - 1];
        return top.up && red(top) !== red(card) && top.r === card.r + 1;
      }

      // Where is this card, and which cards would move with it?
      function locate(card) {
        if (st.waste.length && st.waste[st.waste.length - 1].id === card.id) return { from: 'waste', stack: [card] };
        for (let f = 0; f < 4; f++) {
          const p = st.found[f];
          if (p.length && p[p.length - 1].id === card.id) return { from: 'found', idx: f, stack: [card] };
        }
        for (let t = 0; t < 7; t++) {
          const k = st.tab[t].findIndex((c) => c.id === card.id);
          if (k >= 0 && st.tab[t][k].up) return { from: 'tab', idx: t, pos: k, stack: st.tab[t].slice(k) };
        }
        return null;
      }

      function removeStack(loc) {
        if (loc.from === 'waste') st.waste.pop();
        else if (loc.from === 'found') st.found[loc.idx].pop();
        else st.tab[loc.idx].splice(loc.pos);
      }

      function tryMove(loc, target) {
        const lead = loc.stack[0];
        if (target.type === 'found') {
          if (loc.stack.length !== 1 || !canFound(lead, target.idx)) return false;
          if (loc.from === 'found' && loc.idx === target.idx) return false;
        } else {
          if (loc.from === 'tab' && loc.idx === target.idx) return false;
          if (!canTab(lead, target.idx)) return false;
        }
        const prev = snapshot();
        removeStack(loc);
        if (target.type === 'found') st.found[target.idx].push(lead);
        else st.tab[target.idx].push(...loc.stack.map((c) => ({ ...c })));
        GL.sound.tone(target.type === 'found' ? 880 : 520, 45, 'triangle', 0.03);
        commit(prev);
        return true;
      }

      // Best destination for a tap: foundation first, then a non-empty column, then an empty one.
      function autoTarget(loc) {
        const lead = loc.stack[0];
        if (loc.stack.length === 1 && loc.from !== 'found' && canFound(lead, lead.s)) return { type: 'found', idx: lead.s };
        const cols = [...Array(7).keys()].filter((t) => !(loc.from === 'tab' && loc.idx === t) && canTab(lead, t));
        const nonEmpty = cols.find((t) => st.tab[t].length);
        // don't shuffle a King between empty columns
        if (nonEmpty !== undefined) return { type: 'tab', idx: nonEmpty };
        if (cols.length && !(loc.from === 'tab' && loc.pos === 0)) return { type: 'tab', idx: cols[0] };
        return null;
      }

      /* ---------- pointer handling ---------- */
      let drag = null;
      function pointerDown(e, card) {
        if (won || e.button > 0) return;
        if (st.stock.some((c) => c.id === card.id)) {
          e.preventDefault();
          return drawStock();
        }
        const loc = locate(card);
        if (!loc) return;
        e.preventDefault();
        const rect = board.getBoundingClientRect();
        drag = { loc, x0: e.clientX, y0: e.clientY, moved: false, rect, els: loc.stack.map((c) => els.get(c.id)) };
        window.addEventListener('pointermove', pointerMove);
        window.addEventListener('pointerup', pointerUp, { once: true });
      }

      function pointerMove(e) {
        if (!drag) return;
        const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
        if (!drag.moved && Math.hypot(dx, dy) < 5) return;
        drag.moved = true;
        drag.els.forEach((el, k) => {
          el.classList.add('dragging');
          el.style.zIndex = 500 + k;
          el.style.transform = `translate(${dx}px, ${dy}px)`;
        });
      }

      function pointerUp(e) {
        window.removeEventListener('pointermove', pointerMove);
        const d = drag;
        drag = null;
        if (!d) return;
        d.els.forEach((el) => {
          el.classList.remove('dragging');
          el.style.transform = '';
        });
        if (!d.moved) {
          const target = autoTarget(d.loc);
          if (!target || !tryMove(d.loc, target)) shake(d.els[0]);
          return;
        }
        const target = hitTest(e.clientX - d.rect.left, e.clientY - d.rect.top, d.rect.width);
        if (!target || !tryMove(d.loc, target)) render();
      }

      function hitTest(x, y, width) {
        const gap = width * 0.018;
        const cw = (width - gap * 6) / 7;
        const ch = cw * 1.4;
        const col = Math.max(0, Math.min(6, Math.floor((x + gap / 2) / (cw + gap))));
        if (y < ch * (TAB_Y - 0.1)) return col >= 3 ? { type: 'found', idx: col - 3 } : null;
        return { type: 'tab', idx: col };
      }

      function shake(el) {
        el.classList.remove('nope');
        void el.offsetWidth;
        el.classList.add('nope');
      }

      /* ---------- rendering ---------- */
      function place(c, x, y, z) {
        const el = els.get(c.id);
        el.style.setProperty('--x', x);
        el.style.setProperty('--y', y);
        el.style.zIndex = z;
        el.classList.toggle('up', c.up);
      }

      function render(instant) {
        board.classList.toggle('instant', !!instant);
        let z = 1;
        st.stock.forEach((c, k) => place(c, 0, -Math.min(k, 6) * 0.004, z++));
        const fanFrom = Math.max(0, st.waste.length - (drawCount === 3 ? 3 : 1));
        st.waste.forEach((c, k) => place(c, 1 + Math.max(0, k - fanFrom) * 0.22, 0, z++));
        st.found.forEach((p, f) => p.forEach((c) => place(c, 3 + f, 0, z++)));
        let extent = TAB_Y + 1.4;
        st.tab.forEach((col, t) => {
          let y = TAB_Y;
          col.forEach((c, k) => {
            place(c, t, y, z++);
            if (k < col.length - 1) y += c.up ? UP_GAP : DOWN_GAP;
          });
          extent = Math.max(extent, y + 1.05);
        });
        board.style.setProperty('--extent', extent);
        stockSlot.classList.toggle('empty', !st.stock.length && !!st.waste.length);
        undoBtn.disabled = !history.length;
        if (instant) requestAnimationFrame(() => board.classList.remove('instant'));
      }

      function undo() {
        if (!history.length || won) return;
        st = JSON.parse(history.pop());
        moves++;
        api.stat('moves', 'Moves', moves);
        render();
      }

      function hint() {
        if (won) return;
        const cands = [];
        if (st.waste.length) cands.push(locate(st.waste[st.waste.length - 1]));
        for (const col of st.tab) {
          const k = col.findIndex((c) => c.up);
          if (k >= 0) {
            cands.push(locate(col[k]));
            cands.push(locate(col[col.length - 1]));
          }
        }
        for (const loc of cands) {
          if (!loc) continue;
          const t = autoTarget(loc);
          // skip pointless moves of a whole column onto another column when nothing is uncovered
          if (t && !(t.type === 'tab' && loc.from === 'tab' && loc.pos === 0)) {
            loc.stack.forEach((c) => {
              const el = els.get(c.id);
              el.classList.remove('hinted');
              void el.offsetWidth;
              el.classList.add('hinted');
            });
            return;
          }
        }
        const el = st.stock.length ? els.get(st.stock[st.stock.length - 1].id) : stockSlot;
        el.classList.remove('hinted');
        void el.offsetWidth;
        el.classList.add('hinted');
      }

      function checkWin() {
        if (st.found.every((p) => p.length === 13)) return win();
        const allUp = !st.stock.length && !st.waste.length && st.tab.every((col) => col.every((c) => c.up));
        if (allUp && !autoTimer) {
          autoTimer = setInterval(() => {
            // move the lowest-ranked available card up
            let best = null;
            st.tab.forEach((col, t) => {
              const c = col[col.length - 1];
              if (c && canFound(c, c.s) && (!best || c.r < best.c.r)) best = { c, t };
            });
            if (!best) { clearInterval(autoTimer); autoTimer = null; return; }
            st.tab[best.t].pop();
            st.found[best.c.s].push(best.c);
            GL.sound.tone(600 + best.c.r * 30, 40, 'triangle', 0.025);
            render();
            if (st.found.every((p) => p.length === 13)) {
              clearInterval(autoTimer);
              autoTimer = null;
              win();
            }
          }, 90);
        }
      }

      function win() {
        if (won) return;
        won = true;
        clearInterval(timer);
        const secs = Math.max(1, Math.floor((performance.now() - startTime) / 1000));
        api.setScore(secs, false);
        const record = api.submit(secs);
        board.classList.add('won');
        setTimeout(() => api.overlay({
          kicker: record ? 'New fastest win' : 'Solved',
          title: api.format(secs),
          text: `${moves} moves · draw ${drawCount}.`,
          tone: 'win',
          actions: [{ label: 'Deal again', primary: true, onClick: () => { board.classList.remove('won'); deal(); } }],
        }), 700);
      }

      const off = GL.listen(window, 'keydown', (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
        const k = e.key.toLowerCase();
        if (k === ' ' || k === 'd') { e.preventDefault(); drawStock(); }
        else if (k === 'u') undo();
      });

      deal();
      return {
        restart: () => { board.classList.remove('won'); deal(); },
        destroy() {
          clearInterval(timer);
          clearInterval(autoTimer);
          off();
          window.removeEventListener('pointermove', pointerMove);
        },
      };
    },
  });
})();
