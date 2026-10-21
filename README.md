

https://github.com/user-attachments/assets/eee71761-c9da-4f96-9ff5-bd26a5ff1a64





# PianoTracker Pro

Upload a video of yourself playing piano. The app tracks both hands (skeleton, fingertips, wrists),
detects every note you play, matches each note to the finger that played it, and grades the
performance against a score sheet (PDF, photo, MIDI or MusicXML) in a live HUD over the video.

## Running it

**Backend** (Python 3.14, Apple silicon GPU is used automatically):

```bash
cd backend
python3 -m venv venv && venv/bin/pip install -r requirements.txt   # first time only
venv/bin/python main.py                                             # http://127.0.0.1:8000
```

**Sheet-music reader** (optional, for PDF/photo scores). It lives in its own venv because it needs a
different OpenCV build than MediaPipe:

```bash
cd backend
python3 -m venv omr_venv && omr_venv/bin/pip install -r requirements-omr.txt && omr_venv/bin/homr --init
```

On first start it downloads two models into `backend/models/`: the MediaPipe hand model (8 MB) and the
piano transcription model (172 MB, from Zenodo; the download resumes if interrupted).

**Frontend:**

```bash
cd frontend
npm install        # first time only
npm run dev        # http://localhost:5173  (proxies /api to the backend)
```

**Tests:** `cd backend && venv/bin/python -m pytest -q`

## How it works

| Stage | What happens |
|---|---|
| Keyboard | The median of ~40 frames removes moving hands; white/black keys are found from brightness, and the 2-3 grouping of black keys identifies every C. With audio, the octave (and mirroring) is solved by checking which choice puts fingertips on the keys being heard. Adjustable in the **Keyboard** tab. |
| Hands | MediaPipe in video mode on every frame, then: duplicate suppression, left/right identity (MediaPipe label + thumb-side geometry + continuity), rejection of collapsed/spiking detections, gap filling up to 0.35 s, and lag-free smoothing. |
| Notes | **With audio:** ByteDance's piano transcription model gives exact pitches/onsets/velocities; each note is attributed to the fingertip on that key. **Without audio:** a conservative estimate from fingertip motion, clearly labelled. |
| Sheet music | PDFs are rendered at 300 dpi and read page by page with [homr](https://github.com/liebharc/homr) (optical music recognition), then stitched into one score. The result is cached, so re-scoring doesn't re-read it. An unreadable PDF doesn't stop the analysis; you get a warning instead. Recognition of clean printed scores is very good (203/204 notes on a test Bach minuet); handwritten or dense scores less so, and MIDI/MusicXML are always exact. |
| Score | Notes are aligned to the score (semi-global sequence alignment + a tempo-aware second pass), so partial run-throughs are fine. Each note is correct / wrong / missed / extra; timing is measured against your own local tempo. |
| Posture | Hand angle relative to the keys (reliable from above) and wrist sag relative to your own baseline (experimental, 3-D estimate). |

Re-scoring after changing the calibration or score reuses the cached tracking and audio (well under a second).

## Recording tips

- Camera above the keyboard (overhead or high angle), with the whole section you play in frame.
- **Record with sound.** Audio is what makes note detection exact.
- Even lighting; keep wrists visible.
- iPhone HEVC videos play in Safari; for Chrome, export as H.264.
