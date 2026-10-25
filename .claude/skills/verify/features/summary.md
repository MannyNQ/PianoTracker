# Summary tab

The whole-performance report next to the replay: what was heard, grading against the score,
timing, tempo, technique, finger usage and tracking quality.

## Sub-features

- "Heard and seen": "N notes in m:ss", warnings (keyboard uncertain, OMR caveat, motion-only mode).
- Note accuracy (with a score): percent, score title, "X of Y notes reached", correct / wrong /
  missed / extra.
- Timing error (ms, % within 50 ms), Tendency (rushing/dragging), Tempo (bpm, steadiness),
  By hand (left/right accuracy).
- Technique: left/right posture %, dynamics evenness, "Fingering found" %; list of posture
  episodes (e.g. "Right wrist sagging 0:01, 0.6 s"), each a button that seeks the video.
- Finger usage bars per hand (each bar has `title="<Finger>: <count>"`).
- Tracking quality per hand.

## How to get to it (user POV)

It's the default tab when a session opens; otherwise click **Summary**.

## Driving it with the in-app browser

```js
const h = await import('/__verify/page-helpers.js');
h.openTab('Summary');
const text = await h.captureText('summary.txt');
// Posture episode → seek
[...document.querySelectorAll('aside button')].find((b) => /wrist sagging|hand angled/.test(b.textContent)).click();
await new Promise((r) => setTimeout(r, 3000));
document.querySelector('video').currentTime;          // ≈ the episode start (~1 s for the fixture)
```

Prove it: numbers in `summary.txt` equal `result.summary` / `result.score` from
`curl -s 127.0.0.1:8010/api/jobs/<id>/result` (notes_played, notes_attributed_pct, posture
good_pct, score title and note count); the episode button moves the video to `episode.start`.

## Gotchas

- Without a score, the accuracy/timing block is replaced by "Add a score to grade"-style copy;
  use the fixture score to see grading.
- Without audio, the summary says notes are estimated from motion; `clip.mov` has audio.
