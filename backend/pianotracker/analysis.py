"""Turn tracks + audio notes + calibration + score into the result payload.

`compute_results` is cheap (no ML) so the UI can re-score instantly after the
user adjusts the keyboard calibration or uploads a different score.
"""

from __future__ import annotations

import numpy as np
from scipy.ndimage import median_filter
from scipy.signal import find_peaks

from . import align as align_mod
from .keyboard import Calibration, KeyboardMap, note_name, white_index_to_midi
from .tracking import DETECTED, FINGERTIPS, Tracks

HANDS = ("L", "R")
ATTRIB_WINDOW = (-0.06, 0.10)  # s around an audio onset to look for the finger
KEY_TOL = 0.30  # white-key widths of slack when matching a fingertip to a key


# --------------------------------------------------------------------------
# Fingertips in keyboard space
# --------------------------------------------------------------------------

def tips_uv(tr: Tracks, km: KeyboardMap) -> np.ndarray:
  """(2, T, 5, 2) fingertip (u, v); NaN where the hand is missing."""
  pts = tr.lm[:, :, FINGERTIPS, :2] * np.array([tr.width, tr.height], np.float32)
  flat = pts.reshape(-1, 2)
  ok = np.isfinite(flat).all(1)
  out = np.full(flat.shape, np.nan)
  if ok.any():
    out[ok] = km.to_key_space(flat[ok])
  return out.reshape(pts.shape)


def _frames_near(tr: Tracks, t: float, window=ATTRIB_WINDOW):
  a = np.searchsorted(tr.times, t + window[0])
  b = np.searchsorted(tr.times, t + window[1], side="right")
  if b <= a:
    return [tr.frame_at(t)]
  return list(range(a, b))


def _note_agreement(notes, tr, uv, km: KeyboardMap, shift=0.0):
  """Fraction of notes with some fingertip on (or next to) the key."""
  if not notes:
    return 0.0
  hits = 0
  for n in notes:
    cu = km.key_center_u(n["pitch"]) - shift
    hw = km.key_half_width(n["pitch"]) + KEY_TOL
    fr = _frames_near(tr, n["onset"])
    tips = uv[:, fr].reshape(-1, 2)
    tips = tips[np.isfinite(tips).all(1)]
    if tips.size and np.any((np.abs(tips[:, 0] - cu) <= hw) & (tips[:, 1] > -0.2) & (tips[:, 1] < 1.25)):
      hits += 1
  return hits / len(notes)


ON_KEY_TOL = 0.5  # white-key widths: fingertip within half a key of the key's centre
ON_KEY_WARN_PCT = 75


def on_key_pct(notes, tr: Tracks, km: KeyboardMap):
  """Strict check that highlighted keys match the hands: % of heard notes with a
  fingertip within half a key of that key's centre. Only notes where some
  fingertip is over the keyboard count (a hand out of view says nothing).
  Returns (pct or None, number of notes considered)."""
  uv = tips_uv(tr, km)
  hits = considered = 0
  for n in notes:
    tips = uv[:, _frames_near(tr, n["onset"])].reshape(-1, 2)
    tips = tips[np.isfinite(tips).all(1) & (tips[:, 1] > -0.2) & (tips[:, 1] < 1.25)]
    if not len(tips):
      continue
    considered += 1
    hits += np.min(np.abs(tips[:, 0] - km.key_center_u(n["pitch"]))) <= ON_KEY_TOL
  return (round(100.0 * hits / considered, 1) if considered else None), considered


def solve_calibration(cal: Calibration, tr: Tracks, notes) -> tuple[Calibration, dict]:
  """Use audio to fix the octave (and mirroring) of an auto-detected keyboard.

  The image tells us where every C is but not *which* C. With audio we know
  which pitches were played, so try each octave shift (and mirrored or not)
  and keep the one where fingertips sit on the sounding keys most often.
  """
  info = {"checked": False}
  if not notes or len(notes) < 8:
    return cal, info
  sample = notes if len(notes) <= 400 else [notes[i] for i in np.linspace(0, len(notes) - 1, 400).astype(int)]
  best = None
  results = []
  for mirrored in (False, True):
    c = Calibration.from_dict({**cal.to_dict(), "mirrored": mirrored})
    km = KeyboardMap(c, tr.width, tr.height)
    trk = tr.swapped() if mirrored else tr
    uv = tips_uv(trk, km)
    for octave in range(-4, 5):
      fw = cal.first_white_midi + 12 * octave
      # Stay on a real 88-key range (one partial key of slack at each end).
      if fw < 19 or white_index_to_midi(fw, cal.num_white - 1) > 110:
        continue
      cand = Calibration.from_dict({**c.to_dict(), "first_white_midi": fw})
      kmc = KeyboardMap(cand, tr.width, tr.height)
      score = _note_agreement(sample, trk, uv, kmc)
      results.append((score, mirrored, octave))
      if best is None or score > best[0] + 1e-9:
        best = (score, cand)
  score, solved = best
  base = next((s for s, m, o in results if not m and o == 0), 0.0)
  info = {"checked": True, "agreement_pct": round(100 * score, 1), "before_pct": round(100 * base, 1)}
  if cal.source == "user":
    # Respect the user's settings; just report if they look wrong.
    info["suggestion"] = None if score - base < 0.15 else {
        "first_white_midi": solved.first_white_midi, "mirrored": solved.mirrored}
    return cal, info
  if score - base >= 0.05:
    solved.notes = list(cal.notes) + [
        f"Octave/orientation set from audio ({round(100 * score)}% of notes matched a fingertip)"]
    solved.notes = [n for n in solved.notes if not n.startswith("Octave guessed")]
    return solved, info
  return cal, info


# --------------------------------------------------------------------------
# Notes
# --------------------------------------------------------------------------

def attribute_fingers(notes, tr: Tracks, km: KeyboardMap):
  """For each audio note, find which hand/finger played it."""
  uv = tips_uv(tr, km)
  out = []
  for n in notes:
    cu = km.key_center_u(n["pitch"])
    hw = km.key_half_width(n["pitch"])
    black = not (n["pitch"] % 12 in (0, 2, 4, 5, 7, 9, 11))
    best = None
    for f in _frames_near(tr, n["onset"]):
      for s in (0, 1):
        for k in range(5):
          u, v = uv[s, f, k]
          if not np.isfinite(u):
            continue
          du = max(0.0, abs(u - cu) - hw)
          if du > KEY_TOL or not (-0.2 < v < 1.25):
            continue
          cost = du + 0.15 * abs(u - cu)
          if black and v > km.cal.black_depth + 0.1:
            cost += 0.3  # a black key is played from the back of the keyboard
          if tr.state[s, f] != DETECTED:
            cost += 0.1
          if best is None or cost < best[0]:
            best = (cost, s, k)
    nn = dict(n)
    nn["name"] = note_name(n["pitch"])
    if best:
      nn["hand"], nn["finger"] = HANDS[best[1]], best[2] + 1
      nn["finger_conf"] = round(float(max(0.0, 1.0 - best[0] / (KEY_TOL + 0.3))), 2)
    else:
      nn["hand"], nn["finger"], nn["finger_conf"] = None, None, 0.0
    out.append(nn)
  return out


def visual_notes(tr: Tracks, km: KeyboardMap):
  """Video-only fallback: estimate key presses from fingertip motion.

  A candidate press is a fingertip that (1) dips away from the camera relative
  to its own knuckle, well above its noise level, (2) is nearly still on the
  keys at that moment, and (3) dips clearly more than the hand's other
  fingers. Conservative by design: from a single overhead camera, pressing and
  hovering look very similar, so this is an estimate, not a measurement.
  """
  uv = tips_uv(tr, km)
  notes = []
  dt = float(np.median(np.diff(tr.times))) if len(tr.times) > 1 else 1 / 30
  win = max(3, int(round(0.4 / dt)) | 1)
  for s in (0, 1):
    Z = tr.lm[s][:, FINGERTIPS, 2] - tr.lm[s][:, [1, 5, 9, 13, 17], 2]  # (T, 5)
    ok = np.isfinite(Z).all(1)
    if ok.sum() < win * 2:
      continue
    Zf = np.where(np.isfinite(Z), Z, np.nanmedian(Z, 0))
    sig = Zf - median_filter(Zf, size=(win, 1), mode="nearest")
    speed = np.linalg.norm(np.gradient(np.nan_to_num(uv[s]), axis=0), axis=2) / dt  # white keys/s
    for k in range(5):
      mad = float(np.median(np.abs(sig[ok, k]))) + 1e-6
      peaks, _ = find_peaks(sig[:, k], prominence=7.0 * mad, distance=max(1, int(0.12 / dt)))
      for p in peaks:
        if not ok[p] or speed[p, k] > 2.0 or sig[p, k] < 0.6 * np.max(sig[p]):
          continue
        u, v = uv[s, p, k]
        if not (np.isfinite(u) and 0.0 <= v <= 1.05):
          continue
        pitch = km.key_at(u, v)
        if pitch is None:
          continue
        notes.append({
            "onset": round(float(tr.times[p]), 4), "offset": round(float(tr.times[p]) + 0.2, 4),
            "pitch": int(pitch), "velocity": None, "name": note_name(pitch),
            "hand": HANDS[s], "finger": k + 1, "finger_conf": 0.4,
        })
  notes.sort(key=lambda n: (n["onset"], n["pitch"]))
  return notes


# --------------------------------------------------------------------------
# Posture
# --------------------------------------------------------------------------

def _episodes(flag: np.ndarray, times: np.ndarray, min_dur=0.5, merge_gap=0.25):
  eps = []
  m = np.concatenate([[False], flag, [False]]).astype(np.int8)
  starts = np.where(np.diff(m) == 1)[0]
  ends = np.where(np.diff(m) == -1)[0]
  for a, b in zip(starts, ends):
    ta, tb = times[a], times[min(b, len(times) - 1)]
    if eps and ta - eps[-1][1] < merge_gap:
      eps[-1][1] = tb
    else:
      eps.append([ta, tb])
  return [(a, b) for a, b in eps if b - a >= min_dur]


def posture(tr: Tracks, km: KeyboardMap):
  """Per-frame hand alignment + wrist sag, and episodes of poor posture."""
  q = np.array(km.cal.quad) * [tr.width, tr.height]
  back = ((q[0] + q[1]) / 2) - ((q[3] + q[2]) / 2)  # front -> back direction
  back /= np.linalg.norm(back) + 1e-9
  # Toward the player's right (high notes): image-right unless mirrored.
  right = np.array([-back[1], back[0]])
  if km.cal.mirrored:
    right = -right
  per_frame = {}
  episodes = []
  summary = {}
  for s, hand in enumerate(HANDS):
    ok = tr.state[s] > 0
    P = tr.lm[s, :, :, :2] * [tr.width, tr.height]
    vec = P[:, 9] - P[:, 0]
    # Signed angle of the hand vs. straight-into-the-keys; + = toward the
    # player's pinky side (ulnar deviation), - = thumb side.
    ang = np.degrees(np.arctan2(vec @ right, vec @ back))
    ulnar = ang if hand == "R" else -ang
    W = tr.world[s]
    drop = (W[:, 0, 2] - W[:, [5, 9, 13, 17], 2].mean(1)) * 1000.0  # mm, + = wrist lower
    base = np.nanmedian(drop[ok]) if ok.any() else 0.0
    sag = drop - base
    align_bad = ok & (np.abs(np.nan_to_num(ulnar)) > 25)
    sag_bad = ok & (np.nan_to_num(sag) > 15)
    per_frame[hand] = {"angle": ulnar, "sag": sag, "bad": align_bad | sag_bad}
    for kind, flag, val in (("alignment", align_bad, ulnar), ("wrist_sag", sag_bad, sag)):
      for a, b in _episodes(flag, tr.times):
        sel = (tr.times >= a) & (tr.times <= b)
        episodes.append({"hand": hand, "kind": kind, "start": round(float(a), 3), "end": round(float(b), 3),
                         "peak": round(float(np.nan_to_num(np.nanmax(np.abs(val[sel])))), 1)})
    tracked = int(ok.sum())
    bad_time = sum(e["end"] - e["start"] for e in episodes if e["hand"] == hand)
    dur = float(tr.times[-1] - tr.times[0]) * (tracked / max(len(tr.times), 1)) or 1e-9
    summary[hand] = {
        "tracked_s": round(dur, 1),
        "good_pct": round(max(0.0, 100.0 * (1 - bad_time / dur)), 1) if tracked else None,
        "median_angle_deg": round(float(np.nanmedian(ulnar[ok])), 1) if tracked else None,
    }
  episodes.sort(key=lambda e: e["start"])
  return per_frame, episodes, summary


# --------------------------------------------------------------------------
# Payload
# --------------------------------------------------------------------------

def _frames_payload(tr: Tracks, per_frame):
  """Compact per-frame landmarks for the overlay: 21 (x, y) per hand."""
  hands = {}
  for s, hand in enumerate(HANDS):
    pts = np.round(tr.lm[s, :, :, :2].astype(np.float64), 4)
    st = tr.state[s].tolist()
    bad = per_frame[hand]["bad"].tolist()
    hands[hand] = {
        "state": st,
        "bad": [1 if b else 0 for b in bad],
        "pts": [None if not st[i] else pts[i].reshape(-1).tolist() for i in range(len(st))],
    }
  return {"t": np.round(tr.times, 4).tolist(), "hands": hands}


def compute_results(tr: Tracks, cal: Calibration, audio_notes, pedals, score, source_info: dict):
  warnings = []
  solve_info = {"checked": False}
  if audio_notes:
    cal, solve_info = solve_calibration(cal, tr, audio_notes)
    pct, considered = on_key_pct(audio_notes, tr.swapped() if cal.mirrored else tr,
                                 KeyboardMap(cal, tr.width, tr.height))
    solve_info["on_key_pct"] = pct
    if pct is not None and considered >= 8 and pct < ON_KEY_WARN_PCT:
      warnings.append(f"Only {pct:.0f}% of the notes heard had a fingertip on the matching key, so the "
                      "keyboard calibration is probably off and highlighted keys may not match what you "
                      "played. Check the corners and lowest key in the Keyboard tab.")
    if solve_info.get("suggestion"):
      sg = solve_info["suggestion"]
      warnings.append(f"Audio suggests the lowest key is {note_name(sg['first_white_midi'])}"
                      + (" with mirrored footage" if sg["mirrored"] else "") + ".")
  if cal.source == "auto" and cal.pattern_fit < 0.95:
    warnings.append(f"Keyboard detection was uncertain (black keys matched the piano pattern "
                    f"{100 * cal.pattern_fit:.0f}%). Check the key labels in the Keyboard tab.")
  trk = tr.swapped() if cal.mirrored else tr
  km = KeyboardMap(cal, tr.width, tr.height)

  if audio_notes:
    mode = "audio"
    notes = attribute_fingers(audio_notes, trk, km)
  else:
    mode = "video"
    notes = visual_notes(trk, km)
    warnings.append("No audio found — notes are estimated from finger motion only and may be "
                    "unreliable. Record with sound for accurate note detection and scoring.")

  per_frame, episodes, posture_summary = posture(trk, km)

  score_payload = None
  score_summary = None
  if score:
    res = align_mod.align(score["notes"], notes)
    if res:
      for n, r in zip(notes, res["played_results"]):
        n.update({"status": r["status"], "expected_pitch": r["expected_pitch"], "timing_ms": r["timing_ms"]})
      score_summary = res["summary"]
      if score.get("source") == "omr":
        warnings.append(f"Score read from sheet music ({score.get('pages', 1)} page"
                        f"{'s' if score.get('pages', 1) != 1 else ''}) by music recognition. If grading "
                        "looks off in a passage, the score may have been misread there; MIDI or MusicXML "
                        "is exact.")
        warnings.extend(score.get("omr_warnings") or [])
      score_payload = {
          "title": score["title"],
          "source": score.get("source", "file"),
          "notes": [{"pitch": sn["pitch"], "name": note_name(sn["pitch"]), "beat": sn["beat"],
                     "hand": sn.get("hand"), **sr} for sn, sr in zip(score["notes"], res["score_results"])],
      }
      if score_summary["coverage_pct"] < 20:
        warnings.append("Only a small part of the score was matched — is this the right piece?")
  else:
    for n in notes:
      n.update({"status": None, "expected_pitch": None, "timing_ms": None})

  fingers = {h: {str(f): 0 for f in range(1, 6)} for h in HANDS}
  for n in notes:
    if n["hand"]:
      fingers[n["hand"]][str(n["finger"])] += 1
  vel = [n["velocity"] for n in notes if n.get("velocity")]
  summary = {
      "mode": mode,
      "duration_s": round(float(tr.times[-1]), 2) if len(tr.times) else 0,
      "notes_played": len(notes),
      "notes_attributed_pct": round(100.0 * sum(1 for n in notes if n["hand"]) / len(notes), 1) if notes else 0,
      "pitch_range": [note_name(min(n["pitch"] for n in notes)), note_name(max(n["pitch"] for n in notes))] if notes else None,
      "dynamics": {"mean_velocity": round(float(np.mean(vel)), 1), "evenness_pct": round(max(0.0, 100 * (1 - np.std(vel) / (np.mean(vel) + 1e-9))), 1)} if vel else None,
      "fingers": fingers,
      "posture": posture_summary,
      "posture_episodes": len(episodes),
      "tracking": tr.quality(),
      "score": score_summary,
      "calibration_check": solve_info,
  }
  return {
      "summary": summary,
      "warnings": warnings,
      "calibration": cal.to_dict(),
      "video": {"width": tr.width, "height": tr.height, "fps": round(tr.fps, 3)},
      "notes": notes,
      "pedals": pedals or [],
      "score": score_payload,
      "posture_episodes": episodes,
      "frames": _frames_payload(trk, per_frame),
      "source": source_info,
  }
