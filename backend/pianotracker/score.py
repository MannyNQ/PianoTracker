"""Load a reference score (MIDI or MusicXML) as a flat list of notes.

Each note: {"beat": float (quarter notes from start), "time": float (seconds at
the score's own tempo), "pitch": int, "duration_beats": float, "hand": "L"|"R"|None}
"""

from __future__ import annotations

import os

SUPPORTED = (".mid", ".midi", ".musicxml", ".xml", ".mxl")


def load_score(path: str) -> dict:
  ext = os.path.splitext(path)[1].lower()
  if ext in (".mid", ".midi"):
    notes, title = _load_midi(path)
  elif ext in (".musicxml", ".xml", ".mxl"):
    notes, title = _load_musicxml(path)
  else:
    raise ValueError(f"Unsupported score format '{ext}'. Use MIDI or MusicXML.")
  if not notes:
    raise ValueError("The score contains no notes")
  notes.sort(key=lambda n: (n["beat"], n["pitch"]))
  return {"title": title or os.path.splitext(os.path.basename(path))[0], "notes": notes}


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
