# Keyboard calibration

Fix the detected keyboard when highlighted keys don't match what was played, then re-score
instantly (tracking and audio are reused).

## Sub-features

- Status line: "The keyboard was detected automatically" or "set by you", plus detection notes.
- **Adjust keyboard on video** (`aria-pressed`) → drag four blue corners on the overlay canvas;
  button becomes **Done adjusting**.
- **Lowest visible white key** `<select>` (middle C labelled "(middle C)").
- **White keys in view**: buttons `aria-label="Fewer keys"` / `"More keys"` (range 7–52).
- **Black key length** range input (0.4–0.8).
- **Mirrored video** checkbox.
- **Apply and re-score** (enabled only when the draft differs; label "Re-scoring…" while busy),
  **Revert keyboard changes** (aria-label).

## How to get to it (user POV)

In a session, click the **Keyboard** tab.

## Driving it with the in-app browser

```js
const h = await import('/__verify/page-helpers.js');
h.openTab('Keyboard');
const before = document.querySelector('aside .tnum').textContent;    // white keys count
h.clickButton('More keys');
document.querySelector('aside .tnum').textContent;                   // before + 1
await h.captureText('calib-draft.txt');
```

Then `find("Apply and re-score")` → `computer left_click`. Wait until the button text is back to
"Apply and re-score" (disabled, since draft == result) and check the status line says "set by
you". Use `select` via `form_input` on the "Lowest visible white key" combobox; corner dragging
needs `computer left_click_drag` on the video after clicking **Adjust keyboard on video**.

Prove it: `POST /api/jobs/<id>/rescore` appears in `read_network_requests`; `curl
127.0.0.1:8010/api/jobs/<id>/result` now has `calibration.source == "user"` and the new
`num_white`; `result.json` mtime in `backend/data/jobs/<id>/` changed; `captureFrame` shows the
new key outlines.

## Gotchas

- Re-scoring a job that isn't done returns 409 "Analysis hasn't finished yet".
- A calibration change can legitimately change grading (notes attributed to different keys);
  compare against a fresh `result` rather than expecting the old numbers.
