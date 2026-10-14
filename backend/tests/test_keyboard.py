import numpy as np
import pytest

from pianotracker.analysis import solve_calibration
from pianotracker.keyboard import (BLACK_OFFSET, BLACK_WIDTH, HAS_BLACK_AFTER, Calibration, KeyboardMap,
                                   detect_keyboard, white_index_to_midi)
from pianotracker.tracking import DETECTED, Tracks


def render_keyboard(w=1600, h=900, white_px=55.0, x0=-20.0, first_white=41, top=300, bottom=620,
                    num_white=None, offsets=None):
  """Draw a simple overhead keyboard: x0 = left edge of the first white key.

  num_white: draw only this many keys (the rest of the frame stays dark), like a
  whole keyboard filmed with margins. offsets: black-key offsets by the pitch
  class of the white key below (defaults to the model's own).
  """
  offsets = offsets or BLACK_OFFSET
  img = np.full((h, w, 3), 30, np.uint8)
  if num_white is None:
    img[top:bottom] = 235
  else:
    img[top:bottom, max(int(x0), 0):min(int(x0 + white_px * num_white), w)] = 235
  depth = int((bottom - top) * 0.62)
  i = 0
  while x0 + white_px * i < w and (num_white is None or i < num_white):
    x = int(round(x0 + white_px * i))
    img[top:bottom, max(x, 0):max(x + 2, 0)] = 120  # key gap
    m = white_index_to_midi(first_white, i)
    if HAS_BLACK_AFTER[m % 12] and (num_white is None or i < num_white - 1):
      c = x0 + white_px * (i + 1 + offsets[m % 12])
      a, b = int(c - white_px * BLACK_WIDTH / 2), int(c + white_px * BLACK_WIDTH / 2)
      img[top:top + depth, max(a, 0):max(min(b, w), 0)] = 15
    i += 1
  return img


@pytest.mark.parametrize("white_px,x0,first_white", [(55, -20, 41), (40, 13, 48), (70, -50, 53), (32, 5, 36)])
def test_detect_pitch_classes(white_px, x0, first_white):
  img = render_keyboard(white_px=white_px, x0=x0, first_white=first_white)
  cal = detect_keyboard(img)
  assert cal is not None
  km = KeyboardMap(cal, img.shape[1], img.shape[0])
  # Probe the front of several white keys: pitch class must be right.
  for i in range(2, 20):
    xc = x0 + white_px * (i + 0.5)
    if xc > img.shape[1] - white_px:
      break
    truth = white_index_to_midi(first_white, i)
    u, v = km.to_key_space(np.array([[xc, 600]]))[0]
    got = km.key_at(u, v)
    assert got % 12 == truth % 12, (i, got, truth)
  assert abs(km.white_key_px() - white_px) < 2


def test_black_keys_resolved():
  img = render_keyboard()
  cal = detect_keyboard(img)
  km = KeyboardMap(cal, img.shape[1], img.shape[0])
  hits = 0
  for i in range(1, 20):
    m = white_index_to_midi(41, i)
    if HAS_BLACK_AFTER[m % 12]:
      c = -20 + 55 * (i + 1 + BLACK_OFFSET[m % 12])
      u, v = km.to_key_space(np.array([[c, 360]]))[0]
      hits += (km.key_at(u, v) % 12) == ((m + 1) % 12)
  assert hits >= 10


def test_octave_solved_from_audio():
  """Fingertips sit on the keys of the played notes; the guess is an octave off."""
  w, h = 1600, 900
  true_cal = Calibration(quad=[[0.0, 0.33], [1.0, 0.33], [1.0, 0.70], [0.0, 0.70]], first_white_midi=36, num_white=29)
  km = KeyboardMap(true_cal, w, h)
  rng = np.random.default_rng(0)
  T = 300
  times = np.arange(T) / 30.0
  lm = np.full((2, T, 21, 3), np.nan, np.float32)
  notes = []
  for f in range(0, T, 6):
    pitch = int(rng.choice([48, 50, 52, 53, 55, 57, 59, 60, 62, 64]))
    u = km.key_center_u(pitch)
    px = km.to_image(np.array([[u, 0.8]]))[0] / [w, h]
    lm[1, f:f + 6] = np.r_[px, 0.0]  # all landmarks at the tip location: good enough
    notes.append({"onset": float(times[f] + 0.05), "pitch": pitch})
  state = np.where(np.isfinite(lm[..., 0, 0]), DETECTED, 0).astype(np.uint8)
  tr = Tracks(times, 30.0, w, h, lm, lm.copy(), state)
  guess = Calibration.from_dict({**true_cal.to_dict(), "first_white_midi": 48, "source": "auto"})
  solved, info = solve_calibration(guess, tr, notes)
  assert solved.first_white_midi == 36
  assert info["agreement_pct"] > 90


# Black keys pushed further from their boundaries than the model assumes, as on
# a real piano that broke detection: within-group spacing ~1.26 white keys,
# across E-F / B-C ~1.74, i.e. a ratio under 1.5.
SPREAD_OFFSETS = {0: -0.13, 2: 0.13, 5: -0.13, 7: 0.0, 9: 0.13}


def test_full_88_key_keyboard_with_margins():
  """Whole keyboard inside a wider frame (dark margins), ~33.6 px keys."""
  img = render_keyboard(w=1920, h=1080, white_px=33.6, x0=70.0, first_white=21, top=250, bottom=460,
                        num_white=52, offsets=SPREAD_OFFSETS)
  cal = detect_keyboard(img)
  assert cal is not None
  km = KeyboardMap(cal, img.shape[1], img.shape[0])
  assert cal.num_white == 52  # not extended into the margins
  assert cal.first_white_midi % 12 == 9  # starts on an A
  assert abs(km.white_key_px() - 33.6) < 1.0
  assert cal.confidence == 1.0  # black-key pattern fits perfectly
  # Every white key resolves to the right pitch class, all the way to the top end.
  for i in range(52):
    u, v = km.to_key_space(np.array([[70.0 + 33.6 * (i + 0.5), 440]]))[0]
    assert km.key_at(u, v) % 12 == white_index_to_midi(21, i) % 12, i


def test_unclear_black_key_spacing_is_rejected():
  """Evenly spaced dark bars (no 2-3 grouping) must not be read as a keyboard."""
  img = np.full((900, 1600, 3), 30, np.uint8)
  img[300:620] = 235
  for x in range(40, 1560, 60):
    img[300:500, x:x + 30] = 15
  assert detect_keyboard(img) is None
