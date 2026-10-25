---
name: verify
description: Launch and drive PianoTracker Pro (FastAPI analysis backend + Vite/React studio UI) the way a user does, on side ports, and capture proof. Use to confirm a change to upload/analysis, the replay HUD and overlay, the Summary/Keyboard/Score tabs, or the backend API actually works in the running app, not just in pytest.
---

# Verify PianoTracker Pro

The user-facing surface is a web studio: upload a piano video (plus an optional score), wait for the
analysis job, then replay it with a hand/key overlay, a live HUD and three side tabs. The backend
(`backend/main.py`, FastAPI) does the analysis; the frontend (`frontend/`, Vite + React) is the UI.
Secondary surface: the JSON API under `/api` (see `backend/main.py`).

Everything goes through `verify.sh` (next to this file). Paths below are from the repo root.

## Isolation

- Verification runs on **side ports**: backend `8010`, web `5183` (override with `PT_API_PORT`,
  `PT_WEB_PORT`). The user's own dev stack uses 8000/5173; never drive or kill that one.
- The web side uses `vite.verify.config.mjs`: the app's real `frontend/vite.config.js` with the
  proxy pointed at the side backend, its own Vite cache dir, and scaffolding routes under
  `/__verify/` (fixtures, page helpers, evidence sink). App code is untouched.
- **Shared, not isolated:** `backend/data/jobs/` and `backend/models/` are hardcoded in
  `backend/main.py`, so a verification backend writes jobs next to the user's. Every job you create
  must be adopted (`verify.sh adopt-job <id>`) so cleanup deletes exactly those and nothing else.
- One analysis runs at a time per backend (single worker, GPU heavy). Don't start a second
  verification stack to parallelize.

## Launch

```bash
.claude/skills/verify/verify.sh up
```

Prereqs (README "Running it"): `backend/venv`, `backend/omr_venv` (for PDF/photo scores),
`frontend/node_modules`, and model files in `backend/models/` (downloaded on first backend start;
the transcription model is 172 MB, so a cold first launch can take minutes).

`up` copies fixtures, refuses if a port is held by a process it didn't start, starts uvicorn and
Vite with logs in `.claude/skills/verify/.run/{backend,web}.log`, and waits until **usable**:
`/api/health` reports `"transcription_ready":true` and the web root answers. It prints
`ready: http://127.0.0.1:5183`. Cold start is ~10-20 s once models are on disk.

Fixtures (copied into `.claude/skills/verify/fixtures/`, gitignored):
- `clip.mov`: 27.6 s, 1920x1080 H.264, two hands, with sound. Source `PT_FIXTURE_VIDEO`, default
  `~/Desktop/test clip fr.mov`.
- `minuet.pdf`: Bach, Minuet in G minor BWV Anh. 115, one page. Source `PT_FIXTURE_SCORE`, default
  `~/Downloads/Bach - Minuet in G Minor - BWV Anh 115.pdf`.
  OMR reads it as "BWV Anhang 115", 199 notes; the clip reaches 97 of them.

## Doctor

```bash
.claude/skills/verify/verify.sh doctor
```

Read-only. Checks both pids are alive, each port is owned by *our* pid, `/api/health` is ok,
the web server proxies `/api/health` to the side backend (same JSON), fixtures exist, and prints
the git build (flags uncommitted backend/frontend changes). `WARN` lines: transcription model not
ready (notes fall back to motion estimates) or OMR unavailable (PDF scores fail). Run it first
whenever anything looks off; it ends with `doctor: healthy` or `doctor: NOT healthy`.

## Drive

Two harnesses:

**1. UI, in the built-in browser pane** (`mcp__Claude_Browser__*`). Open
`http://127.0.0.1:5183/#studio` with `preview_start` (`url`). Then, with `javascript_tool`, load the
in-page helpers (`page-helpers.js`, served at `/__verify/page-helpers.js`):

```js
const h = await import('/__verify/page-helpers.js');
await h.putFixture(h.dropZone('Performance video'), 'clip.mov');
await h.putFixture(h.dropZone('Score'), 'minuet.pdf');
```

`putFixture` fills the real `<input type=file>` with fixture bytes and fires `change`, the same
path the file picker takes (the pane can't drive a native file dialog). Click real buttons with
the `computer` tool using `find` refs (`find("Analyze")` → `button "Analyze"`), or
`h.clickButton('<text or aria-label>')`. Other helpers: `openTab('Summary'|'Keyboard'|'Score')`,
`waitForSession()`, `seekAndSettle(seconds)`, `captureFrame(name)`, `captureText(name)`,
`saveEvidence(name, body)`.

Stable handles in this app: tabs are `[role=tab]` named Summary / Keyboard / Score; errors are
`[role=alert]`; the engine badge is `header [role=status]`; transport buttons have aria-labels
`Play`/`Pause`, `Previous frame`, `Next frame`; seek is the range input `aria-label="Seek"`;
speeds are in `role=group aria-label="Playback speed"`; overlay toggles are buttons `Hands`/`Keys`
(`aria-pressed`). A session's URL is `#job=<32-hex id>`; reloading it reopens the session.

**2. API, headless** (`curl`). `verify.sh api-journey` runs the same multipart upload the UI
sends (`POST /api/jobs` with `video` + `score`), polls `GET /api/jobs/<id>`, saves the status trace
and `result.json`, asserts audio-mode notes and a parsed score, and adopts the job.

## Evidence

```bash
.claude/skills/verify/verify.sh evidence <label>   # prints the new dir and makes it current
```

Evidence lives in `.claude/skills/verify/evidence/<UTC timestamp>-<label>/` (gitignored) and
survives `down`. Page helpers write into the current dir through `POST /__verify/evidence/<name>`;
shell steps write there directly (`cat .claude/skills/verify/.run/evidence` for the path).

Proof standards:
- Drive the real user path: real inputs, real buttons, real `/api` through the Vite proxy. Don't
  call React setters, don't `fetch('/api/...')` from the page in place of a click, and don't pass
  an internal shortcut off as the UI journey.
- Capture the action and the resulting state: e.g. `captureText` of the progress view after
  clicking Analyze, then `captureText` + `captureFrame` of the session.
- Check side effects alongside the screen: the job dir `backend/data/jobs/<id>/` gains
  `result.json`, `tracks.npz`, `audio.json`, `background.jpg` (and `score.pdf.omr.json` for a PDF
  score); `curl 127.0.0.1:8010/api/jobs/<id>/result` matches what the Summary tab shows.
- Mocks: none. The models run for real (MPS on this Mac).
- `computer` screenshots are for your own eyes; they are not saved. Saved proof is the PNG/TXT/JSON
  in the evidence dir.

## Cleanup

```bash
.claude/skills/verify/verify.sh down
```

Stops only the pids recorded by `up` (plus their worker subprocesses), deletes only adopted job
dirs, warns about job dirs that appeared since `up` but were never adopted (it leaves those alone),
and keeps `evidence/`. Run it after every attempt, failed ones included. Close the browser tab
(`tabs_close`) when done.

## Gotchas

- **Hidden browser pane throttles `requestAnimationFrame` to about 1 fps.** The overlay canvas and
  the HUD clock update from rAF, so right after a seek they can still show the old frame (or
  nothing). Always use `seekAndSettle(seconds)` before capturing; it waits until the overlay has
  paint and the clock reads the new time.
- The browser pane must be on this machine (local desktop app session); a cloud session's linked
  pane can't reach `127.0.0.1:5183`.
- The UI journey gives you the job id only in the URL hash (`#job=<id>`); adopt it right away.
- Analysis of `clip.mov` + `minuet.pdf` takes ~30 s on Apple silicon. The first OMR run per PDF
  is slower; the result is cached next to the job's score file.
- iPhone HEVC videos don't play in Chromium (the app shows a "can't play this video format"
  panel). `clip.mov` is H.264, so it plays in the pane.

## Feature map

`features/README.md` indexes one file per user-facing feature: what it is, how a user reaches it,
how to drive it with this harness, and the end state that proves it. A proof that only drives one
convenient entry point is incomplete when the map lists others.
