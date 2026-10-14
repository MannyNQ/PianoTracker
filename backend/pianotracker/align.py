"""Align a performance (played notes) to a reference score.

Semi-global Needleman-Wunsch over onset-ordered pitch sequences:
  * free leading/trailing score gaps -> playing just a section is fine
  * substitutions allowed for near pitches (wrong note), otherwise miss+extra
  * second pass adds a timing term from a tempo map fitted on pass one, which
    stops repeated passages from being matched to the wrong repetition

Timing deviations are measured against the performer's own *local* tempo
(leave-one-out local linear fit), so rubato isn't punished as error.
"""

from __future__ import annotations

import numpy as np

MATCH = 3.0
GAP = -1.5
NEAR_SUB = -1.0  # wrong note within 2 semitones (or an octave slip)
CHORD_GAP = 0.06  # s: a gap longer than this starts a new played chord
REPAIR_TOL = 0.15  # s: missed+extra of the same pitch this close are re-paired


def _order_played(played):
  """Indices of played notes ordered by chord group, then pitch."""
  idx = sorted(range(len(played)), key=lambda i: played[i]["onset"])
  groups, cur, prev = [], [], None
  for i in idx:
    t = played[i]["onset"]
    if cur and t - prev > CHORD_GAP:
      groups.append(cur)
      cur = []
    cur.append(i)
    prev = t
  if cur:
    groups.append(cur)
  return [i for g in groups for i in sorted(g, key=lambda k: played[k]["pitch"])]


def _sub_matrix_row(sp, pp):
  d = np.abs(pp - sp)
  row = np.full(pp.shape, -np.inf)
  row[d == 0] = MATCH
  near = (d > 0) & ((d <= 2) | (d == 12))
  row[near] = NEAR_SUB
  return row


def _nw(s_pitch, p_pitch, time_cost=None):
  """Returns aligned pairs [(i or None, j or None)] (score idx, played idx)."""
  n, m = len(s_pitch), len(p_pitch)
  H = np.empty((n + 1, m + 1), dtype=np.float32)
  H[0] = GAP * np.arange(m + 1)
  H[:, 0] = 0.0  # free leading score gaps
  jj = np.arange(m + 1, dtype=np.float32)
  for i in range(1, n + 1):
    sub = _sub_matrix_row(s_pitch[i - 1], p_pitch)
    if time_cost is not None:
      sub = sub + time_cost(i - 1)
    diag = H[i - 1, :-1] + sub
    up = H[i - 1, 1:] + GAP
    tmp = np.empty(m + 1, dtype=np.float32)
    tmp[0] = H[i, 0]
    tmp[1:] = np.maximum(diag, up)
    # horizontal moves (extra played notes): H[j] = max_k<=j tmp[k] + (j-k)*GAP
    H[i] = np.maximum.accumulate(tmp - GAP * jj) + GAP * jj
  # free trailing score gaps: best end row in the last column
  i = int(np.argmax(H[:, m]))
  pairs = [(k, None) for k in range(n - 1, i - 1, -1)]
  j = m
  while i > 0 and j > 0:
    h = H[i, j]
    sub = _sub_matrix_row(s_pitch[i - 1], p_pitch[j - 1:j])[0]
    if time_cost is not None:
      sub += time_cost(i - 1)[j - 1]
    if np.isfinite(sub) and np.isclose(h, H[i - 1, j - 1] + sub, atol=1e-3):
      pairs.append((i - 1, j - 1))
      i, j = i - 1, j - 1
    elif np.isclose(h, H[i - 1, j] + GAP, atol=1e-3):
      pairs.append((i - 1, None))
      i -= 1
    else:
      pairs.append((None, j - 1))
      j -= 1
  while j > 0:
    pairs.append((None, j - 1))
    j -= 1
  while i > 0:
    pairs.append((i - 1, None))
    i -= 1
  pairs.reverse()
  return pairs


def _repair(pairs, s_pitch, p_pitch, p_time, pred):
  """Re-pair a missed score note with an extra played note of the same pitch
  when they're close in time (chord notes that landed in a different order)."""
  if pred is None:
    return pairs
  missed = [i for i, j in pairs if j is None]
  extra = {j for i, j in pairs if i is None}
  fixed = {}
  for i in missed:
    best = None
    for j in extra:
      dt = abs(p_time[j] - pred[i])
      if p_pitch[j] == s_pitch[i] and dt <= REPAIR_TOL and (best is None or dt < best[0]):
        best = (dt, j)
    if best:
      fixed[i] = best[1]
      extra.discard(best[1])
  if not fixed:
    return pairs
  used = set(fixed.values())
  out = []
  for i, j in pairs:
    if j is None and i in fixed:
      out.append((i, fixed[i]))
    elif i is None and j in used:
      continue
    else:
      out.append((i, j))
  return out


class TempoMap:
  """Maps score beats to performance seconds from matched (beat, time) pairs."""

  def __init__(self, beats, times, window=6):
    order = np.argsort(beats, kind="stable")
    self.b = np.asarray(beats, float)[order]
    self.t = np.asarray(times, float)[order]
    n = len(self.b)
    self.pred_loo = np.full(n, np.nan)
    self.local_spb = np.full(n, np.nan)  # seconds per beat
    for k in range(n):
      lo, hi = max(0, k - window), min(n, k + window + 1)
      sel = [q for q in range(lo, hi) if q != k]
      bb, tt = self.b[sel], self.t[sel]
      if len(sel) >= 2 and np.ptp(bb) > 1e-6:
        slope, icpt = np.polyfit(bb, tt, 1)
        if slope > 0:
          self.pred_loo[k] = slope * self.b[k] + icpt
          self.local_spb[k] = slope
    good = np.isfinite(self.local_spb)
    self.spb = float(np.median(self.local_spb[good])) if good.any() else 0.5
    # Smooth curve for predicting arbitrary beats: median-filtered fit.
    fit = np.where(np.isfinite(self.pred_loo), self.pred_loo, self.t)
    self._curve_b, self._curve_t = self.b, fit
    self._order = order

  def predict(self, beat):
    b, t = self._curve_b, self._curve_t
    if len(b) == 0:
      return np.asarray(beat, float) * self.spb
    beat = np.asarray(beat, float)
    y = np.interp(beat, b, t)
    y = np.where(beat < b[0], t[0] + (beat - b[0]) * self.spb, y)
    y = np.where(beat > b[-1], t[-1] + (beat - b[-1]) * self.spb, y)
    return y

  def loo_for(self, k_original):
    """Leave-one-out predicted time for the k-th pair as passed in."""
    pos = int(np.where(self._order == k_original)[0][0])
    return self.pred_loo[pos]


def align(score_notes, played):
  """-> dict with per-note results and summary metrics."""
  if not score_notes or not played:
    return None
  p_order = _order_played(played)
  s_pitch = np.array([n["pitch"] for n in score_notes], dtype=np.int16)
  p_pitch = np.array([played[j]["pitch"] for j in p_order], dtype=np.int16)
  p_time = np.array([played[j]["onset"] for j in p_order], dtype=np.float64)
  s_beat = np.array([n["beat"] for n in score_notes], dtype=np.float64)

  def fit_map(pairs):
    m = [(i, j) for i, j in pairs if i is not None and j is not None and s_pitch[i] == p_pitch[j]]
    if len(m) < 3:
      return None, m
    return TempoMap(s_beat[[i for i, _ in m]], p_time[[j for _, j in m]]), m

  pairs = _nw(s_pitch, p_pitch)
  tmap, _ = fit_map(pairs)
  if tmap is not None:
    pred = tmap.predict(s_beat)

    def time_cost(i):
      dt = np.abs(p_time - pred[i])
      return -np.clip((dt - 0.35) / 0.5, 0.0, 4.0).astype(np.float32)

    pairs = _nw(s_pitch, p_pitch, time_cost)
    tmap, matched = fit_map(pairs)
  else:
    matched = []

  pairs = _repair(pairs, s_pitch, p_pitch, p_time, tmap.predict(s_beat) if tmap is not None else None)
  if tmap is not None:
    tmap, matched = fit_map(pairs)

  # ---- classify
  score_res = [None] * len(score_notes)
  played_res = [None] * len(played)
  matched_idx = {(i, j): k for k, (i, j) in enumerate(matched)}
  aligned_beats = [s_beat[i] for i, j in pairs if i is not None and j is not None]
  b_lo = min(aligned_beats) if aligned_beats else 0.0
  b_hi = max(aligned_beats) if aligned_beats else 0.0
  for i, j in pairs:
    if i is not None and j is not None:
      pj = p_order[j]
      correct = s_pitch[i] == p_pitch[j]
      dev = None
      if correct and tmap is not None:
        loo = tmap.loo_for(matched_idx[(i, j)])
        if np.isfinite(loo):
          dev = round(float(p_time[j] - loo) * 1000.0, 1)
      status = "correct" if correct else "wrong"
      score_res[i] = {"status": status, "played": pj, "timing_ms": dev}
      played_res[pj] = {"status": status, "score": i, "expected_pitch": int(s_pitch[i]), "timing_ms": dev}
    elif i is not None:
      in_range = b_lo <= s_beat[i] <= b_hi
      score_res[i] = {"status": "missed" if in_range else "not_reached", "played": None, "timing_ms": None}
    else:
      pj = p_order[j]
      played_res[pj] = {"status": "extra", "score": None, "expected_pitch": None, "timing_ms": None}

  expected_time = tmap.predict(s_beat) if tmap is not None else s_beat * 0.5
  for i, r in enumerate(score_res):
    r["expected_time"] = round(float(expected_time[i]), 4)

  covered = [r for r in score_res if r["status"] != "not_reached"]
  n_cov = len(covered)
  correct = sum(r["status"] == "correct" for r in covered)
  wrong = sum(r["status"] == "wrong" for r in covered)
  missed = sum(r["status"] == "missed" for r in covered)
  extra = sum(r is not None and r["status"] == "extra" for r in played_res)
  devs = np.array([r["timing_ms"] for r in score_res if r and r["timing_ms"] is not None])
  precision = correct / len(played) if played else 0.0
  recall = correct / n_cov if n_cov else 0.0

  summary = {
      "score_notes": len(score_notes),
      "covered_notes": n_cov,
      "coverage_pct": round(100.0 * n_cov / len(score_notes), 1),
      "correct": correct,
      "wrong": wrong,
      "missed": missed,
      "extra": extra,
      "accuracy_pct": round(100.0 * recall, 1),
      "precision_pct": round(100.0 * precision, 1),
      "f1_pct": round(200.0 * precision * recall / (precision + recall), 1) if precision + recall else 0.0,
  }
  if devs.size:
    summary["timing"] = {
        "mean_abs_ms": round(float(np.mean(np.abs(devs))), 1),
        "median_ms": round(float(np.median(devs)), 1),  # <0 rushing, >0 dragging
        "std_ms": round(float(np.std(devs)), 1),
        "within_50ms_pct": round(100.0 * float(np.mean(np.abs(devs) <= 50)), 1),
        "within_100ms_pct": round(100.0 * float(np.mean(np.abs(devs) <= 100)), 1),
    }
  if tmap is not None:
    local = tmap.local_spb[np.isfinite(tmap.local_spb)]
    bpm = 60.0 / local if local.size else np.array([60.0 / tmap.spb])
    summary["tempo"] = {
        "bpm": round(float(np.median(bpm)), 1),
        "stability_pct": round(max(0.0, 100.0 * (1 - float(np.std(bpm) / np.mean(bpm)))), 1),
    }
  hands = {}
  for h in ("L", "R"):
    rs = [r for n, r in zip(score_notes, score_res) if n.get("hand") == h and r["status"] != "not_reached"]
    if rs:
      hands[h] = round(100.0 * sum(r["status"] == "correct" for r in rs) / len(rs), 1)
  if hands:
    summary["accuracy_by_hand_pct"] = hands
  return {"summary": summary, "score_results": score_res, "played_results": played_res}
