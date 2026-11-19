/* Puzzle Duel — race puzzles.
 * Every puzzle is generated from a shared seed so both players race on the identical board.
 * Interface: create(root, api) -> { destroy(), onKey?(e) }
 *   api.rng        seeded RNG
 *   api.diff       'easy' | 'normal' | 'hard'
 *   api.progress(p) report 0..1 progress (opponent sees it live)
 *   api.done()     puzzle solved
 *   api.penalty(ms, reason) freeze the player for a moment
 */
(function () {
  'use strict';
  const { el, shake, Sound } = PD;
  const registry = [];
  const byId = {};
  function register(p) { registry.push(p); byId[p.id] = p; }

  function pick(diff, easy, normal, hard) { return diff === 'easy' ? easy : diff === 'hard' ? hard : normal; }

  // Bind a press handler that responds instantly on touch and mouse without double firing.
  function onPress(node, fn) {
    node.addEventListener('pointerdown', e => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      fn(e);
    });
  }

  // ───────────────────────── Number Hunt ─────────────────────────
  register({
    id: 'hunt', name: 'Number Hunt', icon: '🔢',
    blurb: 'Tap the numbers in order, as fast as you can.',
    how: 'Tap 1, 2, 3… in order. Wrong taps cost a short freeze.',
    bot: { easy: 22, normal: 30, hard: 48 },
    create(root, api) {
      const n = pick(api.diff, 4, 5, 6);
      const total = n * n;
      const nums = api.rng.shuffle(Array.from({ length: total }, (_, i) => i + 1));
      let next = 1, frozen = false;
      const target = el('div', { class: 'hunt-target' }, 'Find ', el('b', null, '1'));
      const grid = el('div', { class: 'grid hunt-grid', style: { gridTemplateColumns: `repeat(${n}, 1fr)` } });
      const hues = nums.map(() => api.rng.int(360));
      nums.forEach((v, i) => {
        const c = el('button', { class: 'hunt-cell', style: { color: `hsl(${hues[i]},80%,72%)`, fontSize: `${api.rng.range(85, 125) / 100}em` } }, String(v));
        onPress(c, () => {
          if (frozen || c.classList.contains('found')) return;
          if (v === next) {
            c.classList.add('found'); Sound.good();
            next++;
            api.progress((next - 1) / total);
            if (next > total) api.done();
            else target.querySelector('b').textContent = String(next);
          } else {
            Sound.bad(); shake(c);
            api.penalty(1000, 'Wrong number!');
          }
        });
        grid.appendChild(c);
      });
      root.append(target, grid);
      return { destroy() {} };
    },
  });

  // ───────────────────────── Slide ─────────────────────────
  register({
    id: 'slide', name: 'Slide', icon: '🧩',
    blurb: 'Classic sliding tiles. Put them back in order.',
    how: 'Tap a tile in the blank’s row or column to slide it. Arrow keys work too.',
    bot: { easy: 25, normal: 70, hard: 110 },
    create(root, api) {
      const n = pick(api.diff, 3, 3, 4);
      const scramble = pick(api.diff, 40, 120, 150);
      const N = n * n;
      let board = Array.from({ length: N }, (_, i) => (i + 1) % N); // 0 = blank, last
      let blank = N - 1, prev = -1;
      const neighbors = i => {
        const r = Math.floor(i / n), c = i % n, out = [];
        if (r > 0) out.push(i - n); if (r < n - 1) out.push(i + n);
        if (c > 0) out.push(i - 1); if (c < n - 1) out.push(i + 1);
        return out;
      };
      const solvedCount = () => board.reduce((a, v, i) => a + (v !== 0 && v === i + 1 ? 1 : 0), 0);
      do {
        for (let k = 0; k < scramble; k++) {
          const opts = neighbors(blank).filter(j => j !== prev);
          const j = api.rng.pick(opts);
          board[blank] = board[j]; board[j] = 0; prev = blank; blank = j;
        }
      } while (solvedCount() > (N - 1) * 0.5);

      const size = n === 3 ? 92 : 74;
      const wrap = el('div', { class: 'slide-board', style: { width: `${n * size}px`, height: `${n * size}px` } });
      const tiles = {};
      for (let v = 1; v < N; v++) {
        const t = el('div', { class: 'slide-tile', style: { width: `${size - 6}px`, height: `${size - 6}px` } }, String(v));
        onPress(t, () => tap(board.indexOf(v)));
        tiles[v] = t; wrap.appendChild(t);
      }
      function layout() {
        board.forEach((v, i) => {
          if (!v) return;
          const t = tiles[v];
          t.style.transform = `translate(${(i % n) * size + 3}px, ${Math.floor(i / n) * size + 3}px)`;
          t.classList.toggle('home', v === i + 1);
        });
      }
      function moveFrom(j) { board[blank] = board[j]; board[j] = 0; blank = j; }
      function tap(i) {
        const r = Math.floor(i / n), c = i % n, br = Math.floor(blank / n), bc = blank % n;
        if (r !== br && c !== bc) { shake(tiles[board[i]]); return; }
        const step = r === br ? (c < bc ? -1 : 1) : (r < br ? -n : n);
        while (blank !== i) moveFrom(blank + step);
        Sound.click(); after();
      }
      function after() {
        layout();
        const s = solvedCount();
        api.progress(s / (N - 1));
        if (s === N - 1) api.done();
      }
      layout();
      api.progress(solvedCount() / (N - 1));
      root.append(wrap);
      return {
        onKey(e) {
          const r = Math.floor(blank / n), c = blank % n;
          let j = -1;
          if (e.key === 'ArrowUp' && r < n - 1) j = blank + n;
          if (e.key === 'ArrowDown' && r > 0) j = blank - n;
          if (e.key === 'ArrowLeft' && c < n - 1) j = blank + 1;
          if (e.key === 'ArrowRight' && c > 0) j = blank - 1;
          if (j >= 0) { e.preventDefault(); moveFrom(j); Sound.click(); after(); }
        },
        destroy() {},
      };
    },
  });

  // ───────────────────────── Lights Out ─────────────────────────
  register({
    id: 'lights', name: 'Lights Out', icon: '💡',
    blurb: 'Every tap flips a plus-shape. Turn all the lights off.',
    how: 'Tapping a light toggles it and its 4 neighbours. Get the board fully dark.',
    bot: { easy: 15, normal: 35, hard: 60 },
    create(root, api) {
      const n = 5;
      const presses = pick(api.diff, 3, 6, 9);
      let on;
      do {
        on = new Array(n * n).fill(false);
        const cells = api.rng.shuffle(Array.from({ length: n * n }, (_, i) => i)).slice(0, presses);
        cells.forEach(i => toggle(i));
      } while (on.filter(Boolean).length < presses);
      const initial = on.filter(Boolean).length;
      function toggle(i) {
        const r = Math.floor(i / n), c = i % n;
        [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dr, dc]) => {
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && rr < n && cc >= 0 && cc < n) on[rr * n + cc] = !on[rr * n + cc];
        });
      }
      const grid = el('div', { class: 'grid lights-grid', style: { gridTemplateColumns: `repeat(${n}, 1fr)` } });
      const cells = on.map((_, i) => {
        const c = el('button', { class: 'light' });
        onPress(c, () => { toggle(i); Sound.click(); draw(); });
        grid.appendChild(c); return c;
      });
      const moves = el('div', { class: 'puzzle-note' }, `Hint: it can be solved in ${presses} taps or fewer.`);
      function draw() {
        cells.forEach((c, i) => c.classList.toggle('on', on[i]));
        const lit = on.filter(Boolean).length;
        api.progress(Math.max(0, 1 - lit / Math.max(initial, 1)));
        if (lit === 0) api.done();
      }
      draw();
      root.append(grid, moves);
      return { destroy() {} };
    },
  });

  // ───────────────────────── Memory ─────────────────────────
  const EMOJI = ['🍎', '🚀', '🐙', '🎸', '🌵', '🍩', '⚡', '🦊', '🎲', '🌙', '🐝', '🍉', '👾', '🔥', '🦄', '🧊', '🍄', '⚓'];
  register({
    id: 'memory', name: 'Memory', icon: '🃏',
    blurb: 'Find all the matching pairs before your rival does.',
    how: 'Flip two cards at a time. Matching pairs stay face-up.',
    bot: { easy: 25, normal: 40, hard: 65 },
    create(root, api) {
      const [cols, rows] = pick(api.diff, [4, 3], [4, 4], [6, 4]);
      const pairs = cols * rows / 2;
      const faces = api.rng.shuffle(EMOJI).slice(0, pairs);
      const deck = api.rng.shuffle(faces.concat(faces));
      let open = [], found = 0, busy = false;
      const grid = el('div', { class: 'grid memory-grid', style: { gridTemplateColumns: `repeat(${cols}, 1fr)` } });
      const cards = deck.map((f, i) => {
        const c = el('button', { class: 'card' }, el('span', { class: 'card-back' }, '?'), el('span', { class: 'card-face' }, f));
        onPress(c, () => flip(i));
        grid.appendChild(c); return c;
      });
      function flip(i) {
        const c = cards[i];
        if (busy || c.classList.contains('up') || c.classList.contains('matched')) return;
        c.classList.add('up'); Sound.click();
        open.push(i);
        if (open.length === 2) {
          const [a, b] = open; open = [];
          if (deck[a] === deck[b]) {
            cards[a].classList.add('matched'); cards[b].classList.add('matched');
            found++; Sound.good();
            api.progress(found / pairs);
            if (found === pairs) api.done();
          } else {
            busy = true;
            setTimeout(() => { cards[a].classList.remove('up'); cards[b].classList.remove('up'); busy = false; }, 650);
          }
        }
      }
      root.append(grid);
      return { destroy() {} };
    },
  });

  // ───────────────────────── Minesweeper ─────────────────────────
  register({
    id: 'mines', name: 'Mine Dash', icon: '💣',
    blurb: 'Minesweeper race. Hitting a mine freezes you for 4 seconds.',
    how: 'Tap to reveal, long-press / right-click (or use 🚩 mode) to flag. Clear every safe square.',
    bot: { easy: 35, normal: 60, hard: 100 },
    create(root, api) {
      const [w, h, m] = pick(api.diff, [8, 8, 9], [9, 9, 13], [11, 11, 22]);
      const N = w * h;
      const mine = new Array(N).fill(false);
      const idxs = api.rng.shuffle(Array.from({ length: N }, (_, i) => i));
      // reserve a safe 3×3 opening around a seeded start cell
      const sr = api.rng.range(1, h - 2), sc = api.rng.range(1, w - 2);
      const reserved = new Set();
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) reserved.add((sr + dr) * w + sc + dc);
      let placed = 0;
      for (const i of idxs) { if (placed >= m) break; if (!reserved.has(i)) { mine[i] = true; placed++; } }
      const nb = i => {
        const r = Math.floor(i / w), c = i % w, out = [];
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && rr < h && cc >= 0 && cc < w) out.push(rr * w + cc);
        }
        return out;
      };
      const count = mine.map((_, i) => nb(i).filter(j => mine[j]).length);
      const revealed = new Array(N).fill(false), flagged = new Array(N).fill(false);
      const safeTotal = N - m;
      let safeRevealed = 0, flagMode = false, finished = false;

      const grid = el('div', { class: 'grid mines-grid', style: { gridTemplateColumns: `repeat(${w}, 1fr)` } });
      const cells = [];
      for (let i = 0; i < N; i++) {
        const c = el('button', { class: 'mcell' });
        let lp = null, longFired = false;
        c.addEventListener('pointerdown', e => {
          e.preventDefault();
          if (e.button === 2) { toggleFlag(i); return; }
          longFired = false;
          lp = setTimeout(() => { longFired = true; toggleFlag(i); if (navigator.vibrate) navigator.vibrate(20); }, 380);
        });
        const cancel = () => { clearTimeout(lp); lp = null; };
        c.addEventListener('pointerup', e => {
          if (e.button === 2) return;
          if (lp) { cancel(); if (!longFired) (flagMode ? toggleFlag(i) : reveal(i, true)); }
        });
        c.addEventListener('pointerleave', cancel);
        c.addEventListener('contextmenu', e => e.preventDefault());
        cells.push(c); grid.appendChild(c);
      }
      const flagBtn = el('button', { class: 'btn small', onclick: () => { flagMode = !flagMode; flagBtn.classList.toggle('active', flagMode); } }, '🚩 Flag mode');
      const info = el('span', { class: 'puzzle-note' }, `${m} mines`);
      const bar = el('div', { class: 'puzzle-toolbar' }, flagBtn, info);

      function toggleFlag(i) {
        if (revealed[i] || finished) return;
        flagged[i] = !flagged[i]; Sound.pop(); draw(i);
        info.textContent = `${m - flagged.filter(Boolean).length} mines left`;
      }
      function reveal(i, user) {
        if (revealed[i] || flagged[i] || finished) return;
        if (user && revealed[i] === false && mine[i]) {
          Sound.boom(); shake(grid);
          cells[i].classList.add('boom'); cells[i].textContent = '💥';
          setTimeout(() => { if (!revealed[i]) { cells[i].classList.remove('boom'); cells[i].textContent = ''; } }, 4000);
          api.penalty(4000, 'BOOM! Mine hit');
          return;
        }
        // flood fill
        const stack = [i];
        while (stack.length) {
          const j = stack.pop();
          if (revealed[j] || mine[j]) continue;
          if (flagged[j]) flagged[j] = false;
          revealed[j] = true; safeRevealed++; draw(j);
          if (count[j] === 0) nb(j).forEach(k => { if (!revealed[k]) stack.push(k); });
        }
        if (user) Sound.click();
        api.progress(safeRevealed / safeTotal);
        if (safeRevealed === safeTotal) { finished = true; api.done(); }
      }
      function draw(i) {
        const c = cells[i];
        c.className = 'mcell' + (revealed[i] ? ' open n' + count[i] : '') + (flagged[i] ? ' flag' : '');
        c.textContent = revealed[i] ? (count[i] || '') : flagged[i] ? '🚩' : '';
      }
      reveal(sr * w + sc, false);
      root.append(bar, grid);
      return {
        onKey(e) { if (e.key === 'f' || e.key === 'F') flagBtn.click(); },
        destroy() {},
      };
    },
  });

  window.PD = window.PD || {};
  PD.Puzzles = { list: registry, byId, register, pick, onPress };
})();
