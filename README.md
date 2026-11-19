# Tic-Tac-Toe & Puzzle Duel

Static browser games: no build step and no server to run. Open `index.html`, or host the folder on GitHub Pages (or any static host).

## ⚔️ Puzzle Duel (`duel/`)

A competitive two-player puzzle race. Both players get the **exact same puzzle**, generated from a shared seed, at the same moment. The fastest solver takes the round, and whoever wins most rounds takes the match.

### Ways to play
- **Online with friends**: create a room and send the link or the 5-letter code. Players connect peer-to-peer over WebRTC, using the free PeerJS broker (vendored in `duel/vendor/`), so no backend is needed.
- **Daily Challenge**: everyone gets the same 3 puzzles each day. Share a challenge link and your friend races your ghost asynchronously. Tracks daily streaks.
- **Vs Bot**: Rookie, Pro, Master, or **Adaptive**. The Adaptive bot speeds up when you win and slows down when you lose, settling at your level.
- **Pass & Play**: two players on one device. Player 2 races player 1's recorded ghost.
- **Practice**: tap any puzzle on the home screen to race your personal-best ghost.

### Puzzles (13)
🔢 Number Hunt · 🧩 Slide · 💡 Lights Out · 🃏 Memory · 💣 Mine Dash (guaranteed no-guess) · 🔷 Mini Sudoku (unique solution) · 🔐 Code Breaker · ➗ Quick Math · 🖼️ Picross · 🚰 Pipes · 👀 Odd One Out · 🔤 Unscramble · 🧠 Flash Recall

Each puzzle has Easy, Normal and Hard levels.

### Competitive features
- Live opponent progress bars, latency indicator, emotes
- Best of 3, 5 or 7, with tiebreak rounds
- **Loser picks** mode: the round loser chooses the next puzzle
- **❄️ Freeze power-up**: reach 50% progress to earn one freeze per round, which locks your rival's board for 3 seconds (Space bar or button)
- Penalties for wrong taps and mine hits; time limit per round (when time runs out, most progress wins)
- Head-to-head records per rival, personal bests, match stats, shareable result summaries
- Installable PWA with offline fallback (bot, practice, daily and pass-and-play work offline)

### Development
- Plain HTML, CSS and JS, no dependencies besides the vendored PeerJS.
- To test online play without internet, add `?net=bc` to the URL. This switches to a BroadcastChannel transport between two tabs of the same browser (open the invite link in a second tab).

## 🧊 3D Tic-Tac-Toe (`index.html`)

4×4×4 tic-tac-toe with layer and 3D orbit views. Play hot-seat or against the CPU.
