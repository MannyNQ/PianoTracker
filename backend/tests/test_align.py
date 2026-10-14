import numpy as np

from pianotracker.align import align


def make_score(n_bars=8):
  # Repetitive C-major figure (worst case for naive alignment) + LH chords.
  rh = [60, 64, 67, 72, 67, 64, 60, 62]
  notes = []
  for bar in range(n_bars):
    for k, p in enumerate(rh):
      notes.append({"beat": bar * 4 + k * 0.5, "pitch": p, "hand": "R"})
    for p in (48, 52, 55):
      notes.append({"beat": bar * 4, "pitch": p, "hand": "L"})
  notes.sort(key=lambda n: (n["beat"], n["pitch"]))
  return notes


def perform(score, spb=0.55, jitter_ms=15, seed=0):
  rng = np.random.default_rng(seed)
  out = []
  for n in score:
    rubato = 0.25 * np.sin(n["beat"] / 6)  # smooth tempo drift (seconds)
    t = 1.0 + n["beat"] * spb + rubato + rng.normal(0, jitter_ms / 1000)
    out.append({"onset": t, "pitch": n["pitch"]})
  return out


def test_perfect_performance():
  s = make_score()
  r = align(s, perform(s))["summary"]
  assert r["accuracy_pct"] == 100.0
  assert r["extra"] == 0 and r["missed"] == 0
  assert r["timing"]["mean_abs_ms"] < 30
  assert abs(r["tempo"]["bpm"] - 60 / 0.55) < 8


def test_errors_are_classified():
  s = make_score()
  p = perform(s)
  p[10]["pitch"] += 1  # wrong note
  del p[20]  # missed note
  p.append({"onset": p[30]["onset"] + 0.2, "pitch": 90})  # extra note
  r = align(s, p)["summary"]
  assert r["wrong"] == 1
  assert r["missed"] == 1
  assert r["extra"] == 1
  assert r["correct"] == len(s) - 2


def test_partial_performance_not_penalised():
  s = make_score(8)
  section = [n for n in s if 8 <= n["beat"] < 20]
  r = align(s, perform(section))["summary"]
  assert r["accuracy_pct"] == 100.0
  assert r["coverage_pct"] < 50


def test_late_notes_measured():
  s = make_score()
  p = perform(s, jitter_ms=0)
  # make one isolated RH note 120ms late
  i = next(k for k, n in enumerate(s) if n["beat"] == 9.5)
  p[i]["onset"] += 0.12
  res = align(s, p)
  dev = res["score_results"][i]["timing_ms"]
  assert 90 < dev < 150
