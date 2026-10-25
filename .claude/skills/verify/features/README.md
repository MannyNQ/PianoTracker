# PianoTracker Pro feature map

One file per user-facing feature. Each covers sub-features, how a user reaches it, how to drive it
with the in-app browser + `page-helpers.js` (and `curl` where the API is the surface), and gotchas.
All journeys assume `verify.sh up` + `doctor: healthy` and the studio open at
`http://127.0.0.1:5183/#studio`.

| Feature | File | Entry point |
|---|---|---|
| Analyze a performance | [analyze-performance.md](analyze-performance.md) | Landing → Open studio → upload → Analyze; or a `#job=<id>` link |
| Replay with overlay and live HUD | [replay-hud.md](replay-hud.md) | Session view: video, transport, piano roll |
| Summary tab | [summary.md](summary.md) | Session view → Summary tab |
| Keyboard calibration | [keyboard-calibration.md](keyboard-calibration.md) | Session view → Keyboard tab |
| Score attach / replace / remove | [score.md](score.md) | Upload view Score drop zone; session view → Score tab |

Last proven end to end: `analyze-performance` (2026-10-24, build 67d3f5e). The others are mapped
from source and not yet driven.
