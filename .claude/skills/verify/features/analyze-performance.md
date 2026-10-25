# Analyze a performance

Upload a video of yourself playing (plus, optionally, the score) and get an analysis session:
hand tracking, notes heard from audio, each note matched to a finger, and grading against the score.

## Sub-features

- Landing page → **Open studio** (nav button and hero button both call the same handler; URL
  becomes `#studio`).
- Engine badge in the studio header (`header [role=status]`): "Engine ready on MPS", "Engine
  offline. Start the backend.", or "audio model still downloading".
- Upload view: **Performance video** drop zone (required), **Score** drop zone (optional:
  PDF, photo, MIDI, MusicXML), **Analyze** button (disabled until a video is chosen and the
  engine is up), **Remove file** (aria-label) on a chosen file, error banner `[role=alert]`.
- Progress view: stage list (Reading sheet music → Finding the keyboard → Tracking hands →
  Transcribing audio → Marking the performance), percent, **Cancel analysis**.
- Session opens on the Summary tab; URL becomes `#job=<id>`.
- Reopen: loading `#job=<id>` (reload or shared link) restores the session from the server.
- **New session** (header button, session view only) returns to the upload view.

## How to get to it (user POV)

Open the app, click **Open studio**, pick a video (and a score), click **Analyze**, wait about
30 s, land in the session.

## Driving it with the in-app browser

```js
// javascript_tool, on http://127.0.0.1:5183/#studio
const h = await import('/__verify/page-helpers.js');
await h.putFixture(h.dropZone('Performance video'), 'clip.mov');
await h.putFixture(h.dropZone('Score'), 'minuet.pdf');
document.querySelector('main').innerText.includes('Ready to analyze.');   // true
```

Then `find("Analyze")` and `computer left_click` the `button "Analyze"` ref. Right after:

```js
const h = await import('/__verify/page-helpers.js');
await h.captureText('progress.txt');   // "Analyzing clip.mov … Reading sheet music"
location.hash                          // "#job=<id>"
```

Adopt the id: `.claude/skills/verify/verify.sh adopt-job <id>`. Then wait and capture:

```js
const h = await import('/__verify/page-helpers.js');
await h.waitForSession();
await h.seekAndSettle(12);
await h.captureText('session.txt');
await h.captureFrame('frame-12s.png');
```

Prove it:
- `session.txt` has tabs `Summary* | Keyboard | Score`, "97 notes in 0:27", "BWV Anhang 115",
  "97 of 199 notes reached", "97 correct", "Fingering found 100%".
- `frame-12s.png` shows the video frame with key outlines and hand skeletons drawn on top.
- Side effects: `ls backend/data/jobs/<id>/` → `video.mov score.pdf score.pdf.omr.json
  background.jpg tracks.npz audio.json result.json`; `curl -s
  127.0.0.1:8010/api/jobs/<id>/result | python3 -m json.tool | head` agrees with the Summary tab.
- Reopen: `navigate` to `http://127.0.0.1:5183/#job=<id>` in a fresh tab → same session after
  `waitForSession()`.

Headless equivalent of the backend half: `verify.sh api-journey`.

## Gotchas

- The progress view flips to the session in ~30 s, so capture `progress.txt` straight after the
  click or it's gone.
- A video the backend can't decode fails at "Detecting keyboard" with "Could not read frames from
  the video" in the upload view's `[role=alert]`.
- A bad MIDI/MusicXML score is rejected synchronously (`400 Could not read score`); an unreadable
  PDF is not fatal, it becomes the first warning in the session.
- Cancel analysis only stops the UI from following; the backend job keeps running to completion.
  Adopt its id anyway.
