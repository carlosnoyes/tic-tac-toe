/* Puzzle Duel — networking.
 * Default transport: PeerJS (WebRTC data channel, brokered by the free PeerJS cloud server),
 * so the site can be hosted statically and friends connect with a room code / link.
 * Fallback transport: BroadcastChannel (same browser, different tabs) — used for local
 * testing via ?net=bc.
 */
(function () {
  'use strict';
  const PREFIX = 'pduel-v1-';
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function makeCode() {
    let s = '';
    for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return s;
  }

  function normalizeCode(c) {
    return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  }

  class PeerTransport {
    constructor(handlers) { this.h = handlers; this.peer = null; this.conn = null; this.closed = false; }

    host(code) {
      if (typeof Peer === 'undefined') { this.h.onError('Networking library failed to load.'); return; }
      this.peer = new Peer(PREFIX + code, { debug: 0 });
      this.peer.on('open', () => this.h.onReady && this.h.onReady());
      this.peer.on('connection', conn => {
        if (this.conn && this.conn.open) { // room full
          conn.on('open', () => { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 300); });
          return;
        }
        this._bind(conn);
      });
      this.peer.on('error', err => this._err(err));
      this.peer.on('disconnected', () => { if (!this.closed) try { this.peer.reconnect(); } catch (e) {} });
    }

    join(code) {
      if (typeof Peer === 'undefined') { this.h.onError('Networking library failed to load.'); return; }
      this.peer = new Peer({ debug: 0 });
      this.code = code; this.tries = 0;
      this.peer.on('open', () => this._connect());
      this.peer.on('error', err => {
        // the host may still be registering (or briefly reconnecting) — retry a few times
        if (err && err.type === 'peer-unavailable' && this.tries < 4 && !this.closed) {
          this.h.onStatus && this.h.onStatus(`Looking for room… (retry ${this.tries})`);
          setTimeout(() => this._connect(), 1500);
          return;
        }
        this._err(err);
      });
    }

    _connect() {
      if (this.closed) return;
      this.tries++;
      const conn = this.peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
      this._bind(conn);
    }

    _bind(conn) {
      this.conn = conn;
      conn.on('open', () => this.h.onOpen && this.h.onOpen());
      conn.on('data', d => this.h.onMessage && this.h.onMessage(d));
      conn.on('close', () => { if (this.conn === conn) { this.conn = null; this.h.onClose && this.h.onClose(); } });
      conn.on('error', err => this._err(err));
    }

    _err(err) {
      const type = err && err.type;
      let msg = (err && err.message) || String(err);
      if (type === 'unavailable-id') msg = 'That room code is already in use. Try again.';
      else if (type === 'peer-unavailable') msg = 'Room not found. Check the code — the host must keep their tab open.';
      else if (type === 'network' || type === 'server-error' || type === 'socket-error') msg = 'Could not reach the matchmaking server. Check your connection.';
      else if (type === 'browser-incompatible') msg = 'Your browser does not support WebRTC.';
      this.h.onError && this.h.onError(msg, type);
    }

    send(msg) { if (this.conn && this.conn.open) this.conn.send(msg); }
    drop() { const c = this.conn; this.conn = null; try { c && c.close(); } catch (e) {} }
    get connected() { return !!(this.conn && this.conn.open); }
    close() {
      this.closed = true;
      try { this.conn && this.conn.close(); } catch (e) {}
      try { this.peer && this.peer.destroy(); } catch (e) {}
    }
  }

  class BCTransport {
    constructor(handlers) { this.h = handlers; this.ch = null; this.role = null; this.open = false; this.id = Math.random().toString(36).slice(2); this.other = null; }
    host(code) {
      this.role = 'host';
      this.ch = new BroadcastChannel(PREFIX + code);
      this.ch.onmessage = e => this._on(e.data);
      setTimeout(() => this.h.onReady && this.h.onReady(), 50);
    }
    join(code) {
      this.role = 'guest';
      this.ch = new BroadcastChannel(PREFIX + code);
      this.ch.onmessage = e => this._on(e.data);
      this.ch.postMessage({ _bc: 'hello', from: this.id });
      this._timer = setTimeout(() => { if (!this.open) this.h.onError('Room not found (local tab mode).', 'peer-unavailable'); }, 2500);
    }
    _on(d) {
      if (!d || d.from === this.id) return;
      if (d._bc === 'hello' && this.role === 'host') {
        if (this.open) return;
        this.other = d.from; this.open = true;
        this.ch.postMessage({ _bc: 'welcome', from: this.id, to: d.from });
        this.h.onOpen && this.h.onOpen();
        return;
      }
      if (d._bc === 'welcome' && d.to === this.id) {
        clearTimeout(this._timer);
        this.other = d.from; this.open = true;
        this.h.onOpen && this.h.onOpen();
        return;
      }
      if (d._bc === 'bye' && d.from === this.other) { this.open = false; this.h.onClose && this.h.onClose(); return; }
      if (d._bc === 'msg' && d.from === this.other) this.h.onMessage && this.h.onMessage(d.m);
    }
    send(m) { if (this.open) this.ch.postMessage({ _bc: 'msg', from: this.id, m }); }
    drop() { this.open = false; this.other = null; }
    get connected() { return this.open; }
    close() { try { this.ch.postMessage({ _bc: 'bye', from: this.id }); this.ch.close(); } catch (e) {} this.open = false; }
  }

  function create(handlers) {
    const params = new URLSearchParams(location.search);
    if (params.get('net') === 'bc') return new BCTransport(handlers);
    return new PeerTransport(handlers);
  }

  window.PD = window.PD || {};
  PD.Net = { create, makeCode, normalizeCode };
})();
