# Score attach / replace / remove

Grade against a score: attach it at upload time, or add, replace or remove it after analysis
(re-scoring reuses tracking and audio). PDFs and photos are read by OMR (homr); MIDI and
MusicXML are exact.

## Sub-features

- Upload view: **Score** drop zone (optional), accepts `.pdf,.png,.jpg,.jpeg,.mid,.midi,.musicxml,.xml,.mxl`.
- Score tab with a score: title, "N notes", "read from sheet music" badge for OMR,
  **Remove score** (aria-label), **Replace score**.
- Score tab without one: "No score attached…" and **Upload score**.
- Busy labels: "Reading sheet music…" (PDF/photo) or "Scoring…".

## How to get to it (user POV)

At upload: pick a file in the Score drop zone. After analysis: **Score** tab.

## Driving it with the in-app browser

Remove, then re-attach the fixture PDF:

```js
const h = await import('/__verify/page-helpers.js');
h.openTab('Score');
h.clickButton('Remove score');
// wait for busy to clear, then:
document.querySelector('aside').innerText.includes('No score attached');   // true
await h.putFixture(document.querySelector('aside'), 'minuet.pdf');
// wait until the button reads "Replace score"
await h.captureText('score-reattached.txt');   // "BWV Anhang 115", "199 notes", "read from sheet music"
```

Prove it: after remove, `curl 127.0.0.1:8010/api/jobs/<id>/result` has `score == null` and the
Summary tab loses the accuracy block; after re-attach, `score.source == "omr"`, 199 notes, and
`backend/data/jobs/<id>/score.pdf(.omr.json)` exist.

## Gotchas

- No MIDI or MusicXML fixture ships with the skill, so the exact-score path (and the synchronous
  400 on a malformed MIDI) is unproven until one is added under `fixtures/` (for example exported
  from MuseScore) and `verify.sh fixtures` learns to copy it.
- OMR needs `backend/omr_venv`; `doctor` warns when `sheet_music_ready` is false, and PDF uploads
  then fail with a 400 from rescore.
