# Replay with overlay and live HUD

The session's video, with a canvas overlay (hand skeletons, key outlines, highlighted keys), a
live HUD (accuracy so far, right/wrong/miss/extra, streak, timing of the last note, per-hand
status), a transport bar and a piano roll.

## Sub-features

- Transport: **Play/Pause** (aria-label flips), **Previous frame** / **Next frame**, clock
  `m:ss / m:ss`, seek range (`aria-label="Seek"`) with red marks for wrong notes and posture
  episodes, speeds 0.25× / 0.5× / 0.75× / 1× (`role=group aria-label="Playback speed"`,
  `aria-pressed`), overlay toggles **Hands** and **Keys** (`aria-pressed`).
- Keyboard shortcuts (not when focus is in an input): Space = play/pause, ←/→ = one frame,
  Shift+←/→ = one second.
- Piano roll (`role=img`, aria-label starts "Piano roll of the notes around the playhead"):
  click to seek.
- HUD: "Accuracy so far" with counts, "N right in a row", Timing (early/late) or "Last note",
  Left/Right hand chips ("not visible" when untracked).

## How to get to it (user POV)

Finish an analysis (see analyze-performance.md); the session view shows the video on the left.

## Driving it with the in-app browser

```js
const h = await import('/__verify/page-helpers.js');
await h.seekAndSettle(12);
document.body.innerText.match(/\d+ right/)[0];        // "37 right" at 12 s for the fixture
await h.captureFrame('hud-12s.png');
h.clickButton('Hands');                                // overlay toggle
document.querySelector('button[aria-pressed]') && [...document.querySelectorAll('button')]
  .find((b) => b.textContent.trim() === 'Hands').getAttribute('aria-pressed');   // "false"
await h.seekAndSettle(12.5);
await h.captureFrame('hud-no-hands.png');             // key outlines, no skeleton
h.clickButton('0.5×');
document.querySelector('video').playbackRate;          // 0.5
```

Play/pause: `find("Play")` → click → `video.paused === false`; click `Pause` → `true`.
Piano-roll seek: click inside the `role=img` piano roll with `computer`, then read the clock.

Prove it: HUD counts change monotonically with time (compare at 2 s, 12 s, 25 s); the frame
PNGs differ between Hands on/off; speed buttons change `video.playbackRate`.

## Gotchas

- Hidden browser pane → rAF ~1 fps → overlay and HUD lag. Use `seekAndSettle`, never a fixed
  short sleep.
- While playing in a hidden pane the HUD updates rarely; verify at paused, settled positions.
- With the **Keyboard** tab's "Adjust keyboard on video" on, the HUD is hidden and the overlay
  shows draggable corners instead.
