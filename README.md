# Dhayam – Multiplayer edition (2 players, 4-player teams, spectators)

Two-player Dhayam board game (Red vs Blue) with 4, 6 or 12 coins each, two throwing sticks, captures with sound, and Play vs Computer / Pass & Play modes.

## Folders
```
index.html            page structure (all screens)
manifest.webmanifest  installable-app info      sw.js  offline cache
css/style.css         all styling
js/                   (loaded in this order)
  config.js           constants, shared state, screen switching
  board.js            board coordinates + SVG board drawing
  rules.js            move rules, captures, turns, throws, computer player
  animation.js        coin walk, capture animation + sound, dice roll + sound
  render.js           players bar, coins, dice values, win screen
  game.js             menus, setup, start / leave game
  online.js           online client: WebSocket connection, waiting room, reconnect, spectators
assets/audio/         capture.mp3, dice_roll.wav
assets/images/        dice_0..3.png (stick faces)
assets/icons/         app icons
server/server.js      Node server: serves the game + WebSocket rooms (authoritative dice, moves, turns)
server/engine.js      runs the ORIGINAL js/rules.js on the server, one sandbox per room
test/e2e.js           automated multiplayer test (bots)
render.yaml           Render blueprint      package.json  start script + dependency (ws)
python/server.py      old offline-only static server (no multiplayer)
python/analyze_audio.py  makes the loudness envelope used for sound sync
python/build_single_file.py  builds dist/dhayam-single.html (everything inlined in one file)
```

## Run it locally
```
npm install
npm start
```
Open http://localhost:8000 (or the printed port). Open it in two browser windows to test: use a normal window and a private window, or add `?p=2` to the second tab's address (each device/tab needs its own identity).
Offline modes (vs Computer, Pass & Play) still work anywhere, even without the server.

## Deploy on Render (via GitHub)
1. Create a GitHub repo and upload the **contents** of this folder (package.json must be at the repo root). Do not upload `node_modules`.
2. Render dashboard > **New > Web Service** > connect the repo, or **New > Blueprint** to use `render.yaml`.
3. If you create it by hand use: Runtime **Node**, Build Command `npm install`, Start Command `npm start`, Health Check Path `/healthz`.
4. Do not set a port: the server reads Render's `PORT` automatically and listens on 0.0.0.0. WebSockets work on Render with no extra setting.
5. Open your `https://<name>.onrender.com` link. Everyone (players and spectators) uses that same link; pages connect to `wss://` on the same host by themselves.

Optional environment variables: `RECONNECT_GRACE_MS` (default 240000 = 4 min), `MAX_SPECTATORS` (default 10), `ROLL_MS`, `MAX_ROOMS`.

**Render free plan:** the service sleeps after ~15 minutes without traffic and restarts when visited; rooms live in server memory, so a restart (sleep, redeploy, crash) ends active rooms. Use a paid instance for always-on play. Run a single instance only (rooms are not shared between instances).

## How online play works
- The **server is the referee**. It rolls the dice, validates every move with the original `js/rules.js` (loaded unchanged), applies it, and broadcasts the new state. Clients only send *throw* / *move* requests, so dice, turns, moves and captures are identical on every screen and conflicting or duplicate actions are rejected.
- Dice: all screens play the original dice animation and sound for the same server-chosen result.
- **Rooms:** create a room, share the 5-letter code. Join with the code. 2-player match (1 Red + 1 Blue) or 4-player team match (2 + 2), same rules as before.
- **Spectators:** up to 10 per room (`MAX_SPECTATORS`), can join in the waiting room or at any time while a game is running, see the live board, dice, moves, captures and turns, and cannot throw or move (enforced on the server).
- **Disconnects:** if a player's connection drops (closed tab, network loss, phone sleeping) the game does **not** end. Everyone sees a "waiting to rejoin" countdown for 4 minutes. The page reconnects by itself; a reloaded page also rejoins automatically. Rejoining with the same room code (same device, or another device using the same name) restores the seat and the game continues from the exact state. Their turn simply waits.
- If the seat is not reclaimed within 4 minutes the player is treated as having left (their turns are skipped; if the whole team is gone the other team wins). Pressing **Quit** is an intentional leave and releases the seat immediately.
- Names are sanitised on the server. The private device token never leaves the device; other clients only see a public seat id.

## Tests
`npm test` starts the server and plays full games with bots (players + spectators, mid-game spectator join, disconnect/rejoin, seat takeover, grace expiry).

## Notes
- `dist/dhayam-single.html` is the single-file build for offline modes only (online play needs the server).
- Changes to the original game code are limited to: `js/online.js` (rewritten for WebSocket), `js/config.js` (removed the Claude-database bootstrap), two one-line hooks in `js/rules.js` (`doThrow`/`tapCoin` send the action to the server when online), a connection banner (`#dcn`) in `index.html`/`css`, and `sw.js` (network-first so new deployments are not hidden by the cache).
