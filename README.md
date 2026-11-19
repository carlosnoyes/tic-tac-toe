# Tic-Tac-Toe & Puzzle Duel

Static browser games — no build step, no server of your own. Open `index.html` or host the folder on GitHub Pages.

## ⚔️ Puzzle Duel (`duel/`)

A competitive two-player puzzle race. Both players get the **exact same puzzle** (generated from a shared seed) at the same moment; the fastest solver takes the round. First to win the majority of rounds wins the match.

- **Online with friends** — create a room, send the link (or 5-letter code). Peer-to-peer over WebRTC via the free PeerJS broker, so it works from any static host.
- **Vs Bot** — three skill levels.
- **Pass & Play** — two players on one device; player 2 races player 1's ghost.
- Live opponent progress bars, emotes, personal-best tracking, rematches.

Local testing without internet: append `?net=bc` to use a BroadcastChannel transport between two tabs of the same browser.

## 🧊 3D Tic-Tac-Toe (`index.html`)

4×4×4 tic-tac-toe with layer and 3D orbit views, hot-seat or vs CPU.
