"""Load a reference score as a flat list of notes.

Formats: MIDI and MusicXML directly; PDF and photos/scans (PNG/JPG) of sheet
music via optical music recognition (homr), which runs in its own environment
(backend/omr_venv) and produces MusicXML per page.

Each note: {"beat": float (quarter notes from start), "time": float (seconds at
the score's own tempo), "pitch": int, "duration_beats": float, "hand": "L"|"R"|None}
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile

MIDI_EXTS = (".mid", ".midi")
XML_EXTS = (".musicxml", ".xml", ".mxl")
OMR_EXTS = (".pdf", ".png", ".jpg", ".jpeg")
SUPPORTED = MIDI_EXTS + XML_EXTS + OMR_EXTS

BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OMR_PYTHON = os.path.join(BACKEND_DIR, "omr_venv", "bin", "python")
OMR_WORKER = os.path.join(BACKEND_DIR, "pianotracker", "_omr_worker.py")


def needs_omr(path: str) -> bool:
  return os.path.splitext(path)[1].lower() in OMR_EXTS


def omr_cache_path(path: str) -> str:
  return path + ".omr.json"


def omr_available() -> bool:
  return os.path.exists(OMR_PYTHON)


def load_score(path: str, progress=None) -> dict:
  """progress(frac, message) is called during sheet-music recognition."""
  ext = os.path.splitext(path)[1].lower()
  info = {"source": "file"}
  if ext in MIDI_EXTS:
    notes, title = _load_midi(path)
  elif ext in XML_EXTS:
    notes, title = _load_musicxml(path)
  elif ext in OMR_EXTS:
    notes, title, info = _load_omr(path, progress)
  else:
    raise ValueError(f"Unsupported score format '{ext}'. Use MIDI, MusicXML, PDF or an image.")
  if not notes:
    raise ValueError("The score contains no notes")
  notes.sort(key=lambda n: (n["beat"], n["pitch"]))
  return {"title": title or os.path.splitext(os.path.basename(path))[0], "notes": notes, **info}


def _load_omr(path: str, progress=None):
  """Sheet music PDF/image -> notes, via the homr worker. Cached next to the file."""
  cache = omr_cache_path(path)
  if os.path.exists(cache):
    with open(cache) as f:
      d = json.load(f)
    return d["notes"], d["title"], d["info"]
  if not omr_available():
    raise ValueError("PDF/image scores need the sheet-music reader. Install it with: "
                     "cd backend && python3 -m venv omr_venv && omr_venv/bin/pip install -r requirements-omr.txt")
  work = tempfile.mkdtemp(prefix="omr-")
  try:
    proc = subprocess.Popen([OMR_PYTHON, "-I", OMR_WORKER, path, work],
                            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    pages, warnings, error = None, [], None
    for line in proc.stdout:
      try:
        ev = json.loads(line)
      except ValueError:
        continue
      if "error" in ev:
        error = ev["error"]
      if "warning" in ev:
        warnings.append(ev["warning"])
      if "pages" in ev:
        pages = ev["pages"]
      if progress and "progress" in ev:
        total = ev.get("pages_total")
        msg = f"Reading sheet music (page {ev['page']} of {total})" if total else "Reading sheet music"
        progress(float(ev["progress"]), msg)
    proc.wait()
    if proc.returncode != 0 or not pages:
      raise ValueError(error or "Could not read the sheet music")
    # Stitch pages end to end: each page starts where the previous one ended.
    notes, title, offset = [], None, 0.0
    for page in pages:
      page_notes, page_title = _load_musicxml(page)
      title = title or page_title
      if not page_notes:
        continue
      for n in page_notes:
        n["beat"] = round(n["beat"] + offset, 4)
      notes.extend(page_notes)
      offset = max(n["beat"] + n["duration_beats"] for n in page_notes)
    bpm = 120.0
    for n in notes:
      n["time"] = round(n["beat"] * 60.0 / bpm, 4)
    info = {"source": "omr", "pages": len(pages), "omr_warnings": warnings}
  finally:
    shutil.rmtree(work, ignore_errors=True)
  with open(cache, "w") as f:
    json.dump({"notes": notes, "title": title, "info": info}, f)
  return notes, title, info


def _load_midi(path: str):
  import mido

  mf = mido.MidiFile(path)
  tpb = mf.ticks_per_beat
  # Merge all tracks into absolute ticks; tempo map from any track.
  events = []
  for ti, track in enumerate(mf.tracks):
    tick = 0
    for msg in track:
      tick += msg.time
      events.append((tick, ti, msg))
  events.sort(key=lambda e: e[0])
  tempo = 500000
  last_tick, last_sec = 0, 0.0
  active = {}
  notes = []
  hand_by_track = _guess_track_hands(mf)
  for tick, ti, msg in events:
    sec = last_sec + mido.tick2second(tick - last_tick, tpb, tempo)
    last_tick, last_sec = tick, sec
    if msg.type == "set_tempo":
      tempo = msg.tempo
    elif msg.type == "note_on" and msg.velocity > 0:
      if getattr(msg, "channel", 0) == 9:
        continue  # drums
      active.setdefault((msg.channel, msg.note), []).append((tick, sec, ti))
    elif msg.type in ("note_off", "note_on"):
      starts = active.get((msg.channel, msg.note))
      if starts:
        st, ss, sti = starts.pop(0)
        notes.append({
            "beat": round(st / tpb, 4),
            "time": round(ss, 4),
            "pitch": int(msg.note),
            "duration_beats": round((tick - st) / tpb, 4),
            "hand": hand_by_track.get(sti),
        })
  return notes, None  # MIDI track names are usually "Piano"/"RH": use the filename


def _guess_track_hands(mf) -> dict:
  """Two note-bearing tracks -> the lower one is the left hand."""
  avg = {}
  for ti, track in enumerate(mf.tracks):
    ps = [m.note for m in track if m.type == "note_on" and m.velocity > 0]
    if ps:
      avg[ti] = sum(ps) / len(ps)
  if len(avg) != 2:
    return {}
  lo, hi = sorted(avg, key=avg.get)
  return {lo: "L", hi: "R"}


def _load_musicxml(path: str):
  from music21 import converter

  s = converter.parse(path)
  s = s.stripTies(inPlace=False)
  title = s.metadata.title if s.metadata and s.metadata.title else None
  parts = list(s.parts) or [s]
  hands = {}
  if len(parts) == 2:
    hands = {0: "R", 1: "L"}  # piano grand staff: upper staff first
  notes = []
  for pi, part in enumerate(parts):
    # Offsets in a flattened part are absolute (in quarter notes).
    for el in part.flatten().notes:
      if el.duration.isGrace:
        continue
      offset = float(el.offset)
      for p in el.pitches:
        notes.append({
            "beat": round(offset, 4),
            "time": None,
            "pitch": int(p.midi),
            "duration_beats": round(float(el.quarterLength), 4),
            "hand": hands.get(pi),
        })
  # Seconds from the first metronome mark (default 120 bpm); good enough as a
  # reference -- alignment fits the performer's actual tempo anyway.
  bpm = 120.0
  for mm in s.recurse().getElementsByClass("MetronomeMark"):
    if mm.number:
      bpm = float(mm.getQuarterBPM() or mm.number)
      break
  for n in notes:
    n["time"] = round(n["beat"] * 60.0 / bpm, 4)
  return notes, title
