"""Keyboard geometry: auto-detection from video, pitch mapping, and point->key lookup.

Coordinates
-----------
A calibration describes the visible keyboard as a quad in *normalized image
coordinates* (0..1, may extend slightly outside the frame when the end keys are
cut off) with corners ordered: back-left, back-right, front-right, front-left.
"Back" is the fallboard side (where black keys are), "front" is the player side.

Inside the quad we use *keyboard space* (u, v):
  u in [0, num_white]  -- measured in white-key widths from the low end
  v in [0, 1]          -- 0 at the back edge, 1 at the front edge

`mirrored` is True when low notes appear on the right of the image (selfie-style
mirrored footage); the quad corners are still given in image left->right order
and the flip is handled here.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field

import cv2
import numpy as np

# Pitch classes of the white keys, in order, and which white keys have a black
# key immediately above them (to their right).
WHITE_PCS = [0, 2, 4, 5, 7, 9, 11]  # C D E F G A B
HAS_BLACK_AFTER = {0: True, 2: True, 4: False, 5: True, 7: True, 9: True, 11: False}
# Real pianos don't centre black keys exactly on the white-key boundary.
# Offsets in white-key widths, keyed by the pitch class of the white key below.
BLACK_OFFSET = {0: -0.08, 2: 0.08, 5: -0.10, 7: 0.0, 9: 0.10}
BLACK_WIDTH = 0.58  # in white-key widths
NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def note_name(midi: int) -> str:
  return f"{NOTE_NAMES[midi % 12]}{midi // 12 - 1}"


def is_white(midi: int) -> bool:
  return midi % 12 in WHITE_PCS


def white_ordinal(midi: int) -> int:
  """Count of white keys below `midi` (a white key) starting from MIDI 0."""
  return (midi // 12) * 7 + WHITE_PCS.index(midi % 12)


def white_ordinal_to_midi(o: int) -> int:
  octave, pos = divmod(o, 7)
  return octave * 12 + WHITE_PCS[pos]


def white_index_to_midi(first_white_midi: int, i: int) -> int:
  """MIDI note of the i-th white key counting from `first_white_midi`."""
  return white_ordinal_to_midi(white_ordinal(first_white_midi) + i)


def midi_to_white_index(first_white_midi: int, midi: int) -> float:
  """Position of a key's centre in white-key units (u) from the low end.

  White keys map to i + 0.5; black keys to the boundary between their
  neighbours plus the realistic offset.
  """
  base = white_ordinal(first_white_midi)
  if is_white(midi):
    return white_ordinal(midi) - base + 0.5
  below = midi - 1
  return white_ordinal(below) - base + 1.0 + BLACK_OFFSET[below % 12]


@dataclass
class Calibration:
  quad: list  # [[x,y] back-left, back-right, front-right, front-left], normalized
  first_white_midi: int = 48  # lowest (fully or partially) visible white key
  num_white: int = 28
  black_depth: float = 0.62  # black keys extend from v=0 to v=black_depth
  mirrored: bool = False
  confidence: float = 0.0  # auto-detection confidence 0..1 (1 = user-confirmed)
  source: str = "default"  # "auto" | "user" | "default"
  notes: list = field(default_factory=list)  # human-readable detection notes

  def to_dict(self):
    return asdict(self)

  @classmethod
  def from_dict(cls, d: dict) -> "Calibration":
    known = {k: d[k] for k in cls.__dataclass_fields__ if k in d}
    cal = cls(**known)
    cal.first_white_midi = int(cal.first_white_midi)
    if not is_white(cal.first_white_midi):
      raise ValueError("first_white_midi must be a white key")
    if len(cal.quad) != 4:
      raise ValueError("quad must have 4 corners")
    return cal

  @classmethod
  def default(cls) -> "Calibration":
    return cls(quad=[[0.05, 0.35], [0.95, 0.35], [0.95, 0.70], [0.05, 0.70]])

  @property
  def lowest_midi(self):
    return self.first_white_midi

  @property
  def highest_midi(self):
    return white_index_to_midi(self.first_white_midi, self.num_white - 1)


class KeyboardMap:
  """Fast point <-> key lookups for a calibration and a frame size."""

  def __init__(self, cal: Calibration, width: int, height: int):
    self.cal = cal
    self.w, self.h = width, height
    src = np.array(cal.quad, dtype=np.float64) * [width, height]
    n = cal.num_white
    # In keyboard space the low end is u=0. If mirrored, the low end is on the
    # image right, so the quad's left corners map to u = n.
    if cal.mirrored:
      dst = np.array([[n, 0], [0, 0], [0, 1], [n, 1]], dtype=np.float64)
    else:
      dst = np.array([[0, 0], [n, 0], [n, 1], [0, 1]], dtype=np.float64)
    self.H = cv2.getPerspectiveTransform(src.astype(np.float32), dst.astype(np.float32))
    self.Hinv = np.linalg.inv(self.H)

  def to_key_space(self, pts_px: np.ndarray) -> np.ndarray:
    """(N,2) pixel coords -> (N,2) (u,v)."""
    pts = np.asarray(pts_px, dtype=np.float64).reshape(-1, 1, 2)
    return cv2.perspectiveTransform(pts, self.H).reshape(-1, 2)

  def to_image(self, uv: np.ndarray) -> np.ndarray:
    pts = np.asarray(uv, dtype=np.float64).reshape(-1, 1, 2)
    return cv2.perspectiveTransform(pts, self.Hinv).reshape(-1, 2)

  def key_at(self, u: float, v: float, tol: float = 0.0):
    """MIDI note under keyboard-space point, or None if off the keyboard."""
    cal = self.cal
    if not (-tol <= u <= cal.num_white + tol and -0.15 <= v <= 1.0 + tol):
      return None
    i = int(np.clip(np.floor(u), 0, cal.num_white - 1))
    if v < cal.black_depth:
      # Check the black keys on either side of this white key.
      for j in (i - 1, i):
        if j < 0:
          continue
        below = white_index_to_midi(cal.first_white_midi, j)
        if not HAS_BLACK_AFTER[below % 12]:
          continue
        c = j + 1.0 + BLACK_OFFSET[below % 12]
        if abs(u - c) <= BLACK_WIDTH / 2:
          return below + 1
    return white_index_to_midi(cal.first_white_midi, i)

  def key_center_u(self, midi: int) -> float:
    return midi_to_white_index(self.cal.first_white_midi, midi)

  def key_half_width(self, midi: int) -> float:
    return 0.5 if is_white(midi) else BLACK_WIDTH / 2

  def white_key_px(self) -> float:
    """Approximate white key width in pixels (at the keyboard's middle)."""
    n = self.cal.num_white
    a, b = self.to_image(np.array([[n / 2 - 0.5, 0.8], [n / 2 + 0.5, 0.8]]))
    return float(np.linalg.norm(a - b))


# --------------------------------------------------------------------------
# Auto-detection
# --------------------------------------------------------------------------

def background_frame(video_path: str, samples: int = 41) -> np.ndarray | None:
  """Median of frames sampled across the video -- moving hands drop out."""
  cap = cv2.VideoCapture(video_path)
  n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
  frames = []
  idxs = np.linspace(0, max(n - 1, 0), samples).astype(int) if n > 0 else []
  for k in idxs:
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(k))
    ok, f = cap.read()
    if ok:
      frames.append(f)
  if not frames:  # container without a frame count: read sequentially
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    while len(frames) < samples:
      ok, f = cap.read()
      if not ok:
        break
      frames.append(f)
  cap.release()
  if not frames:
    return None
  return np.median(np.stack(frames), axis=0).astype(np.uint8)


def _runs(mask: np.ndarray):
  """Start/end (exclusive) indices of True runs in a 1-D bool array."""
  m = np.concatenate([[False], mask, [False]]).astype(np.int8)
  d = np.diff(m)
  return list(zip(np.where(d == 1)[0], np.where(d == -1)[0]))


def detect_keyboard(bgr: np.ndarray) -> Calibration | None:
  """Find the keyboard in a (hand-free) frame.

  1. Locate the band of rows that is mostly white  -> front part of white keys.
  2. Grow upward through rows with a strong light/dark alternation -> black keys.
  3. Find black keys as dark runs, estimate white-key width from their spacing.
  4. The 2-3 grouping of black keys identifies which white key is C.
  """
  gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
  gray = cv2.GaussianBlur(gray, (5, 5), 0)
  h, w = gray.shape
  thr, _ = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
  bright = gray > thr
  frac = bright.mean(axis=1)

  # 1. white-only band: longest run of rows nearly as bright as the brightest.
  if frac.max() < 0.3:
    return None
  runs = [r for r in _runs(frac >= 0.85 * frac.max()) if r[1] - r[0] >= h * 0.02]
  if not runs:
    return None
  wy0, wy1 = max(runs, key=lambda r: r[1] - r[0])

  # 2. black-key band directly above: rows with many bright/dark transitions.
  def transitions(y):
    row = bright[y]
    return int(np.count_nonzero(row[1:] != row[:-1]))

  ref = np.median([transitions(y) for y in range(max(0, wy0 - 15), wy0)]) if wy0 > 0 else 0
  top = wy0
  if ref >= 6:
    y = wy0 - 1
    misses = 0
    while y > 0 and misses < 4:
      if transitions(y) >= ref * 0.5 and frac[y] > 0.12:
        top, misses = y, 0
      else:
        misses += 1
      y -= 1
  if wy0 - top < (wy1 - wy0) * 0.4:
    # No convincing black-key band; fall back to typical proportions.
    top = int(wy0 - (wy1 - wy0) * 1.6)
  top = max(top, 0)

  # 3. black keys: dark runs in a profile averaged over the black-key band.
  ya, yb = int(top + 0.25 * (wy0 - top)), int(top + 0.75 * (wy0 - top))
  profile = gray[ya:max(yb, ya + 1)].mean(axis=0)
  dark = profile < thr
  cand = [(a, b) for a, b in _runs(dark) if b - a >= 3]
  notes = []
  if len(cand) < 5:
    return None
  widths = np.array([b - a for a, b in cand])
  med_w = np.median(widths)
  blacks = [(a, b) for a, b in cand if 0.5 * med_w <= b - a <= 1.8 * med_w]
  # Drop partially-cut keys at the image edges for the spacing estimate.
  centers = np.array([(a + b) / 2 for a, b in blacks if a > 1 and b < w - 1])
  if len(centers) < 5:
    return None
  d = np.diff(centers)
  small = d[d < 1.5 * np.min(d) + 1e-6]
  W = float(np.median(small))  # white key width ~ spacing inside a group

  # Integer boundary index for each black key.
  k = np.concatenate([[0], np.cumsum(np.round(d / W))]).astype(int)
  # 4. find the pattern phase: boundary b (between white keys b-1 and b) has a
  # black key iff (b - p) mod 7 is in {1,2,4,5,6}, where white key p is a C.
  # The pattern is mirror-symmetric, so mirrored footage can't be told apart
  # here -- that is resolved from audio (see analysis.solve_calibration).
  scores = [np.isin((k - p) % 7, [1, 2, 4, 5, 6]).mean() for p in range(7)]
  p = int(np.argmax(scores))
  score = scores[p]

  # Refine x0 / W by least squares using realistic black-key offsets.
  pcs_below = [WHITE_PCS[(int(b) - 1 - p) % 7] for b in k]
  offs = np.array([BLACK_OFFSET.get(pc, 0.0) for pc in pcs_below])
  A = np.stack([np.ones_like(centers), k + offs], axis=1)
  (x0, W), *_ = np.linalg.lstsq(A, centers, rcond=None)

  # Visible white keys (white key i spans x0 + W*[i, i+1]): >=35% in frame.
  vis = [i for i in range(int(np.floor(-x0 / W)) - 2, int(np.ceil((w - x0) / W)) + 2)
         if min(x0 + W * (i + 1), w) - max(x0 + W * i, 0.0) >= 0.35 * W]
  if len(vis) < 7:
    return None
  i0, i1 = vis[0], vis[-1]
  xa, xb = x0 + W * i0, x0 + W * (i1 + 1)

  # Pitch: white key index p is a C. Default octave guess: C nearest the middle
  # of the visible keyboard is middle C (C4 = 60); refined later from audio.
  mid = (i0 + i1) / 2
  c_mid = p + 7 * round((mid - p) / 7)
  first_white_midi = white_ordinal_to_midi(white_ordinal(60) + (i0 - c_mid))

  # Black-key length: follow each black key down until it turns light.
  mid_y = (top + wy0) // 2
  bottoms = []
  for a, b in blacks:
    col = gray[mid_y:wy1, int((a + b) / 2)]
    light = np.where(col > thr)[0]
    if light.size:
      bottoms.append(mid_y + light[0])
  black_bottom = float(np.median(bottoms)) if bottoms else float(wy0)
  black_depth = float(np.clip((black_bottom - top) / max(wy1 - top, 1), 0.4, 0.8))
  quad = [[xa / w, top / h], [xb / w, top / h], [xb / w, wy1 / h], [xa / w, wy1 / h]]
  conf = float(score) * min(1.0, len(centers) / 10)
  notes.append(f"Found {len(blacks)} black keys, white key ≈ {W:.0f}px")
  notes.append("Octave guessed (middle C near centre) — set the lowest key if wrong")
  return Calibration(
      quad=[[round(float(x), 4), round(float(y), 4)] for x, y in quad],
      first_white_midi=int(first_white_midi),
      num_white=int(i1 - i0 + 1),
      black_depth=round(black_depth, 3),
      confidence=round(conf, 3),
      source="auto",
      notes=notes,
  )
