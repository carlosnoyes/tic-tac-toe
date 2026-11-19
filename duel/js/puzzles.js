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
    blurb: 'Guess-free minesweeper race. Hitting a mine freezes you for 4s.',
    how: 'Tap to reveal, long-press / right-click (or 🚩 mode) to flag. Tap a number whose flags are all set to clear around it.',
    bot: { easy: 35, normal: 60, hard: 100 },
    create(root, api) {
      const [w, h, m] = pick(api.diff, [8, 8, 9], [9, 9, 13], [11, 11, 22]);
      const N = w * h;
      const nb = i => {
        const r = Math.floor(i / w), c = i % w, out = [];
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && rr < h && cc >= 0 && cc < w) out.push(rr * w + cc);
        }
        return out;
      };
      const NB = Array.from({ length: N }, (_, i) => nb(i));
      let mine, count, sr, sc;
      // Generate boards until one is solvable by pure logic from the opening (no guessing),
      // so the race is decided by skill. Deterministic: both players draw the same sequence.
      for (let attempt = 0; attempt < 60; attempt++) {
        mine = new Array(N).fill(false);
        const idxs = api.rng.shuffle(Array.from({ length: N }, (_, i) => i));
        sr = api.rng.range(1, h - 2); sc = api.rng.range(1, w - 2);
        const reserved = new Set();
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) reserved.add((sr + dr) * w + sc + dc);
        let placed = 0;
        for (const i of idxs) { if (placed >= m) break; if (!reserved.has(i)) { mine[i] = true; placed++; } }
        count = mine.map((_, i) => NB[i].filter(j => mine[j]).length);
        if (logicSolvable(sr * w + sc)) break;
      }
      function logicSolvable(startIdx) {
        const open = new Array(N).fill(false), flag = new Array(N).fill(false);
        let opened = 0;
        const openCell = i => {
          const st = [i];
          while (st.length) { const j = st.pop(); if (open[j] || mine[j]) continue; open[j] = true; opened++; if (!count[j]) NB[j].forEach(k => { if (!open[k]) st.push(k); }); }
        };
        openCell(startIdx);
        let progress = true;
        while (progress && opened < N - m) {
          progress = false;
          const cons = [];
          for (let i = 0; i < N; i++) {
            if (!open[i] || !count[i]) continue;
            const unk = NB[i].filter(j => !open[j] && !flag[j]);
            if (!unk.length) continue;
            const need = count[i] - NB[i].filter(j => flag[j]).length;
            if (need === 0) { unk.forEach(openCell); progress = true; }
            else if (need === unk.length) { unk.forEach(j => { flag[j] = true; }); progress = true; }
            else cons.push({ set: unk, need });
          }
          if (progress) continue;
          // subset rule: if A ⊂ B then B\A holds need(B)-need(A) mines
          outer: for (const a of cons) for (const b of cons) {
            if (a === b || a.set.length >= b.set.length) continue;
            if (!a.set.every(x => b.set.includes(x))) continue;
            const rest = b.set.filter(x => !a.set.includes(x)), dn = b.need - a.need;
            if (dn === 0) { rest.forEach(openCell); progress = true; break outer; }
            if (dn === rest.length) { rest.forEach(j => { flag[j] = true; }); progress = true; break outer; }
          }
        }
        return opened === N - m;
      }
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
        if (finished) return;
        if (revealed[i] && user) { chord(i); return; }
        if (revealed[i] || flagged[i]) return;
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
      // chording: tapping a revealed number whose flags are all placed opens the rest of its neighbours
      function chord(i) {
        if (!count[i]) return;
        const ns = nb(i);
        if (ns.filter(j => flagged[j]).length !== count[i]) return;
        ns.forEach(j => { if (!revealed[j] && !flagged[j]) reveal(j, true); });
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


  // ───────────────────────── Mini Sudoku ─────────────────────────
  register({
    id: 'sudoku', name: 'Mini Sudoku', icon: '🔷',
    blurb: 'A bite-size sudoku. Fill every row, column and box.',
    how: 'Each row, column and box holds every number once. Tap a cell, then a number (or type it).',
    bot: { easy: 30, normal: 75, hard: 110 },
    create(root, api) {
      const n = pick(api.diff, 4, 6, 6);
      const [br, bc] = n === 4 ? [2, 2] : [2, 3];
      const keepTarget = pick(api.diff, 7, 16, 12);
      const box = (r, c) => Math.floor(r / br) * (n / bc) + Math.floor(c / bc);
      const sol = new Array(n * n).fill(0);
      const ok = (g, i, v) => {
        const r = Math.floor(i / n), c = i % n;
        for (let k = 0; k < n; k++) {
          if (g[r * n + k] === v || g[k * n + c] === v) return false;
        }
        const r0 = Math.floor(r / br) * br, c0 = Math.floor(c / bc) * bc;
        for (let a = 0; a < br; a++) for (let b = 0; b < bc; b++) if (g[(r0 + a) * n + c0 + b] === v) return false;
        return true;
      };
      const digits = Array.from({ length: n }, (_, i) => i + 1);
      (function fill(i) {
        if (i === n * n) return true;
        for (const v of api.rng.shuffle(digits)) {
          if (ok(sol, i, v)) { sol[i] = v; if (fill(i + 1)) return true; sol[i] = 0; }
        }
        return false;
      })(0);
      const countSolutions = (g, limit) => {
        let cnt = 0;
        const i = g.indexOf(0);
        if (i < 0) return 1;
        for (let v = 1; v <= n && cnt < limit; v++) {
          if (ok(g, i, v)) { g[i] = v; cnt += countSolutions(g, limit - cnt); g[i] = 0; }
        }
        return cnt;
      };
      const puzzle = sol.slice();
      let kept = n * n;
      for (const i of api.rng.shuffle(Array.from({ length: n * n }, (_, k) => k))) {
        if (kept <= keepTarget) break;
        const v = puzzle[i]; puzzle[i] = 0;
        if (countSolutions(puzzle.slice(), 2) !== 1) puzzle[i] = v; else kept--;
      }
      const given = puzzle.map(v => v !== 0);
      const grid = puzzle.slice();
      const empties = given.filter(g => !g).length;
      let sel = given.indexOf(false);
      const board = el('div', { class: 'grid sudoku-grid sz' + n, style: { gridTemplateColumns: `repeat(${n}, 1fr)` } });
      const cells = grid.map((v, i) => {
        const r = Math.floor(i / n), c = i % n;
        const cls = ['scell'];
        if (given[i]) cls.push('given');
        if ((c + 1) % bc === 0 && c < n - 1) cls.push('bR');
        if ((r + 1) % br === 0 && r < n - 1) cls.push('bB');
        const d = el('button', { class: cls.join(' ') }, v ? String(v) : '');
        onPress(d, () => { if (!given[i]) { sel = i; draw(); } });
        board.appendChild(d); return d;
      });
      const pad = el('div', { class: 'numpad' });
      digits.concat([0]).forEach(v => {
        const b = el('button', { class: 'nkey' }, v ? String(v) : '⌫');
        onPress(b, () => input(v));
        pad.appendChild(b);
      });
      function input(v) {
        if (sel < 0 || given[sel]) return;
        grid[sel] = v; Sound.click();
        // auto-advance to next empty cell
        if (v) {
          const order = Array.from({ length: n * n }, (_, k) => (sel + 1 + k) % (n * n));
          const nx = order.find(k => !given[k] && grid[k] === 0);
          if (nx != null && conflicts(sel) === false) sel = nx;
        }
        draw();
      }
      function conflicts(i) {
        const v = grid[i]; if (!v) return false;
        const g = grid.slice(); g[i] = 0;
        return !ok(g, i, v);
      }
      function draw() {
        let correct = 0, full = true, anyBad = false;
        cells.forEach((d, i) => {
          d.textContent = grid[i] ? String(grid[i]) : '';
          const bad = !given[i] && conflicts(i);
          if (bad) anyBad = true;
          d.classList.toggle('bad', bad);
          d.classList.toggle('sel', i === sel);
          const r = Math.floor(i / n), c = i % n, sr = Math.floor(sel / n), sc = sel % n;
          d.classList.toggle('peer', sel >= 0 && i !== sel && (r === sr || c === sc || box(r, c) === box(sr, sc)));
          if (!grid[i]) full = false;
          if (!given[i] && grid[i] === sol[i]) correct++;
        });
        api.progress(correct / empties);
        if (full && !anyBad) api.done();
      }
      draw();
      root.append(board, pad);
      return {
        onKey(e) {
          const k = e.key;
          if (/^[1-9]$/.test(k) && +k <= n) { input(+k); e.preventDefault(); }
          else if (k === 'Backspace' || k === 'Delete' || k === '0') { input(0); e.preventDefault(); }
          else if (k.startsWith('Arrow')) {
            e.preventDefault();
            let r = Math.floor(sel / n), c = sel % n;
            if (k === 'ArrowUp') r = (r + n - 1) % n; if (k === 'ArrowDown') r = (r + 1) % n;
            if (k === 'ArrowLeft') c = (c + n - 1) % n; if (k === 'ArrowRight') c = (c + 1) % n;
            sel = r * n + c; draw();
          }
        },
        destroy() {},
      };
    },
  });

  // ───────────────────────── Code Breaker ─────────────────────────
  const PEGS = ['#ef5350', '#ffca28', '#66bb6a', '#42a5f5', '#ab47bc', '#ff7043', '#26c6da', '#ec407a'];
  const PEG_SYM = ['●', '▲', '■', '◆', '★', '✚', '⬢', '♥']; // colour-blind friendly markers
  register({
    id: 'code', name: 'Code Breaker', icon: '🔐',
    blurb: 'Crack the secret colour code with logic.',
    how: '● = right colour, right spot. ○ = right colour, wrong spot. Colours can repeat.',
    bot: { easy: 35, normal: 55, hard: 80 },
    create(root, api) {
      const [len, ncol] = pick(api.diff, [4, 5], [4, 6], [5, 7]);
      const secret = Array.from({ length: len }, () => api.rng.int(ncol));
      let cur = [], best = 0;
      const rowsBox = el('div', { class: 'code-rows' });
      const curRow = el('div', { class: 'code-row current' });
      const palette = el('div', { class: 'code-palette' });
      for (let c = 0; c < ncol; c++) {
        const b = el('button', { class: 'peg big', style: { background: PEGS[c] }, 'aria-label': 'colour ' + (c + 1) }, PEG_SYM[c]);
        onPress(b, () => { if (cur.length < len) { cur.push(c); Sound.click(); drawCur(); if (cur.length === len) setTimeout(submit, 120); } });
        palette.appendChild(b);
      }
      const back = el('button', { class: 'btn small' }, '⌫ Undo');
      onPress(back, () => { cur.pop(); drawCur(); });
      function drawCur() {
        curRow.innerHTML = '';
        for (let i = 0; i < len; i++) curRow.appendChild(el('span', { class: 'peg' + (cur[i] == null ? ' empty' : ''), style: cur[i] != null ? { background: PEGS[cur[i]] } : null }, cur[i] != null ? PEG_SYM[cur[i]] : ''));
      }
      function score(guess) {
        let blacks = 0, whites = 0;
        const sc = new Array(ncol).fill(0), gc = new Array(ncol).fill(0);
        guess.forEach((g, i) => { if (g === secret[i]) blacks++; else { sc[secret[i]]++; gc[g]++; } });
        for (let c = 0; c < ncol; c++) whites += Math.min(sc[c], gc[c]);
        return [blacks, whites];
      }
      let guesses = 0;
      function submit() {
        if (cur.length !== len) return;
        const [b, w] = score(cur);
        guesses++;
        const row = el('div', { class: 'code-row' },
          el('span', { class: 'code-n' }, String(guesses)),
          ...cur.map(c => el('span', { class: 'peg', style: { background: PEGS[c] } }, PEG_SYM[c])),
          el('span', { class: 'code-fb' }, '●'.repeat(b) + '○'.repeat(w) || '—'));
        rowsBox.prepend(row);
        best = Math.max(best, (b + w * 0.4) / len);
        cur = []; drawCur();
        if (b === len) { api.progress(1); api.done(); }
        else { api.progress(Math.min(0.95, best)); Sound.pop(); }
      }
      drawCur();
      root.append(el('div', { class: 'puzzle-note' }, `${len} pegs · ${ncol} colours`), curRow, palette, back, rowsBox);
      return {
        onKey(e) {
          if (/^[1-9]$/.test(e.key) && +e.key <= ncol && cur.length < len) { cur.push(+e.key - 1); drawCur(); if (cur.length === len) setTimeout(submit, 120); }
          if (e.key === 'Backspace') { cur.pop(); drawCur(); }
        },
        destroy() {},
      };
    },
  });

  // ───────────────────────── Quick Math ─────────────────────────
  register({
    id: 'math', name: 'Quick Math', icon: '➗',
    blurb: 'Ten sums against the clock. Mental arithmetic sprint.',
    how: 'Type the answer — it submits automatically when correct.',
    bot: { easy: 22, normal: 35, hard: 55 },
    create(root, api) {
      const COUNT = 10;
      const probs = [];
      for (let k = 0; k < COUNT; k++) {
        const ops = pick(api.diff, ['+', '-'], ['+', '-', '×'], ['+', '-', '×', '÷']);
        const op = api.rng.pick(ops);
        let a, b, ans;
        const big = pick(api.diff, 20, 50, 99);
        if (op === '+') { a = api.rng.range(2, big); b = api.rng.range(2, big); ans = a + b; }
        else if (op === '-') { a = api.rng.range(5, big); b = api.rng.range(1, a); ans = a - b; }
        else if (op === '×') { a = api.rng.range(2, pick(api.diff, 9, 12, 15)); b = api.rng.range(2, 12); ans = a * b; }
        else { b = api.rng.range(2, 12); ans = api.rng.range(2, 12); a = b * ans; }
        probs.push({ q: `${a} ${op} ${b}`, ans });
      }
      let idx = 0, typed = '';
      const qEl = el('div', { class: 'math-q' });
      const aEl = el('div', { class: 'math-a' });
      const dots = el('div', { class: 'math-dots' }, ...probs.map(() => el('span')));
      const pad = el('div', { class: 'numpad wide' });
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '⌫', '0', 'C'].forEach(k => {
        const b = el('button', { class: 'nkey' }, k);
        onPress(b, () => key(k));
        pad.appendChild(b);
      });
      function key(k) {
        if (idx >= COUNT) return;
        if (k === '⌫') typed = typed.slice(0, -1);
        else if (k === 'C') typed = '';
        else if (typed.length < 4) typed += k;
        check();
      }
      function check() {
        const p = probs[idx];
        aEl.textContent = typed || '?';
        if (+typed === p.ans && typed !== '') {
          Sound.good(); dots.children[idx].className = 'ok';
          idx++; typed = '';
          api.progress(idx / COUNT);
          if (idx >= COUNT) { api.done(); return; }
          draw();
        } else if (typed.length >= String(p.ans).length && typed.length >= 1 && !String(p.ans).startsWith(typed)) {
          Sound.bad(); shake(aEl); typed = '';
          setTimeout(() => { aEl.textContent = '?'; }, 200);
        }
      }
      function draw() { qEl.textContent = probs[idx].q + ' ='; aEl.textContent = '?'; dots.children[idx] && (dots.children[idx].className = 'cur'); }
      draw();
      root.append(dots, qEl, aEl, pad);
      return {
        onKey(e) {
          if (/^[0-9]$/.test(e.key)) { key(e.key); e.preventDefault(); }
          else if (e.key === 'Backspace') { key('⌫'); e.preventDefault(); }
        },
        destroy() {},
      };
    },
  });

  // ───────────────────────── Nonogram ─────────────────────────
  register({
    id: 'nono', name: 'Picross', icon: '🖼️',
    blurb: 'Paint the hidden picture from the number clues.',
    how: 'Clues list runs of filled squares in each row/column. Drag to paint; ✕ mode marks blanks.',
    bot: { easy: 30, normal: 60, hard: 95 },
    create(root, api) {
      const n = pick(api.diff, 5, 6, 8);
      let sol;
      const runs = line => { const out = []; let k = 0; line.forEach(v => { if (v) k++; else if (k) { out.push(k); k = 0; } }); if (k) out.push(k); return out.length ? out : [0]; };
      do { sol = Array.from({ length: n * n }, () => api.rng.chance(0.58)); }
      while (sol.filter(Boolean).length < n * n * 0.45);
      const row = (g, r) => g.slice(r * n, r * n + n);
      const col = (g, c) => Array.from({ length: n }, (_, r) => g[r * n + c]);
      const rowClues = Array.from({ length: n }, (_, r) => runs(row(sol, r)));
      const colClues = Array.from({ length: n }, (_, c) => runs(col(sol, c)));
      const st = new Array(n * n).fill(0); // 0 empty, 1 filled, 2 marked
      let mode = 1, painting = null;
      const table = el('div', { class: 'nono', style: { gridTemplateColumns: `auto repeat(${n}, 1fr)` } });
      table.appendChild(el('div'));
      const colEls = colClues.map(cl => { const d = el('div', { class: 'nclue col' }, ...cl.map(v => el('span', null, String(v)))); table.appendChild(d); return d; });
      const rowEls = [], cells = [];
      for (let r = 0; r < n; r++) {
        const rc = el('div', { class: 'nclue row' }, rowClues[r].join(' '));
        rowEls.push(rc); table.appendChild(rc);
        for (let c = 0; c < n; c++) {
          const i = r * n + c;
          const d = el('div', { class: 'ncell' + ((c + 1) % 5 === 0 && c < n - 1 ? ' bR' : '') + ((r + 1) % 5 === 0 && r < n - 1 ? ' bB' : '') });
          d.dataset.i = i;
          cells.push(d); table.appendChild(d);
        }
      }
      table.addEventListener('pointerdown', e => {
        const d = e.target.closest('.ncell'); if (!d) return;
        e.preventDefault();
        const i = +d.dataset.i;
        const m = e.button === 2 ? 2 : mode;
        painting = st[i] === m ? 0 : m;
        set(i);
      });
      table.addEventListener('pointermove', e => {
        if (painting == null) return;
        const t = document.elementFromPoint(e.clientX, e.clientY);
        const d = t && t.closest && t.closest('.ncell');
        if (d && table.contains(d)) set(+d.dataset.i);
      });
      const stop = () => { if (painting != null) { painting = null; check(); } };
      window.addEventListener('pointerup', stop);
      table.addEventListener('contextmenu', e => e.preventDefault());
      function set(i) {
        if (st[i] === painting) return;
        st[i] = painting; Sound.click();
        cells[i].className = cells[i].className.replace(/ (fill|mark)/g, '') + (painting === 1 ? ' fill' : painting === 2 ? ' mark' : '');
        check();
      }
      const same = (a, b) => a.length === b.length && a.every((v, k) => v === b[k]);
      function check() {
        const g = st.map(v => v === 1);
        let good = 0;
        for (let r = 0; r < n; r++) { const ok = same(runs(row(g, r)), rowClues[r]); rowEls[r].classList.toggle('ok', ok); if (ok) good++; }
        for (let c = 0; c < n; c++) { const ok = same(runs(col(g, c)), colClues[c]); colEls[c].classList.toggle('ok', ok); if (ok) good++; }
        api.progress(good / (2 * n) * 0.999);
        if (good === 2 * n) { api.progress(1); api.done(); }
      }
      const fillBtn = el('button', { class: 'btn small active' }, '⬛ Fill');
      const markBtn = el('button', { class: 'btn small' }, '✕ Mark');
      fillBtn.onclick = () => { mode = 1; fillBtn.classList.add('active'); markBtn.classList.remove('active'); };
      markBtn.onclick = () => { mode = 2; markBtn.classList.add('active'); fillBtn.classList.remove('active'); };
      check();
      root.append(el('div', { class: 'puzzle-toolbar' }, fillBtn, markBtn), table);
      return { destroy() { window.removeEventListener('pointerup', stop); }, onKey(e) { if (e.key === 'x' || e.key === 'X') (mode === 1 ? markBtn : fillBtn).click(); } };
    },
  });

  // ───────────────────────── Pipes ─────────────────────────
  // Bitmask per tile: 1=up 2=right 4=down 8=left
  register({
    id: 'pipes', name: 'Pipes', icon: '🚰',
    blurb: 'Rotate tiles until the whole network connects.',
    how: 'Tap a tile to rotate it. Connect every pipe with no loose ends — the water flows from the glowing source.',
    bot: { easy: 25, normal: 50, hard: 85 },
    create(root, api) {
      const n = pick(api.diff, 4, 5, 6);
      const N = n * n;
      const DIRS = [[-1, 0, 1, 4], [0, 1, 2, 8], [1, 0, 4, 1], [0, -1, 8, 2]]; // dr, dc, bit, opposite
      const mask = new Array(N).fill(0);
      // random spanning tree (randomised DFS / growing tree)
      const seen = new Array(N).fill(false);
      const start = api.rng.int(N);
      const stack = [start]; seen[start] = true;
      while (stack.length) {
        const i = api.rng.chance(0.7) ? stack[stack.length - 1] : stack[api.rng.int(stack.length)];
        const r = Math.floor(i / n), c = i % n;
        const opts = DIRS.filter(([dr, dc]) => { const rr = r + dr, cc = c + dc; return rr >= 0 && rr < n && cc >= 0 && cc < n && !seen[rr * n + cc]; });
        if (!opts.length) { stack.splice(stack.indexOf(i), 1); continue; }
        const [dr, dc, bit, opp] = api.rng.pick(opts);
        const j = (r + dr) * n + c + dc;
        mask[i] |= bit; mask[j] |= opp; seen[j] = true; stack.push(j);
      }
      const rot = m => ((m << 1) | (m >> 3)) & 15;
      const cur = mask.map(m => { let x = m; const k = api.rng.int(4); for (let t = 0; t < k; t++) x = rot(x); return x; });
      // make sure it's not already solved
      if (cur.every((m, i) => m === mask[i])) cur[0] = rot(cur[0]) === mask[0] ? rot(rot(cur[0])) : rot(cur[0]);
      const src = start;
      const grid = el('div', { class: 'grid pipes-grid', style: { gridTemplateColumns: `repeat(${n}, 1fr)` } });
      const rotations = cur.map(() => 0);
      const cells = cur.map((m, i) => {
        const d = el('button', { class: 'pipe' + (i === src ? ' src' : '') });
        d.innerHTML = pipeSvg(mask[i]);
        // rotation of the drawn solution shape so it shows cur[i]
        let k = 0, x = mask[i]; while (x !== m && k < 4) { x = rot(x); k++; }
        rotations[i] = k;
        d.firstChild.style.transform = `rotate(${k * 90}deg)`;
        onPress(d, () => { cur[i] = rot(cur[i]); rotations[i]++; d.firstChild.style.transform = `rotate(${rotations[i] * 90}deg)`; Sound.click(); check(); });
        grid.appendChild(d); return d;
      });
      function pipeSvg(m) {
        let p = '<svg viewBox="0 0 100 100"><g stroke-linecap="round">';
        const seg = { 1: 'M50 50 L50 0', 2: 'M50 50 L100 50', 4: 'M50 50 L50 100', 8: 'M50 50 L0 50' };
        let d = '';
        [1, 2, 4, 8].forEach(b => { if (m & b) d += seg[b] + ' '; });
        p += `<path d="${d}" stroke-width="22" class="pipe-bg"/><path d="${d}" stroke-width="12" class="pipe-fg"/>`;
        if ([1, 2, 4, 8].includes(m)) p += '<circle cx="50" cy="50" r="17" class="pipe-end"/>';
        else p += '<circle cx="50" cy="50" r="11" class="pipe-fg-c"/>';
        return p + '</g></svg>';
      }
      function check() {
        // flood from source through matching connections
        const wet = new Array(N).fill(false);
        const q = [src]; wet[src] = true;
        while (q.length) {
          const i = q.pop(); const r = Math.floor(i / n), c = i % n;
          DIRS.forEach(([dr, dc, bit, opp]) => {
            if (!(cur[i] & bit)) return;
            const rr = r + dr, cc = c + dc; if (rr < 0 || rr >= n || cc < 0 || cc >= n) return;
            const j = rr * n + cc;
            if (!wet[j] && (cur[j] & opp)) { wet[j] = true; q.push(j); }
          });
        }
        let wetCount = 0, leaks = 0;
        cells.forEach((d, i) => { d.classList.toggle('wet', wet[i]); if (wet[i]) wetCount++; });
        for (let i = 0; i < N; i++) {
          const r = Math.floor(i / n), c = i % n;
          DIRS.forEach(([dr, dc, bit, opp]) => {
            if (!(cur[i] & bit)) return;
            const rr = r + dr, cc = c + dc;
            if (rr < 0 || rr >= n || cc < 0 || cc >= n || !(cur[rr * n + cc] & opp)) leaks++;
          });
        }
        api.progress(Math.min(0.99, wetCount / N));
        if (wetCount === N && leaks === 0) { api.progress(1); api.done(); }
      }
      check();
      root.append(grid);
      return { destroy() {} };
    },
  });

  // ───────────────────────── Odd One Out ─────────────────────────
  const ODD_SETS = [['😀', '😃'], ['🐶', '🐱'], ['🍏', '🍎'], ['🌑', '🌚'], ['⭐', '🌟'], ['🔵', '🟣'], ['😐', '😑'], ['🕐', '🕑'], ['🐻', '🐼'], ['🌕', '🌝'], ['💙', '💜'], ['🍊', '🍑'], ['🐟', '🐠'], ['🚗', '🚙'], ['☁️', '🌥️'], ['🙂', '🙃'], ['🔶', '🔸'], ['🦆', '🐤'], ['🍪', '🥠'], ['🎃', '🍊']];
  register({
    id: 'odd', name: 'Odd One Out', icon: '👀',
    blurb: 'Spot the one emoji that doesn’t belong. Ten rapid levels.',
    how: 'Tap the single item that is different. Grids get bigger every level. Misses cost a freeze.',
    bot: { easy: 18, normal: 26, hard: 38 },
    create(root, api) {
      const LEVELS = 10;
      const sizes = pick(api.diff, [3, 3, 4, 4, 4, 5, 5, 5, 6, 6], [4, 4, 5, 5, 6, 6, 6, 7, 7, 7], [5, 5, 6, 6, 7, 7, 8, 8, 8, 8]);
      const levels = sizes.map(sz => {
        const [a, b] = api.rng.chance(0.5) ? api.rng.pick(ODD_SETS) : api.rng.pick(ODD_SETS).slice().reverse();
        return { sz, base: a, odd: b, at: api.rng.int(sz * sz) };
      });
      let lv = 0;
      const lvEl = el('div', { class: 'puzzle-note' });
      const grid = el('div', { class: 'grid odd-grid' });
      function draw() {
        const L = levels[lv];
        lvEl.textContent = `Level ${lv + 1} / ${LEVELS}`;
        grid.style.gridTemplateColumns = `repeat(${L.sz}, 1fr)`;
        grid.innerHTML = '';
        for (let i = 0; i < L.sz * L.sz; i++) {
          const d = el('button', { class: 'odd-cell', style: { fontSize: `${Math.max(0.9, 2.6 - L.sz * 0.22)}rem` } }, i === L.at ? L.odd : L.base);
          onPress(d, () => {
            if (i === L.at) {
              Sound.good(); lv++;
              api.progress(lv / LEVELS);
              if (lv >= LEVELS) { api.done(); return; }
              draw();
            } else { Sound.bad(); shake(grid); api.penalty(1500, 'Not that one!'); }
          });
          grid.appendChild(d);
        }
      }
      draw();
      root.append(lvEl, grid);
      return { destroy() {} };
    },
  });

  // ───────────────────────── Unscramble ─────────────────────────
  const WORDS = {"4": ["BAKE", "BALL", "BEAR", "BIRD", "BLUE", "BOAT", "BOOK", "CAKE", "CAMP", "CARD", "CAVE", "CITY", "COIN", "COLD", "CORN", "DARK", "DEER", "DESK", "DOOR", "DUCK", "EASY", "FARM", "FISH", "FLAG", "FROG", "GAME", "GIFT", "GOLD", "GOAT", "HAND", "HILL", "HOME", "JUMP", "KING", "KITE", "LAKE", "LAMP", "LEAF", "LION", "MILK", "MOON", "NEST", "NOTE", "PARK", "PINK", "RAIN", "ROAD", "ROCK", "ROOF", "ROPE", "SAND", "SHIP", "SNOW", "SOCK", "SOUP", "STAR", "SWIM", "TREE", "WAVE", "WIND", "WOLF", "YARD", "ZOOM"], "5": ["APPLE", "BEACH", "BRAIN", "BREAD", "BRICK", "CANDY", "CHAIR", "CHALK", "CLOCK", "CLOUD", "CROWN", "DANCE", "DREAM", "EAGLE", "EARTH", "FEAST", "FLAME", "FLUTE", "FROST", "GHOST", "GLOBE", "GRAPE", "GRASS", "HEART", "HONEY", "HORSE", "HOUSE", "JELLY", "JUICE", "KNIFE", "LEMON", "LIGHT", "MANGO", "MAGIC", "MONEY", "MOUSE", "MUSIC", "NIGHT", "OCEAN", "OLIVE", "PAINT", "PANDA", "PEARL", "PIANO", "PIZZA", "PLANT", "QUEEN", "RADIO", "RIVER", "ROBOT", "SALAD", "SHARK", "SHEEP", "SMILE", "SNAKE", "SPOON", "STORM", "SUGAR", "TABLE", "TIGER", "TOAST", "TRAIN", "TRUCK", "WATER", "WHALE", "WORLD", "ZEBRA"], "6": ["ANCHOR", "BASKET", "BRIDGE", "BUTTER", "CACTUS", "CAMERA", "CANDLE", "CARROT", "CASTLE", "CHEESE", "CIRCLE", "COFFEE", "COOKIE", "DONKEY", "DRAGON", "FLOWER", "FOREST", "GARDEN", "GUITAR", "HAMMER", "ISLAND", "JACKET", "JUNGLE", "KITTEN", "LADDER", "LIZARD", "MARBLE", "MIRROR", "MONKEY", "ORANGE", "PARROT", "PENCIL", "PEPPER", "PLANET", "POCKET", "POTATO", "PUZZLE", "RABBIT", "ROCKET", "SADDLE", "SILVER", "SPIDER", "SPRING", "SUMMER", "TEMPLE", "TICKET", "TOMATO", "TUNNEL", "TURTLE", "VIOLIN", "WINDOW", "WINTER", "WIZARD", "YELLOW"]};
  register({
    id: 'words', name: 'Unscramble', icon: '🔤', dictionary: WORDS,
    blurb: 'Five scrambled words. Unjumble them first.',
    how: 'Tap the letters (or type) to spell the hidden word. Any valid word using all the letters counts.',
    bot: { easy: 25, normal: 38, hard: 55 },
    create(root, api) {
      const len = pick(api.diff, 4, 5, 6);
      const list = WORDS[len];
      const sorted = w => w.split('').sort().join('');
      const valid = new Set(list);
      const COUNT = 5;
      const words = api.rng.shuffle(list).slice(0, COUNT);
      const scrambles = words.map(w => {
        let sc; let guard = 0;
        do { sc = api.rng.shuffle(w.split('')); guard++; } while (valid.has(sc.join('')) && guard < 20);
        return sc;
      });
      let idx = 0, picked = [];
      const dots = el('div', { class: 'math-dots' }, ...words.map(() => el('span')));
      const answer = el('div', { class: 'word-answer' });
      const tiles = el('div', { class: 'word-tiles' });
      const ctrl = el('div', { class: 'puzzle-toolbar' });
      const clr = el('button', { class: 'btn small' }, '⌫ Back');
      const shuffleBtn = el('button', { class: 'btn small' }, '🔀 Shuffle');
      onPress(clr, () => { picked.pop(); draw(); });
      let order = null;
      onPress(shuffleBtn, () => { order = api.rng.shuffle(order); draw(); });
      ctrl.append(clr, shuffleBtn);
      function setup() { picked = []; order = scrambles[idx].map((_, k) => k); draw(); dots.children[idx].className = 'cur'; }
      function draw() {
        const letters = scrambles[idx];
        answer.innerHTML = '';
        for (let k = 0; k < len; k++) answer.appendChild(el('span', { class: 'wslot' + (picked[k] != null ? ' full' : '') }, picked[k] != null ? letters[picked[k]] : ''));
        tiles.innerHTML = '';
        order.forEach(k => {
          const t = el('button', { class: 'wtile' + (picked.includes(k) ? ' used' : '') }, letters[k]);
          onPress(t, () => choose(k));
          tiles.appendChild(t);
        });
      }
      function choose(k) {
        if (picked.includes(k)) { picked = picked.slice(0, picked.indexOf(k)); draw(); return; }
        picked.push(k); Sound.click(); draw();
        if (picked.length === len) {
          const w = picked.map(i => scrambles[idx][i]).join('');
          if (valid.has(w) || w === words[idx]) {
            Sound.good(); dots.children[idx].className = 'ok';
            idx++; api.progress(idx / COUNT);
            if (idx >= COUNT) { api.done(); return; }
            setTimeout(setup, 120);
          } else {
            Sound.bad(); shake(answer);
            setTimeout(() => { picked = []; draw(); }, 250);
          }
        }
      }
      setup();
      root.append(dots, answer, tiles, ctrl);
      return {
        onKey(e) {
          if (idx >= COUNT) return;
          const k = e.key.toUpperCase();
          if (e.key === 'Backspace') { picked.pop(); draw(); e.preventDefault(); return; }
          if (/^[A-Z]$/.test(k)) {
            const letters = scrambles[idx];
            const j = order.find(i => letters[i] === k && !picked.includes(i));
            if (j != null) choose(j);
          }
        },
        destroy() {},
      };
    },
  });

  window.PD = window.PD || {};
  PD.Puzzles = { list: registry, byId, register, pick, onPress };
})();
