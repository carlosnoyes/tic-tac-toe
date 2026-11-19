/* Puzzle Duel — app controller / match flow */
(function () {
  'use strict';
  const { el, fmtTime, Sound, store, makeRng, randomSeed, escapeHtml } = PD;
  const P = PD.Puzzles;
  const $ = id => document.getElementById(id);
  const VERSION = 1;

  const ADJ = ['Swift', 'Clever', 'Sneaky', 'Turbo', 'Cosmic', 'Mighty', 'Lucky', 'Fuzzy', 'Brainy', 'Zippy', 'Witty', 'Bold', 'Sly', 'Nimble', 'Quirky'];
  const NOUN = ['Otter', 'Falcon', 'Panda', 'Fox', 'Wizard', 'Ninja', 'Llama', 'Comet', 'Tiger', 'Pixel', 'Badger', 'Koala', 'Raven', 'Gecko', 'Yeti'];
  const randomName = () => ADJ[Math.floor(Math.random() * ADJ.length)] + NOUN[Math.floor(Math.random() * NOUN.length)];
  const EMOTES = ['👍', '😂', '😱', '🔥', '😤', '🤯', '🐢', 'GG'];
  const BOT_SKILL = { rookie: 1.7, pro: 1.0, master: 0.68 };
  const BOT_NAMES = { rookie: 'Bolt (Rookie)', pro: 'Cogsworth (Pro)', master: 'Deep Puzzle (Master)' };
  const TIME_LIMIT = { easy: 90, normal: 150, hard: 210 };

  const S = {
    mode: null,            // 'host' | 'guest' | 'bot' | 'local'
    net: null,
    code: null,
    oppName: null,
    connected: false,
    settings: Object.assign({ rounds: 5, diff: 'normal', bot: 'pro', order: 'random', powerups: 'on', pool: P.list.map(p => p.id) }, store('settings') || {}),
    match: null,
    round: null,
    rematch: { host: false, guest: false },
    local: { p2: store('p2name') || 'Player 2' },
  };
  // drop unknown puzzles from saved pool, add any new ones
  S.settings.pool = S.settings.pool.filter(id => P.byId[id]);
  if (!S.settings.pool.length) S.settings.pool = P.list.map(p => p.id);

  const myRole = () => (S.mode === 'guest' ? 'guest' : 'host');
  const oppRole = () => (S.mode === 'guest' ? 'host' : 'guest');
  const isAuthority = () => S.mode !== 'guest';
  const sideOf = role => (role === myRole() ? 'me' : 'opp');
  const nameOf = role => {
    if (S.mode === 'local') return role === 'host' ? myName() : S.local.p2;
    if (S.mode === 'bot') return role === 'host' ? myName() : BOT_NAMES[S.settings.bot];
    if (S.mode === 'daily') return role === 'host' ? myName() : (S.daily && S.daily.vs ? S.daily.vs.n : 'Par ⏱');
    if (S.mode === 'practice') return role === 'host' ? myName() : (S.practice && S.practice.best ? 'Your best 👻' : 'Par ⏱');
    return role === myRole() ? myName() : (S.oppName || 'Rival');
  };
  const myName = () => ($('name-input').value.trim() || 'Player');

  // ─────────────── screens / toasts ───────────────
  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    $('screen-' + id).classList.remove('hidden');
    window.scrollTo(0, 0);
  }
  let toastTimer;
  function toast(msg, error) {
    const t = $('toast');
    t.textContent = msg; t.className = 'toast' + (error ? ' error' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 3200);
  }
  function overlay(id, on) { $(id).classList.toggle('hidden', !on); }

  // ─────────────── home ───────────────
  function showChallengeIntro(vs) {
    const box = $('challenge-banner');
    const total = vs.t.every(t => t != null) ? fmtTime(vs.t.reduce((a, b) => a + b, 0)) : 'DNF';
    box.innerHTML = '';
    box.append(el('div', { class: 'cb-title' }, `⚔️ ${vs.n} challenged you!`),
      el('div', { class: 'muted small' }, `Daily puzzles from ${vs.d} · their total: ${total}. Race their ghost through the same 3 puzzles.`),
      el('button', { class: 'btn primary', onclick: () => { box.classList.add('hidden'); startDaily(vs); } }, 'Accept challenge'));
    box.classList.remove('hidden');
  }

  function renderHome() {
    renderDailyCard();
    document.querySelectorAll('.practice-diff .seg button').forEach(b => b.classList.toggle('on', b.dataset.v === (S.settings.diff || 'normal')));
    const list = $('puzzle-list'); list.innerHTML = '';
    const best = (store('stats') || {}).best || {};
    P.list.forEach(p => {
      const b = best[p.id + ':' + (S.settings.diff || 'normal')];
      list.appendChild(el('button', { class: 'pl-item', title: 'Practice ' + p.name, onclick: () => { Sound.click(); startPractice(p.id); } },
        el('div', { class: 'pl-icon' }, p.icon),
        el('div', null, el('div', { class: 'pl-name' }, p.name), el('div', { class: 'pl-blurb' }, p.blurb),
          b ? el('div', { class: 'pl-best' }, `⏱ Best (${S.settings.diff || 'normal'}): ` + fmtTime(b)) : null)));
    });
    const st = store('stats') || {};
    const box = $('home-stats');
    if (!st.played) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    box.innerHTML = '';
    box.append(el('h2', null, 'Your record'), el('div', { class: 'stats-grid' },
      stat(st.played || 0, 'Matches'), stat(st.won || 0, 'Wins'),
      stat(st.played ? Math.round(100 * (st.won || 0) / st.played) + '%' : '—', 'Win rate'),
      stat(st.rounds || 0, 'Rounds won')));
  }
  const stat = (v, l) => el('div', { class: 'stat' }, el('div', { class: 'stat-v' }, String(v)), el('div', { class: 'stat-l' }, l));

  function goHome() {
    teardownNet();
    endRoundUI();
    S.mode = null; S.match = null; S.round = null;
    overlay('result', false); overlay('countdown', false); overlay('handoff', false); overlay('pick', false);
    clearInterval(pickTimer); S.pickFor = null;
    history.replaceState(null, '', location.pathname + location.search);
    renderHome();
    show('home');
  }

  function teardownNet() {
    clearInterval(hbTimer); S.rtt = null; showPing();
    if (S.net) { try { S.net.send({ t: 'bye' }); } catch (e) {} S.net.close(); }
    S.net = null; S.connected = false; S.oppName = null;
  }

  // ─────────────── lobby ───────────────
  function openLobby() {
    const online = S.mode === 'host' || S.mode === 'guest';
    $('invite-panel').classList.toggle('hidden', !online);
    $('bot-setting').classList.toggle('hidden', S.mode !== 'bot');
    $('power-setting').classList.toggle('hidden', S.mode === 'local');
    $('lobby-title').textContent = S.mode === 'bot' ? 'Vs Bot' : S.mode === 'local' ? 'Pass & Play' : 'Online room';
    $('lobby-me').textContent = myName();
    $('lobby-me-role').textContent = S.mode === 'guest' ? 'Guest' : S.mode === 'local' ? 'Player 1' : 'Host';
    renderOppCard();
    renderSettings();
    updateStartButton();
    show('lobby');
  }

  function renderOppCard() {
    const card = $('lobby-opp-card');
    const nameEl = $('lobby-opp');
    nameEl.innerHTML = '';
    if (S.mode === 'bot') {
      card.classList.add('joined');
      nameEl.textContent = BOT_NAMES[S.settings.bot];
      $('lobby-opp-role').textContent = 'Bot' + (h2hText() ? ' · ' + h2hText() : '');
    } else if (S.mode === 'local') {
      card.classList.add('joined');
      const inp = el('input', { value: S.local.p2, maxlength: 16, style: { textAlign: 'center', width: '100%' } });
      inp.addEventListener('input', () => { S.local.p2 = inp.value.trim() || 'Player 2'; store('p2name', S.local.p2); });
      nameEl.appendChild(inp);
      $('lobby-opp-role').textContent = 'Player 2';
    } else {
      card.classList.toggle('joined', S.connected);
      nameEl.textContent = S.connected ? (S.oppName || 'Rival') : 'Waiting…';
      $('lobby-opp-role').textContent = S.connected ? (S.mode === 'host' ? 'Guest' : 'Host') + (h2hText() ? ' · ' + h2hText() : '') : '';
    }
  }

  function renderSettings() {
    const locked = S.mode === 'guest';
    $('settings-panel').classList.toggle('locked', locked);
    $('settings-lock').textContent = locked ? '(host decides)' : '';
    document.querySelectorAll('.seg').forEach(seg => {
      const key = seg.dataset.setting;
      seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', String(S.settings[key]) === b.dataset.v));
    });
    const pool = $('pool'); pool.innerHTML = '';
    P.list.forEach(p => {
      const on = S.settings.pool.includes(p.id);
      const item = el('div', { class: 'pool-item' + (on ? ' on' : '') }, el('span', null, p.icon), el('span', null, p.name));
      item.addEventListener('click', () => {
        if (locked) return;
        if (on && S.settings.pool.length === 1) { toast('Keep at least one puzzle.'); return; }
        S.settings.pool = on ? S.settings.pool.filter(x => x !== p.id) : S.settings.pool.concat(p.id);
        settingsChanged();
      });
      pool.appendChild(item);
    });
  }

  function settingsChanged() {
    store('settings', S.settings);
    renderSettings();
    renderOppCard();
    if (S.mode === 'host') send({ t: 'settings', settings: S.settings });
    if (!S.mode) renderHome();
  }

  function rivalKey() {
    return S.mode === 'bot' ? 'bot:' + S.settings.bot : 'p:' + (S.oppName || 'Rival').toLowerCase();
  }
  function h2hText() {
    const rec = ((store('stats') || {}).h2h || {})[rivalKey()];
    return rec ? `Your record: ${rec.w}W – ${rec.l}L` + (rec.d ? ` – ${rec.d}D` : '') : '';
  }

  function updateStartButton() {
    const btn = $('btn-start'), hint = $('start-hint');
    if (S.mode === 'guest') { btn.classList.add('hidden'); hint.textContent = S.connected ? 'Waiting for the host to start…' : 'Connecting…'; return; }
    btn.classList.remove('hidden');
    const ready = S.mode !== 'host' || S.connected;
    btn.disabled = !ready;
    hint.textContent = ready ? '' : 'Waiting for your friend to join…';
  }

  // ─────────────── networking ───────────────
  function send(m) { if (S.net && (S.mode === 'host' || S.mode === 'guest')) S.net.send(m); }

  function inviteLink() {
    return location.origin + location.pathname + location.search + '#' + S.code;
  }

  function startHost() {
    S.mode = 'host';
    S.code = PD.Net.makeCode();
    $('room-code').textContent = S.code;
    $('invite-hint').textContent = 'Connecting to matchmaking…';
    openLobby();
    S.net = PD.Net.create({
      onReady: () => { $('invite-hint').textContent = 'Send the link to a friend. Keep this tab open.'; },
      onOpen: () => {},
      onMessage: onMessage,
      onClose: () => onPeerLeft(),
      onError: (msg, type) => {
        if (type === 'unavailable-id') { teardownNet(); startHost(); return; }
        toast(msg, true);
        $('invite-hint').textContent = msg;
      },
    });
    S.net.host(S.code);
  }

  function startJoin(code) {
    code = PD.Net.normalizeCode(code);
    if (code.length < 4) { toast('Enter the room code your friend sent you.', true); return; }
    S.mode = 'guest';
    S.code = code;
    $('room-code').textContent = code;
    $('invite-hint').textContent = 'Connecting…';
    openLobby();
    S.net = PD.Net.create({
      onReady: () => {},
      onOpen: () => send({ t: 'hello', name: myName(), v: VERSION }),
      onStatus: msg => { $('start-hint').textContent = msg; },
      onMessage: onMessage,
      onClose: () => onPeerLeft(),
      onError: (msg) => { toast(msg, true); goHome(); },
    });
    S.net.join(code);
  }

  function onPeerLeft() {
    if (!S.connected) return;
    S.connected = false; S.rtt = null; showPing();
    const who = S.oppName || 'Your rival';
    toast(`${who} disconnected.`, true);
    if (S.mode === 'guest') { goHome(); return; }
    // host: back to lobby, keep room open for a new guest
    S.oppName = null;
    clearInterval(hbTimer);
    if (S.net && S.net.drop) S.net.drop();
    abortMatch();
    openLobby();
  }

  function abortMatch() {
    endRoundUI();
    S.match = null; S.round = null;
    overlay('result', false); overlay('countdown', false); overlay('pick', false);
    clearInterval(pickTimer); S.pickFor = null;
  }

  // ─────────────── heartbeat / latency ───────────────
  let hbTimer = null;
  function startHeartbeat() {
    clearInterval(hbTimer);
    S.lastSeen = Date.now();
    hbTimer = setInterval(() => {
      if (!S.net || !S.connected) return;
      send({ t: 'ping', ts: Date.now() });
      if (Date.now() - S.lastSeen > 15000) { toast('Connection lost.', true); onPeerLeft(); }
    }, 2000);
  }
  function showPing() {
    const txt = S.connected && S.rtt != null ? `📶 ${S.rtt} ms` : '';
    const q = S.rtt == null ? '' : S.rtt < 120 ? 'good' : S.rtt < 300 ? 'ok' : 'bad';
    ['hud-ping', 'lobby-ping'].forEach(id => { const e = $(id); if (e) { e.textContent = txt; e.className = 'ping ' + q; } });
  }

  function onMessage(m) {
    if (!m || typeof m !== 'object') return;
    S.lastSeen = Date.now();
    switch (m.t) {
      case 'ping': send({ t: 'pong', ts: m.ts }); return;
      case 'pong': S.rtt = Math.max(1, Date.now() - m.ts); showPing(); return;
      case 'hello': // guest → host
        if (S.mode !== 'host') return;
        S.connected = true;
        S.oppName = String(m.name || 'Rival').slice(0, 16);
        send({ t: 'welcome', name: myName(), settings: S.settings, v: VERSION });
        startHeartbeat();
        Sound.good();
        toast(`${S.oppName} joined!`);
        if (!S.match) { renderOppCard(); updateStartButton(); }
        break;
      case 'welcome': // host → guest
        S.connected = true;
        S.oppName = String(m.name || 'Host').slice(0, 16);
        S.settings = Object.assign(S.settings, m.settings);
        startHeartbeat();
        $('invite-hint').textContent = 'Connected!';
        Sound.good();
        renderOppCard(); renderSettings(); updateStartButton();
        break;
      case 'full':
        toast('That room is already full.', true); goHome();
        break;
      case 'settings':
        if (S.mode !== 'guest') return;
        S.settings = Object.assign(S.settings, m.settings);
        renderSettings(); updateStartButton();
        break;
      case 'name':
        S.oppName = String(m.name || 'Rival').slice(0, 16);
        renderOppCard();
        break;
      case 'match':
        if (S.mode !== 'guest') return;
        beginMatch(m.match);
        break;
      case 'round':
        if (S.mode !== 'guest') return;
        beginRound(m);
        break;
      case 'prog':
        if (S.round && m.i === S.round.i) {
          S.round.prog[oppRole()] = m.p;
          setBar(oppRole(), m.p);
        }
        break;
      case 'fin':
        if (!S.round || m.i !== S.round.i) return;
        markFinished(oppRole(), m.ms);
        if (isAuthority()) hostFinish(oppRole(), m.ms);
        break;
      case 'giveup':
        if (!S.round || m.i !== S.round.i) return;
        if (isAuthority()) hostGiveUp(oppRole());
        break;
      case 'result':
        if (S.mode !== 'guest') return;
        showResult(m);
        break;
      case 'pickreq':
        if (S.mode !== 'guest') return;
        showPick(m.picker);
        break;
      case 'picked':
        if (S.mode === 'guest') { markPicked(m.pid); return; }
        if (S.pickFor === 'guest') { S.pickFor = null; markPicked(m.pid); send({ t: 'picked', pid: m.pid }); setTimeout(() => hostNextRound(m.pid), 700); }
        break;
      case 'freeze':
        if (S.round && m.i === S.round.i) receiveFreeze();
        break;
      case 'emote':
        showEmote('opp', m.e);
        break;
      case 'rematch':
        S.rematch[oppRole()] = true;
        $('rematch-hint').textContent = `${S.oppName || 'Rival'} wants a rematch!`;
        if (S.mode === 'host' && S.rematch.host) hostStartMatch();
        break;
      case 'lobby':
        if (S.mode === 'guest') { abortMatch(); openLobby(); }
        break;
      case 'bye':
        onPeerLeft();
        break;
    }
  }

  // ─────────────── match flow (authority) ───────────────
  function hostStartMatch() {
    S.rematch = { host: false, guest: false };
    const match = {
      seed: randomSeed(),
      rounds: +S.settings.rounds,
      diff: S.settings.diff,
      pool: S.settings.pool.slice(),
      order: S.settings.order || 'random',
      powerups: S.mode !== 'local' && S.settings.powerups === 'on',
    };
    send({ t: 'match', match });
    beginMatch(match);
    setTimeout(() => hostNextRound(), 300);
  }

  function puzzleForRound(match, i) {
    // cycle through a seeded shuffle of the pool so puzzles don't repeat until all are used
    const cycle = Math.floor(i / match.pool.length);
    const order = makeRng(match.seed + cycle * 7919).shuffle(match.pool);
    return order[i % match.pool.length];
  }

  function hostNextRound(pidOverride) {
    const M = S.match; if (!M) return;
    overlay('pick', false); clearInterval(pickTimer);
    const i = M.history.length;
    const msg = {
      t: 'round', i,
      pid: (pidOverride && P.byId[pidOverride] && M.pool.includes(pidOverride)) ? pidOverride : puzzleForRound(M, i),
      seed: (M.seed ^ Math.imul(i + 1, 0x9E3779B1)) >>> 0,
      diff: M.diff,
      limit: TIME_LIMIT[M.diff] || 150,
    };
    send(msg);
    beginRound(msg);
  }

  function hostFinish(role, ms) {
    const R = S.round; if (!R || R.resolved) return;
    if (R.times[role] == null) R.times[role] = ms;
    if (S.mode === 'local') return; // local resolves after both turns
    if (R.times.host != null && R.times.guest != null) hostResolve();
    else if (!R.grace) R.grace = setTimeout(hostResolve, 900);
  }

  function hostGiveUp(role) {
    const R = S.round; if (!R || R.resolved) return;
    R.gaveUp[role] = true;
    if (S.mode === 'local') return;
    hostResolve();
  }

  function hostResolve() {
    const R = S.round, M = S.match; if (!R || R.resolved || !M) return;
    R.resolved = true;
    clearTimeout(R.grace); clearTimeout(R.limitTimer);
    const t = R.times, g = R.gaveUp;
    let winner = null, reason = 'time';
    if (g.host && !g.guest) { winner = 'guest'; reason = 'giveup'; }
    else if (g.guest && !g.host) { winner = 'host'; reason = 'giveup'; }
    else if (t.host != null || t.guest != null) {
      if (t.guest == null || (t.host != null && t.host < t.guest)) winner = 'host';
      else if (t.host == null || t.guest < t.host) winner = 'guest';
    } else {
      reason = 'progress';
      const ph = R.prog.host || 0, pg = R.prog.guest || 0;
      if (Math.abs(ph - pg) > 0.001) winner = ph > pg ? 'host' : 'guest';
    }
    if (winner) M.scores[winner]++;
    const entry = { i: R.i, pid: R.pid, winner, reason, times: { ...t }, prog: { ...R.prog } };
    M.history.push(entry);
    const target = M.playAll ? Infinity : Math.floor(M.rounds / 2) + 1;
    let over = false, matchWinner = null;
    if (M.playAll) {
      if (M.history.length >= M.rounds) {
        over = true;
        if (M.scores.host !== M.scores.guest) matchWinner = M.scores.host > M.scores.guest ? 'host' : 'guest';
      }
    } else if (M.scores.host >= target) { over = true; matchWinner = 'host'; }
    else if (M.scores.guest >= target) { over = true; matchWinner = 'guest'; }
    else if (M.history.length >= M.rounds && M.scores.host !== M.scores.guest) { over = true; matchWinner = M.scores.host > M.scores.guest ? 'host' : 'guest'; }
    else if (M.history.length >= M.rounds + 4) { over = true; matchWinner = null; } // safety: too many draws
    const msg = { t: 'result', ...entry, scores: { ...M.scores }, over, matchWinner };
    send(msg);
    showResult(msg);
  }

  // ─────────────── match flow (both sides) ───────────────
  function beginMatch(match) {
    S.match = Object.assign({}, match, { scores: { host: 0, guest: 0 }, history: [] });
    S.rematch = { host: false, guest: false };
    $('hud-me-name').textContent = S.mode === 'local' ? myName() : myName();
    $('hud-opp-name').textContent = nameOf(oppRole());
    updateScores();
    show('game');
  }

  function updateScores() {
    const M = S.match; if (!M) return;
    $('hud-me-score').textContent = M.scores[myRole()];
    $('hud-opp-score').textContent = M.scores[oppRole()];
  }

  function setBar(role, p) {
    const side = sideOf(role);
    $('hud-' + side + '-bar').style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%';
  }

  function markFinished(role, ms) {
    const side = sideOf(role);
    $('hud-' + side + '-bar').parentElement.parentElement.classList.add('finished');
    setBar(role, 1);
    if (S.round && role !== myRole() && !S.round.myDone) {
      Sound.bad();
      toast(`${nameOf(role)} finished in ${fmtTime(ms)}!`);
    }
  }

  function beginRound(msg) {
    endRoundUI();
    overlay('result', false); overlay('pick', false); clearInterval(pickTimer); S.pickFor = null;
    const pz = P.byId[msg.pid];
    const R = S.round = {
      i: msg.i, pid: msg.pid, seed: msg.seed, diff: msg.diff, limit: msg.limit,
      times: { host: null, guest: null }, gaveUp: { host: false, guest: false }, prog: { host: 0, guest: 0 },
      resolved: false, myDone: false, active: false, frozenUntil: 0,
      turn: S.mode === 'local' ? 'host' : null, samples: [],
    };
    document.querySelectorAll('.hud-player').forEach(h => h.classList.remove('finished'));
    setBar('host', 0); setBar('guest', 0);
    updateScores();
    $('hud-round').textContent = `Round ${R.i + 1}` + (S.match && R.i >= S.match.rounds ? ' · Tiebreak' : '');
    $('hud-timer').textContent = fmtTime(0); $('hud-timer').classList.remove('low');
    $('ph-icon').textContent = pz.icon; $('ph-name').textContent = pz.name; $('ph-how').textContent = pz.how;

    if (S.mode === 'local') {
      $('hud-me-name').textContent = myName();
      $('hud-opp-name').textContent = S.local.p2;
      handoff('host', () => runAttempt());
    } else runAttempt();
  }

  // One player's attempt at the current round's puzzle (online: the only attempt; local: one per player)
  function runAttempt() {
    const R = S.round, pz = P.byId[R.pid];
    const stage = $('stage');
    stage.innerHTML = ''; stage.style.visibility = 'hidden';
    overlay('waiting', false); overlay('penalty', false);
    const actor = S.mode === 'local' ? R.turn : myRole();
    let lastSent = 0, pendingProg = null, progTimer = null, lastP = 0;
    const api = {
      rng: makeRng(R.seed),
      diff: R.diff,
      progress(p) {
        if (!R.startAt) { R.initProg = p; return; } // reported while building, before GO
        if (!R.active) return;
        lastP = p; R.prog[actor] = p; setBar(actor, p);
        if (p >= 0.5 && !R.powerUsed) updatePowerButton();
        R.samples.push([performance.now() - R.startAt, p]);
        if (S.mode === 'host' || S.mode === 'guest') {
          const now = performance.now();
          pendingProg = p;
          const flush = () => { progTimer = null; if (pendingProg != null) { send({ t: 'prog', i: R.i, p: pendingProg }); pendingProg = null; lastSent = performance.now(); } };
          if (now - lastSent > 120) flush(); else if (!progTimer) progTimer = setTimeout(flush, 120);
        }
      },
      done() {
        if (!R.active) return;
        const ms = performance.now() - R.startAt;
        finishAttempt(actor, ms);
      },
      penalty(ms, reason) {
        if (!R.active) return;
        R.frozenUntil = performance.now() + ms;
        $('pen-msg').textContent = reason || 'Penalty!';
        overlay('penalty', true);
        if (navigator.vibrate) navigator.vibrate(120);
      },
    };
    R.attempt = { actor, api, flushProg: () => { if (progTimer) { clearTimeout(progTimer); progTimer = null; } if (pendingProg != null) send({ t: 'prog', i: R.i, p: pendingProg }); } };
    try { R.puzzle = pz.create(stage, api); }
    catch (err) { console.error(err); stage.textContent = 'Puzzle failed to load: ' + err.message; }

    countdown(pz, () => {
      if (S.round !== R) return;
      stage.style.visibility = '';
      R.active = true; R.startAt = performance.now();
      R.myDone = false;
      if (R.initProg) api.progress(R.initProg);
      updatePowerButton();
      if (S.mode === 'bot') startBot(R);
      if (S.mode === 'daily' || S.mode === 'practice') startDailyGhost(R);
      if (S.mode === 'local' && R.turn === 'guest') startGhost(R);
      if (isAuthority() && S.mode !== 'local') {
        R.limitTimer = setTimeout(() => { if (S.round === R) { timeUp(); hostResolve(); } }, R.limit * 1000 + 600);
      }
      tickTimer();
    });
  }

  function finishAttempt(actor, ms) {
    const R = S.round;
    R.active = false; R.myDone = true;
    R.attempt && R.attempt.flushProg();
    markFinished(actor, ms);
    recordBest(R.pid, R.diff, ms, actor);
    Sound.win();
    if (S.mode === 'local') { localTurnOver(actor, ms, false); return; }
    send({ t: 'fin', i: R.i, ms });
    $('wait-msg').innerHTML = `Solved in <b>${fmtTime(ms)}</b>!<br><span class="muted small">Waiting for the result…</span>`;
    overlay('waiting', true);
    if (isAuthority()) hostFinish(myRole(), ms);
  }

  function recordBest(pid, diff, ms, actor) {
    if (S.mode === 'local' && actor !== 'host') return;
    const st = store('stats') || {};
    st.best = st.best || {};
    const k = pid + ':' + diff;
    if (!st.best[k] || ms < st.best[k]) {
      const had = !!st.best[k];
      st.best[k] = Math.round(ms);
      store('stats', st);
      if (had) toast('🏅 New personal best!');
    }
  }

  function timeUp() {
    const R = S.round; if (!R || !R.active) return;
    R.active = false;
    R.attempt && R.attempt.flushProg();
    $('wait-msg').innerHTML = `⏰ Time's up!<br><span class="muted small">Most progress wins the round.</span>`;
    overlay('waiting', true);
    if (S.mode === 'local') localTurnOver(R.turn, null, false);
  }

  function giveUp() {
    const R = S.round; if (!R || !R.active) return;
    if (!confirm('Give up this round?')) return;
    R.active = false;
    $('wait-msg').innerHTML = `🏳️ You gave up this round.`;
    overlay('waiting', true);
    if (S.mode === 'local') { localTurnOver(R.turn, null, true); return; }
    send({ t: 'giveup', i: R.i });
    if (isAuthority()) hostGiveUp(myRole());
  }

  let rafId = null;
  function tickTimer() {
    cancelAnimationFrame(rafId);
    const loop = () => {
      const R = S.round;
      if (!R || !R.startAt) return;
      if (R.active) {
        const now = performance.now();
        const t = now - R.startAt;
        const left = R.limit * 1000 - t;
        const tm = $('hud-timer');
        tm.textContent = left < 30000 ? fmtTime(Math.max(0, left)) : fmtTime(t);
        tm.classList.toggle('low', left < 30000);
        if (left <= 0) { timeUp(); }
        // penalty overlay
        if (R.frozenUntil) {
          const fl = R.frozenUntil - now;
          if (fl <= 0) { R.frozenUntil = 0; overlay('penalty', false); }
          else $('pen-time').textContent = (fl / 1000).toFixed(1);
        }
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
  }

  function endRoundUI() {
    const R = S.round;
    if (R) {
      R.active = false;
      clearTimeout(R.grace); clearTimeout(R.limitTimer);
      if (R.bot) clearInterval(R.bot);
      if (R.ghost) clearInterval(R.ghost);
      try { R.puzzle && R.puzzle.destroy && R.puzzle.destroy(); } catch (e) {}
    }
    cancelAnimationFrame(rafId);
    overlay('penalty', false); overlay('waiting', false);
    if ($('btn-power')) { $('btn-power').disabled = true; $('btn-power').classList.remove('ready'); }
    clearInterval(cdTimer);
  }

  let cdTimer = null;
  function countdown(pz, then) {
    const M = S.match, R = S.round;
    let ctxTxt = '';
    if (M && R) {
      if (S.mode === 'practice') ctxTxt = 'Practice · ' + R.diff;
      else if (S.mode === 'daily') ctxTxt = `Daily ${S.daily.date} · puzzle ${R.i + 1} of 3`;
      else {
        const who = S.mode === 'local' ? `${nameOf(R.turn)}'s turn · ` : '';
        ctxTxt = `${who}Round ${R.i + 1} · ${nameOf(myRole())} ${M.scores[myRole()]} – ${M.scores[oppRole()]} ${nameOf(oppRole())}`;
        const target = Math.floor(M.rounds / 2) + 1;
        if (M.scores.host === target - 1 && M.scores.guest === target - 1) ctxTxt += ' · DECIDER!';
        else if (M.scores.host === target - 1 || M.scores.guest === target - 1) ctxTxt += ' · match point';
      }
    }
    $('cd-ctx').textContent = ctxTxt;
    $('cd-icon').textContent = pz.icon;
    $('cd-name').textContent = pz.name;
    $('cd-how').textContent = pz.how;
    const num = $('cd-num');
    overlay('countdown', true);
    let n = 3;
    const step = () => {
      num.textContent = n > 0 ? String(n) : 'GO!';
      num.classList.remove('pop'); void num.offsetWidth; num.classList.add('pop');
      if (n > 0) Sound.tick(); else Sound.go();
      if (n === 0) { clearInterval(cdTimer); setTimeout(() => { overlay('countdown', false); then(); }, 350); }
      n--;
    };
    num.textContent = '';
    clearInterval(cdTimer);
    setTimeout(() => { step(); cdTimer = setInterval(step, 750); }, 900);
  }

  function showResult(m) {
    const R = S.round;
    if (R) { R.active = false; endRoundUI(); }
    const M = S.match;
    if (S.mode === 'guest' && M) { M.scores = m.scores; M.history.push(m); }
    updateScores();
    const me = myRole(), opp = oppRole();
    let emoji, title, cls = '';
    if (!m.winner) { emoji = '🤝'; title = 'Draw!'; }
    else if (S.mode === 'local') { emoji = '🏅'; title = `${nameOf(m.winner)} takes it!`; cls = m.winner === 'host' ? 'win' : 'lose'; }
    else if (m.winner === me) { emoji = '🎉'; title = 'Round won!'; cls = 'win'; Sound.win(); }
    else { emoji = '😖'; title = 'Round lost'; cls = 'lose'; Sound.lose(); }
    if (S.mode === 'bot' && m.winner) setTimeout(() => botEmote(m.winner === 'guest' ? 'win' : 'lose'), 700);
    $('res-emoji').textContent = emoji;
    $('res-title').textContent = title; $('res-title').className = 'res-title ' + cls;
    const tCell = role => {
      const t = m.times[role];
      let txt = t != null ? fmtTime(t) : (m.reason === 'giveup' && m.winner && m.winner !== role) ? 'gave up' : Math.round((m.prog[role] || 0) * 100) + '%';
      return el('div', { class: 'rt ' + sideOf(role) }, el('div', { class: 'rt-name' }, nameOf(role)), el('div', { class: 'rt-time' }, (m.winner === role ? '👑 ' : '') + txt));
    };
    const times = $('res-times'); times.innerHTML = '';
    const left = S.mode === 'guest' ? 'guest' : 'host';
    times.append(tCell(left), tCell(left === 'host' ? 'guest' : 'host'));
    $('res-score').textContent = `${nameOf(left)} ${m.scores[left]} – ${m.scores[left === 'host' ? 'guest' : 'host']} ${nameOf(left === 'host' ? 'guest' : 'host')}`;
    $('res-next').textContent = m.over ? 'Match over!' : 'Next round starting…';
    overlay('result', true);
    if (m.over) {
      setTimeout(() => { overlay('result', false); showFinal(m.matchWinner); }, 2600);
    } else if (isAuthority()) {
      const M2 = S.match;
      if (M2 && M2.order === 'pick' && m.winner && M2.pool.length > 1) {
        const picker = m.winner === 'host' ? 'guest' : 'host';
        setTimeout(() => { if (S.match === M2) { send({ t: 'pickreq', picker, i: M2.history.length }); showPick(picker); } }, 2600);
      } else setTimeout(() => { if (S.match === M2) hostNextRound(); }, 3200);
    }
  }

  function showFinal(winner) {
    const M = S.match;
    const me = myRole();
    const left = S.mode === 'guest' ? 'guest' : 'host', right = left === 'host' ? 'guest' : 'host';
    let emoji, title;
    if (!winner) { emoji = '🤝'; title = 'It’s a draw!'; }
    else if (S.mode === 'local') { emoji = '🏆'; title = `${nameOf(winner)} wins!`; confetti(); }
    else if (winner === me) { emoji = '🏆'; title = 'Victory!'; confetti(); Sound.win(); }
    else { emoji = '🥈'; title = `${nameOf(winner)} wins`; Sound.lose(); }
    $('final-emoji').textContent = emoji;
    $('final-title').textContent = title;
    $('final-score').innerHTML = `<span style="color:var(--me)">${M.scores[left]}</span> – <span style="color:var(--opp)">${M.scores[right]}</span>`;
    const tb = $('final-history'); tb.innerHTML = '';
    tb.appendChild(el('tr', null, el('th', null, '#'), el('th', null, 'Puzzle'), el('th', null, nameOf(left)), el('th', null, nameOf(right))));
    M.history.forEach(h => {
      const pz = P.byId[h.pid];
      const cell = role => {
        const t = h.times[role];
        const txt = t != null ? fmtTime(t) : Math.round((h.prog[role] || 0) * 100) + '%';
        return el('td', { class: h.winner === role ? 'w' : '' }, txt);
      };
      tb.appendChild(el('tr', null, el('td', null, String(h.i + 1)), el('td', null, pz.icon + ' ' + pz.name), cell(left), cell(right)));
    });
    // per-player summary stats
    const statBox = $('final-stats'); statBox.innerHTML = '';
    if (S.mode !== 'practice') {
      [left, right].forEach(role => {
        const ts = M.history.map(h => h.times[role]).filter(t => t != null);
        const fastest = ts.length ? Math.min(...ts) : null;
        const avg = ts.length ? ts.reduce((a, b) => a + b, 0) / ts.length : null;
        statBox.appendChild(el('div', { class: 'fs ' + sideOf(role) },
          el('div', { class: 'fs-name' }, nameOf(role)),
          el('div', { class: 'fs-row' }, el('span', null, 'Rounds won'), el('b', null, String(M.scores[role]))),
          el('div', { class: 'fs-row' }, el('span', null, 'Fastest solve'), el('b', null, fmtTime(fastest))),
          el('div', { class: 'fs-row' }, el('span', null, 'Average solve'), el('b', null, fmtTime(avg))),
          el('div', { class: 'fs-row' }, el('span', null, 'Puzzles solved'), el('b', null, `${ts.length}/${M.history.length}`))));
      });
    }
    $('rematch-hint').textContent = '';
    $('btn-rematch').textContent = '🔁 Rematch';
    $('btn-rematch').classList.toggle('hidden', S.mode === 'daily');
    $('btn-share-result').classList.toggle('hidden', S.mode === 'practice');
    $('btn-share-result').textContent = '📋 Share result';
    if (S.mode === 'daily') dailyFinished();
    if (S.mode === 'practice') practiceFinished();
    $('btn-final-home').textContent = (S.mode === 'host' || S.mode === 'guest') ? 'Back to lobby' : 'Home';
    // stats (only for online + bot)
    if (S.mode !== 'local' && S.mode !== 'daily' && S.mode !== 'practice') {
      const st = store('stats') || {};
      st.played = (st.played || 0) + 1;
      if (winner === me) st.won = (st.won || 0) + 1;
      st.rounds = (st.rounds || 0) + M.scores[me];
      // head-to-head record per rival
      const rk = rivalKey();
      st.h2h = st.h2h || {};
      const rec = st.h2h[rk] = st.h2h[rk] || { w: 0, l: 0, d: 0, name: nameOf(oppRole()) };
      if (!winner) rec.d++; else if (winner === me) rec.w++; else rec.l++;
      rec.name = nameOf(oppRole());
      store('stats', st);
      $('rematch-hint').textContent = `All-time vs ${rec.name}: ${rec.w}W – ${rec.l}L` + (rec.d ? ` – ${rec.d}D` : '');
    }
    show('final');
  }

  function rematch() {
    if (S.mode === 'practice') { startPractice(S.practice.pid); return; }
    if (S.mode === 'bot' || S.mode === 'local') { hostStartMatch(); return; }
    if (!S.connected) { toast('Your rival has left.', true); return; }
    S.rematch[myRole()] = true;
    send({ t: 'rematch' });
    $('rematch-hint').textContent = 'Waiting for your rival to accept…';
    if (S.mode === 'host' && S.rematch.guest) hostStartMatch();
  }

  function finalHome() {
    if (S.mode === 'host' || S.mode === 'guest') {
      if (S.mode === 'host') send({ t: 'lobby' });
      abortMatch(); openLobby();
    } else goHome();
  }

  // ─────────────── loser picks ───────────────
  let pickTimer = null;
  function showPick(picker) {
    overlay('result', false);
    const M = S.match; if (!M) return;
    const interactive = S.mode === 'local' || picker === myRole();
    S.pickFor = picker;
    $('pick-title').textContent = interactive ? (S.mode === 'local' ? `${nameOf(picker)}, pick the next puzzle` : 'You lost the round — pick the next puzzle!') : `${nameOf(picker)} is choosing the next puzzle…`;
    $('pick-sub').textContent = interactive ? 'Choose the one you’re best at.' : 'They lost the last round, so they get to choose.';
    const grid = $('pick-grid'); grid.innerHTML = '';
    grid.classList.toggle('readonly', !interactive);
    const best = (store('stats') || {}).best || {};
    M.pool.forEach(id => {
      const pz = P.byId[id];
      const b = best[id + ':' + M.diff];
      const btn = el('button', { class: 'pick-btn', 'data-pid': id }, el('span', { class: 'pi' }, pz.icon), el('span', null, pz.name), b && interactive ? el('span', { class: 'pb' }, 'best ' + fmtTime(b)) : null);
      btn.onclick = () => choosePick(id);
      grid.appendChild(btn);
    });
    overlay('pick', true);
    let left = 15;
    $('pick-timer').textContent = `${left}s`;
    clearInterval(pickTimer);
    pickTimer = setInterval(() => {
      left--;
      $('pick-timer').textContent = `${Math.max(0, left)}s`;
      if (left <= 0) { clearInterval(pickTimer); if (isAuthority() && S.pickFor) choosePick(M.pool[Math.floor(Math.random() * M.pool.length)], true); }
    }, 1000);
    if (S.mode === 'bot' && picker === 'guest') {
      // bot picks the puzzle it is (secretly) fastest at relative to its average
      const pz = M.pool.slice().sort((a, b) => P.byId[a].bot[M.diff] - P.byId[b].bot[M.diff])[Math.random() < 0.6 ? 0 : 1] || M.pool[0];
      setTimeout(() => choosePick(pz, true), 1400);
    }
  }

  function choosePick(pid, force) {
    const picker = S.pickFor;
    if (!picker) return;
    const interactive = S.mode === 'local' || picker === myRole();
    if (!interactive && !force) return;
    Sound.click();
    if (S.mode === 'guest') { S.pickFor = null; send({ t: 'picked', pid }); markPicked(pid); return; }
    S.pickFor = null;
    markPicked(pid);
    send({ t: 'picked', pid });
    setTimeout(() => hostNextRound(pid), 700);
  }

  function markPicked(pid) {
    clearInterval(pickTimer);
    const b = document.querySelector(`.pick-btn[data-pid="${pid}"]`);
    if (b) b.classList.add('chosen');
    $('pick-timer').textContent = P.byId[pid] ? `${P.byId[pid].icon} ${P.byId[pid].name} it is!` : '';
  }

  function resultText() {
    const M = S.match; if (!M) return '';
    const left = S.mode === 'guest' ? 'guest' : 'host', right = left === 'host' ? 'guest' : 'host';
    const lines = [`⚔️ Puzzle Duel — ${nameOf(left)} ${M.scores[left]}–${M.scores[right]} ${nameOf(right)}`];
    M.history.forEach(h => {
      const pz = P.byId[h.pid];
      const t = r => h.times[r] != null ? fmtTime(h.times[r]) : Math.round((h.prog[r] || 0) * 100) + '%';
      const mark = h.winner === left ? '🟦' : h.winner === right ? '🟥' : '⬜';
      lines.push(`${mark} ${pz.icon} ${pz.name}: ${t(left)} vs ${t(right)}`);
    });
    lines.push(location.origin + location.pathname);
    return lines.join('\n');
  }

  async function shareResult() {
    const text = S.mode === 'daily' ? dailyShareText() : resultText();
    if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) { try { await navigator.share({ text }); return; } catch (e) {} }
    try { await navigator.clipboard.writeText(text); toast('Result copied — paste it anywhere!'); }
    catch (e) { prompt('Copy your result:', text); }
  }

  // ─────────────── practice ───────────────
  function startPractice(pid) {
    teardownNet();
    const diff = S.settings.diff || 'normal';
    const best = ((store('stats') || {}).best || {})[pid + ':' + diff] || null;
    S.mode = 'practice';
    S.practice = { pid, diff, best };
    beginMatch({ seed: randomSeed(), rounds: 1, diff, pool: [pid], order: 'random', playAll: true });
    setTimeout(() => hostNextRound(), 300);
  }
  function practiceFinished() {
    const M = S.match, Pr = S.practice, h = M.history[0];
    const t = h && h.times.host;
    const pz = P.byId[Pr.pid];
    $('btn-rematch').textContent = '🔁 Again';
    $('final-score').innerHTML = `${pz.icon} ${pz.name} <span class="muted small">(${Pr.diff})</span>`;
    if (t != null && (!Pr.best || t < Pr.best)) { $('final-emoji').textContent = '🏅'; $('final-title').textContent = Pr.best ? 'New personal best!' : 'First time set!'; confetti(); }
    else if (t != null) { $('final-emoji').textContent = '⏱'; $('final-title').textContent = 'Solved!'; }
    else { $('final-emoji').textContent = '🧠'; $('final-title').textContent = 'Keep practising'; }
    $('rematch-hint').innerHTML = `Your time: <b>${t != null ? fmtTime(t) : 'DNF'}</b>` + (Pr.best ? ` · previous best: ${fmtTime(Pr.best)}` : '');
  }

  // ─────────────── daily challenge ───────────────
  function todayKey(d = new Date()) { return d.toISOString().slice(0, 10); }
  function dailySetup(date) {
    let h = 2166136261;
    for (const ch of 'pduel-daily-' + date) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    const seed = h >>> 0;
    const pool = makeRng(seed).shuffle(P.list.map(p => p.id)).slice(0, 3);
    return { seed, pool };
  }
  function startDaily(vs) {
    teardownNet();
    const date = vs && vs.d ? vs.d : todayKey();
    const { seed, pool } = dailySetup(date);
    S.mode = 'daily';
    S.daily = { date, vs: vs || null };
    beginMatch({ seed, rounds: 3, diff: 'normal', pool, order: 'random', playAll: true });
    setTimeout(() => hostNextRound(), 300);
  }
  function startDailyGhost(R) {
    // ghost of a friend's run (from a challenge link) or "par" (bot pro pace)
    const vs = S.mode === 'daily' && S.daily && S.daily.vs;
    const pz = P.byId[R.pid];
    const t = S.mode === 'practice' ? (S.practice.best || pz.bot[R.diff] * 1000) : vs ? (vs.t[R.i] != null ? vs.t[R.i] : null) : pz.bot.normal * 1000;
    const finalP = vs && vs.t[R.i] == null ? (vs.p && vs.p[R.i] || 0.5) : 1;
    R.bot = setInterval(() => {
      if (R.resolved) { clearInterval(R.bot); return; }
      const el2 = performance.now() - R.startAt;
      if (t == null) { const p = Math.min(finalP, el2 / (R.limit * 1000) * finalP); R.prog.guest = p; setBar('guest', p); return; }
      const p = Math.min(1, el2 / t);
      R.prog.guest = p; setBar('guest', p);
      if (el2 >= t) { clearInterval(R.bot); markFinished('guest', t); hostFinish('guest', t); }
    }, 100);
  }
  function dailyFinished() {
    const M = S.match, D = S.daily;
    const times = M.history.map(h => h.times.host != null ? Math.round(h.times.host) : null);
    const prog = M.history.map(h => Math.round((h.prog.host || 0) * 100) / 100);
    const total = times.reduce((a, t) => a + (t == null ? 999000 : t), 0);
    D.mine = { times, prog, total };
    const key = 'daily:' + D.date;
    const prev = store(key);
    if (!prev && D.date === todayKey()) store(key, D.mine);
    const allDone = times.every(t => t != null);
    $('final-title').textContent = D.vs ? $('final-title').textContent : (allDone ? 'Daily complete!' : 'Daily done');
    $('final-emoji').textContent = D.vs ? $('final-emoji').textContent : '📅';
    $('rematch-hint').innerHTML = `Total time: <b>${allDone ? fmtTime(total) : 'DNF'}</b>` + (prev && D.date === todayKey() ? ` · first attempt today: ${prev.times.every(t => t != null) ? fmtTime(prev.total) : 'DNF'}` : '') + '<br>Share your result to challenge friends to beat your ghost!';
    $('btn-share-result').textContent = '⚔️ Challenge a friend';
  }
  function challengeLink() {
    const D = S.daily;
    const data = { d: D.date, n: myName(), t: D.mine.times, p: D.mine.prog };
    const enc = btoa(unescape(encodeURIComponent(JSON.stringify(data)))).replace(/=+$/, '');
    return location.origin + location.pathname + location.search + '#c=' + enc;
  }
  function parseChallenge(hash) {
    try {
      const d = JSON.parse(decodeURIComponent(escape(atob(hash))));
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d.d) || !Array.isArray(d.t)) return null;
      return { d: d.d, n: String(d.n || 'Friend').slice(0, 16), t: d.t.slice(0, 3).map(x => (typeof x === 'number' && x > 0 ? x : null)), p: Array.isArray(d.p) ? d.p.slice(0, 3).map(Number) : [] };
    } catch (e) { return null; }
  }
  function dailyShareText() {
    const D = S.daily, M = S.match;
    const lines = [`📅 Puzzle Duel Daily ${D.date}`];
    M.history.forEach(h => { const pz = P.byId[h.pid]; lines.push(`${pz.icon} ${pz.name}: ${h.times.host != null ? fmtTime(h.times.host) : 'DNF'}`); });
    const allDone = D.mine.times.every(t => t != null);
    lines.push(`Total: ${allDone ? fmtTime(D.mine.total) : 'DNF'}`);
    if (D.vs) lines.push(`(vs ${D.vs.n}: ${M.scores.host}–${M.scores.guest})`);
    lines.push('Beat my ghost 👉 ' + challengeLink());
    return lines.join('\n');
  }
  function renderDailyCard() {
    const key = todayKey();
    const mine = store('daily:' + key);
    const { pool } = dailySetup(key);
    $('daily-sub').textContent = pool.map(id => P.byId[id].icon).join(' ') + '  ·  ' + (mine ? `Today: ${mine.times.every(t => t != null) ? fmtTime(mine.total) : 'DNF'} — play again?` : 'Same 3 puzzles for everyone today');
  }

  // ─────────────── power-ups ───────────────
  const FREEZE_MS = 3000;
  function powerupsActive() { return !!(S.match && S.match.powerups) && (S.mode === 'host' || S.mode === 'guest' || S.mode === 'bot'); }
  function updatePowerButton() {
    const btn = $('btn-power');
    const R = S.round;
    if (!powerupsActive()) { btn.classList.add('hidden'); return; }
    btn.classList.remove('hidden');
    const ready = R && R.active && !R.powerUsed && (R.prog[myRole()] || 0) >= 0.5;
    btn.disabled = !ready;
    btn.classList.toggle('ready', !!ready);
    btn.textContent = R && R.powerUsed ? '❄️ Used' : ready ? '❄️ FREEZE!' : '❄️ at 50%';
  }
  function usePower() {
    const R = S.round;
    if (!R || !R.active || R.powerUsed || (R.prog[myRole()] || 0) < 0.5) return;
    R.powerUsed = true;
    R.oppFrozenUntil = performance.now() + FREEZE_MS;
    Sound.tone(1400, 0.25, 'sine', 0.06); Sound.tone(1800, 0.25, 'sine', 0.04, 0.08);
    send({ t: 'freeze', i: R.i });
    showEmote('me', '❄️');
    toast(`Froze ${nameOf(oppRole())} for 3 seconds!`);
    const opp = document.querySelector('.hud-player.opp'); opp.classList.add('frozen');
    setTimeout(() => opp.classList.remove('frozen'), FREEZE_MS);
    updatePowerButton();
  }
  function receiveFreeze() {
    const R = S.round;
    if (!R || !R.active || !R.attempt) return;
    R.attempt.api.penalty(FREEZE_MS, `❄️ ${nameOf(oppRole())} froze you!`);
    $('penalty').classList.add('ice');
    setTimeout(() => $('penalty').classList.remove('ice'), FREEZE_MS);
    Sound.tone(300, 0.4, 'triangle', 0.07);
  }

  // ─────────────── bot ───────────────
  function startBot(R) {
    const pz = P.byId[R.pid];
    const base = (pz.bot[R.diff] || 40) * BOT_SKILL[S.settings.bot];
    const total = base * (0.8 + Math.random() * 0.45) * 1000;
    let p = 0, work = 0, stall = 0;
    const powerAt = 0.5 + Math.random() * 0.35;
    R.bot = setInterval(() => {
      if (!R.active && !R.myDone) return;
      if (R.resolved) { clearInterval(R.bot); return; }
      const t = performance.now() - R.startAt;
      if (R.oppFrozenUntil && performance.now() < R.oppFrozenUntil) return; // frozen by the player
      work += 350 * (0.85 + Math.random() * 0.3);
      if (stall > 0) { stall--; work -= 350; return; }
      if (Math.random() < 0.05) stall = 1 + Math.floor(Math.random() * 3); // "thinking"
      if (S.match.powerups && !R.oppPowerUsed && p >= powerAt && R.active) {
        R.oppPowerUsed = true;
        receiveFreeze();
      }
      const target = Math.min(1, work / total);
      p = Math.max(p, Math.min(0.99, target + (Math.random() - 0.5) * 0.05));
      R.prog.guest = p; setBar('guest', p);
      if (work >= total) {
        clearInterval(R.bot);
        R.prog.guest = 1;
        markFinished('guest', t);
        hostFinish('guest', t);
      }
    }, 350);
  }

  function botEmote(kind) {
    const pool = kind === 'win' ? ['😂', '🔥', '🐢', 'GG'] : ['😱', '🤯', '😤', '👍'];
    if (Math.random() < 0.55) showEmote('opp', pool[Math.floor(Math.random() * pool.length)]);
  }

  // ─────────────── pass & play ───────────────
  function handoff(role, then) {
    $('handoff-title').textContent = `${nameOf(role)}'s turn`;
    const R = S.round;
    $('handoff-sub').textContent = role === 'host'
      ? `Round ${R.i + 1}. ${nameOf('guest')}, look away! 🙈`
      : `Pass the device to ${nameOf('guest')}. You'll race ${nameOf('host')}'s ghost.`;
    overlay('handoff', true);
    $('handoff-go').onclick = () => { overlay('handoff', false); then(); };
  }

  function localTurnOver(role, ms, gaveUp) {
    const R = S.round;
    if (ms != null) R.times[role] = ms;
    if (gaveUp) R.gaveUp[role] = true;
    if (R.ghost) clearInterval(R.ghost);
    if (role === 'host') {
      R.hostSamples = R.samples.slice();
      R.samples = [];
      R.prog.host = R.prog.host || 0;
      setTimeout(() => {
        if (S.round !== R) return;
        endRoundUI();
        R.turn = 'guest'; R.startAt = 0; R.initProg = 0;
        setBar('guest', 0);
        handoff('guest', () => runAttempt());
      }, 1400);
    } else {
      setTimeout(() => { if (S.round === R) hostResolve(); }, 900);
    }
  }

  function startGhost(R) {
    const samples = R.hostSamples || [];
    const finalT = R.times.host;
    let k = 0;
    setBar('host', 0);
    R.ghost = setInterval(() => {
      const t = performance.now() - R.startAt;
      while (k < samples.length && samples[k][0] <= t) { setBar('host', samples[k][1]); k++; }
      if (finalT != null && t >= finalT) {
        setBar('host', 1);
        document.querySelector('.hud-player.' + sideOf('host')).classList.add('finished');
        clearInterval(R.ghost);
      }
    }, 100);
    document.querySelector('.hud-player.' + sideOf('host')).classList.remove('finished');
  }

  // ─────────────── emotes / fx ───────────────
  function showEmote(side, e) {
    const b = side === 'opp' ? $('opp-bubble') : $('my-bubble');
    b.textContent = e;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    Sound.pop();
  }
  let lastEmote = 0;
  function sendEmote(e) {
    const now = Date.now(); if (now - lastEmote < 700) return; lastEmote = now;
    showEmote('me', e);
    send({ t: 'emote', e });
  }

  function confetti() {
    const colors = ['#4fc3f7', '#f48fb1', '#ffd54f', '#69f0ae', '#a78bfa'];
    for (let i = 0; i < 80; i++) {
      const c = el('div', { class: 'confetti', style: { left: Math.random() * 100 + 'vw', background: colors[i % colors.length], animationDuration: (1.8 + Math.random() * 1.8) + 's', animationDelay: Math.random() * 0.6 + 's', borderRadius: Math.random() < 0.5 ? '50%' : '2px' } });
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 4500);
    }
  }

  // ─────────────── wiring ───────────────
  function init() {
    const nameInput = $('name-input');
    nameInput.value = store('name') || randomName();
    store('name', nameInput.value);
    nameInput.addEventListener('input', () => {
      store('name', nameInput.value.trim());
      if (S.connected) send({ t: 'name', name: myName() });
    });
    $('name-dice').onclick = () => { nameInput.value = randomName(); store('name', nameInput.value); Sound.click(); };

    $('btn-create').onclick = () => { Sound.click(); startHost(); };
    $('btn-join').onclick = () => { Sound.click(); startJoin($('join-code').value); };
    $('join-code').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-join').click(); });
    $('btn-bot').onclick = () => { Sound.click(); S.mode = 'bot'; openLobby(); };
    $('btn-local').onclick = () => { Sound.click(); S.mode = 'local'; openLobby(); };
    $('lobby-leave').onclick = goHome;
    $('btn-start').onclick = () => { Sound.click(); hostStartMatch(); };
    $('btn-rematch').onclick = rematch;
    $('btn-final-home').onclick = finalHome;
    $('btn-share-result').onclick = shareResult;
    $('btn-forfeit').onclick = giveUp;
    $('btn-power').onclick = usePower;

    document.querySelectorAll('.seg').forEach(seg => {
      seg.addEventListener('click', e => {
        const b = e.target.closest('button'); if (!b || S.mode === 'guest') return;
        const key = seg.dataset.setting;
        S.settings[key] = key === 'rounds' ? +b.dataset.v : b.dataset.v;
        Sound.click();
        settingsChanged();
      });
    });

    $('copy-link').onclick = async () => {
      const link = inviteLink();
      try { await navigator.clipboard.writeText(link); toast('Invite link copied!'); }
      catch (e) { prompt('Copy this link:', link); }
    };
    $('share-link').onclick = async () => {
      const link = inviteLink();
      if (navigator.share) { try { await navigator.share({ title: 'Puzzle Duel', text: `Race me in Puzzle Duel! Room ${S.code}`, url: link }); } catch (e) {} }
      else { try { await navigator.clipboard.writeText(link); toast('Invite link copied!'); } catch (e) { prompt('Copy this link:', link); } }
    };

    const emotes = $('emotes');
    EMOTES.forEach(e => emotes.appendChild(el('button', { onclick: () => sendEmote(e) }, e)));

    Sound.enabled = store('sound') !== false;
    const st = $('sound-toggle');
    const drawSound = () => { st.textContent = Sound.enabled ? '🔊 Sound on' : '🔇 Sound off'; $('hud-mute').textContent = Sound.enabled ? '🔊' : '🔇'; };
    st.onclick = () => { Sound.enabled = !Sound.enabled; store('sound', Sound.enabled); drawSound(); Sound.click(); };
    $('hud-mute').onclick = st.onclick;
    drawSound();

    document.addEventListener('keydown', e => {
      const R = S.round;
      if (!R || !R.active || !R.puzzle || !R.puzzle.onKey) return;
      if (e.target && e.target.tagName === 'INPUT') return;
      if (e.key === ' ' && powerupsActive()) { e.preventDefault(); usePower(); return; }
      if (R.frozenUntil && performance.now() < R.frozenUntil) return;
      R.puzzle.onKey(e);
    });

    window.addEventListener('beforeunload', () => { if (S.net) try { S.net.send({ t: 'bye' }); } catch (e) {} });

    $('btn-daily').onclick = () => { Sound.click(); startDaily(null); };
    if (!store('seenHowto')) $('howto').classList.remove('hidden');
    $('howto-close').onclick = () => { $('howto').classList.add('hidden'); store('seenHowto', true); };
    renderHome();
    // challenge link: #c=...   invite link: #CODE
    if (location.hash.startsWith('#c=')) {
      const vs = parseChallenge(location.hash.slice(3));
      history.replaceState(null, '', location.pathname + location.search);
      if (vs) { S.pendingChallenge = vs; showChallengeIntro(vs); }
      return;
    }
    const hash = PD.Net.normalizeCode(location.hash.slice(1));
    if (hash.length >= 4) { $('join-code').value = hash; startJoin(hash); }
  }

  init();
  window.PD.app = S; // for debugging
})();
