"""Robust two-hand tracking over a whole video.

MediaPipe gives per-frame detections. Reliability comes from post-processing,
which we can do offline (the whole video is available):

  * VIDEO running mode, every frame (temporal tracking inside MediaPipe)
  * duplicate suppression (MediaPipe occasionally reports one hand twice)
  * left/right identity from three cues: MediaPipe handedness, hand chirality
    (which side the thumb is on relative to the finger direction), and
    continuity with the previous frame
  * rejection of collapsed / spiking detections (motion blur)
  * linear gap filling for short dropouts (marked as interpolated)
  * zero-lag smoothing (median-3 + Savitzky-Golay, applied forwards/backwards)

Hand slots: 0 = left, 1 = right, *as they appear*. For mirrored footage the
analysis stage swaps them.
"""

from __future__ import annotations

import os
import urllib.request
from dataclasses import dataclass

import cv2
import numpy as np
from scipy.ndimage import median_filter
from scipy.signal import savgol_filter

MODEL_URL = (
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/"
    "hand_landmarker/float16/1/hand_landmarker.task"
)
FINGERTIPS = [4, 8, 12, 16, 20]
FINGER_CHAINS = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [17, 18, 19, 20]]
MISSING, DETECTED, INTERPOLATED = 0, 1, 2
MAX_DETECT_DIM = 1920


def ensure_hand_model(path: str) -> str:
  if not os.path.exists(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".part"
    urllib.request.urlretrieve(MODEL_URL, tmp)
    os.replace(tmp, path)
  return path


@dataclass
class Tracks:
  times: np.ndarray  # (T,) seconds, starting at 0
  fps: float
  width: int
  height: int
  lm: np.ndarray  # (2, T, 21, 3) normalized image x, y and relative z; NaN if missing
  world: np.ndarray  # (2, T, 21, 3) metric hand-centred coordinates (m)
  state: np.ndarray  # (2, T) uint8: MISSING / DETECTED / INTERPOLATED

  def save(self, path):
    np.savez_compressed(path, times=self.times, fps=self.fps, width=self.width,
                        height=self.height, lm=self.lm, world=self.world, state=self.state)

  @classmethod
  def load(cls, path):
    d = np.load(path)
    return cls(times=d["times"], fps=float(d["fps"]), width=int(d["width"]),
               height=int(d["height"]), lm=d["lm"], world=d["world"], state=d["state"])

  def swapped(self) -> "Tracks":
    return Tracks(self.times, self.fps, self.width, self.height,
                  self.lm[::-1].copy(), self.world[::-1].copy(), self.state[::-1].copy())

  def frame_at(self, t: float) -> int:
    i = int(np.searchsorted(self.times, t))
    if i <= 0:
      return 0
    if i >= len(self.times):
      return len(self.times) - 1
    return i if self.times[i] - t < t - self.times[i - 1] else i - 1

  def quality(self) -> dict:
    T = len(self.times)
    out = {"frames": int(T), "fps": round(self.fps, 2)}
    for s, name in ((0, "left"), (1, "right")):
      st = self.state[s]
      out[name] = {
          "detected_pct": round(100 * float(np.mean(st == DETECTED)), 1) if T else 0,
          "interpolated_pct": round(100 * float(np.mean(st == INTERPOLATED)), 1) if T else 0,
      }
    both = (self.state[0] > 0) & (self.state[1] > 0)
    out["both_hands_pct"] = round(100 * float(np.mean(both)), 1) if T else 0
    return out


# --------------------------------------------------------------------------

def _palm_size(pts_px: np.ndarray) -> float:
  a, b, c = pts_px[0], pts_px[5], pts_px[17]
  return float((np.linalg.norm(a - b) + np.linalg.norm(a - c) + np.linalg.norm(b - c)) / 3)


def _right_evidence(pts_px: np.ndarray, mp_label: str, mp_score: float) -> float:
  """>0 means 'looks like a right hand' (palm down, unmirrored view)."""
  d = pts_px[9] - pts_px[0]  # wrist -> middle knuckle
  s = pts_px[17] - pts_px[5]  # index knuckle -> pinky knuckle
  cross = d[0] * s[1] - d[1] * s[0]
  chir = np.tanh(cross / (np.linalg.norm(d) * np.linalg.norm(s) + 1e-6) * 3)
  mp = mp_score if mp_label == "Right" else -mp_score
  return float(0.6 * mp + 0.4 * chir)


def detect_raw(video_path: str, model_path: str, progress=None):
  """Run MediaPipe over every frame. Returns times, frame size, fps, detections."""
  import mediapipe as mp
  from mediapipe.tasks import python as mp_python
  from mediapipe.tasks.python import vision

  cap = cv2.VideoCapture(video_path)
  if not cap.isOpened():
    raise ValueError("Could not open the video file (unsupported format?)")
  fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
  total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)

  options = vision.HandLandmarkerOptions(
      base_options=mp_python.BaseOptions(model_asset_path=model_path),
      running_mode=vision.RunningMode.VIDEO,
      num_hands=2,
      min_hand_detection_confidence=0.4,
      min_hand_presence_confidence=0.4,
      min_tracking_confidence=0.4,
  )
  times, dets = [], []
  width = height = 0
  last_ms = -1
  t0 = None
  with vision.HandLandmarker.create_from_options(options) as detector:
    i = 0
    while True:
      ok, frame = cap.read()
      if not ok:
        break
      pos = cap.get(cv2.CAP_PROP_POS_MSEC)
      t = pos / 1000.0 if pos and pos > 0 else i / fps
      if t0 is None:
        t0 = t
      t -= t0
      if times and t <= times[-1]:
        t = times[-1] + 1.0 / fps
      height, width = frame.shape[:2]
      scale = MAX_DETECT_DIM / max(width, height)
      if scale < 1:
        frame = cv2.resize(frame, (int(width * scale), int(height * scale)), interpolation=cv2.INTER_AREA)
      rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
      ms = max(int(round(t * 1000)), last_ms + 1)
      last_ms = ms
      res = detector.detect_for_video(mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), ms)
      frame_dets = []
      for lms, wls, hd in zip(res.hand_landmarks, res.hand_world_landmarks, res.handedness):
        frame_dets.append((
            np.array([[p.x, p.y, p.z] for p in lms], dtype=np.float32),
            np.array([[p.x, p.y, p.z] for p in wls], dtype=np.float32),
            hd[0].category_name, float(hd[0].score),
        ))
      times.append(t)
      dets.append(frame_dets)
      i += 1
      if progress and (i % 15 == 0):
        progress(i / total if total else 0.0)
  cap.release()
  if not times:
    raise ValueError("The video contains no readable frames")
  return np.array(times), width, height, float(fps), dets


def assign_hands(times, width, height, dets) -> Tracks:
  T = len(times)
  lm = np.full((2, T, 21, 3), np.nan, dtype=np.float32)
  world = np.full((2, T, 21, 3), np.nan, dtype=np.float32)
  state = np.zeros((2, T), dtype=np.uint8)
  scale = np.array([width, height], dtype=np.float32)

  sizes = [_palm_size(d[0][:, :2] * scale) for fd in dets for d in fd]
  typical = float(np.median(sizes)) if sizes else 1.0
  last_pos = [None, None]  # (time, wrist+centroid px)
  sign = (-1.0, 1.0)

  for t_idx, fd in enumerate(dets):
    t = times[t_idx]
    cands = []
    for img, wl, label, score in fd:
      px = img[:, :2] * scale
      ps = _palm_size(px)
      if not (0.4 * typical <= ps <= 2.5 * typical):
        continue  # collapsed or implausible detection
      cands.append((px, ps, _right_evidence(px, label, score), img, wl))
    # Duplicate suppression: same hand reported twice.
    if len(cands) == 2:
      (pa, sa, *_), (pb, sb, *_) = cands
      if np.median(np.linalg.norm(pa - pb, axis=1)) < 0.35 * min(sa, sb):
        cands = [max(cands, key=lambda c: abs(c[2]))]
    cands = cands[:2]

    def cost(c, slot):
      px, ps, ev = c[0], c[1], c[2]
      label_cost = max(0.0, -ev * sign[slot]) * 2.0
      cont = 0.0
      lp = last_pos[slot]
      if lp is not None and t - lp[0] < 0.5:
        cont = float(np.linalg.norm(px[[0, 9]].mean(0) - lp[1])) / ps
      return label_cost + 0.5 * min(cont, 6.0)

    if len(cands) == 2:
      a = cost(cands[0], 0) + cost(cands[1], 1)
      b = cost(cands[0], 1) + cost(cands[1], 0)
      pairs = [(cands[0], 0), (cands[1], 1)] if a <= b else [(cands[0], 1), (cands[1], 0)]
    elif len(cands) == 1:
      c = cands[0]
      pairs = [(c, 0 if cost(c, 0) <= cost(c, 1) else 1)]
    else:
      pairs = []
    for c, slot in pairs:
      lm[slot, t_idx] = c[3]
      world[slot, t_idx] = c[4]
      state[slot, t_idx] = DETECTED
      last_pos[slot] = (t, c[0][[0, 9]].mean(0))

  tr = Tracks(np.asarray(times, dtype=np.float64), 0.0, width, height, lm, world, state)
  return tr


def _reject_spikes(tr: Tracks, slot: int, typical_px: float):
  """Remove single-frame jumps that return to where they came from."""
  st, lm = tr.state[slot], tr.lm[slot]
  scale = np.array([tr.width, tr.height])
  idx = np.where(st == DETECTED)[0]
  for j in range(1, len(idx) - 1):
    a, b, c = idx[j - 1], idx[j], idx[j + 1]
    if c - a > 4:
      continue
    pa, pb, pc = (lm[k, :, :2] * scale for k in (a, b, c))
    jump = np.median(np.linalg.norm(pb - (pa + pc) / 2, axis=1))
    base = np.median(np.linalg.norm(pa - pc, axis=1))
    if jump > 0.6 * typical_px and jump > 2.5 * base:
      st[b] = MISSING
      lm[b] = np.nan
      tr.world[slot, b] = np.nan


def _fill_gaps(tr: Tracks, slot: int, max_gap_s: float):
  st = tr.state[slot]
  have = np.where(st > 0)[0]
  for a, b in zip(have[:-1], have[1:]):
    if b - a <= 1 or tr.times[b] - tr.times[a] > max_gap_s:
      continue
    w = ((tr.times[a + 1:b] - tr.times[a]) / (tr.times[b] - tr.times[a]))[:, None, None]
    for arr in (tr.lm, tr.world):
      arr[slot, a + 1:b] = arr[slot, a] * (1 - w) + arr[slot, b] * w
    st[a + 1:b] = INTERPOLATED


def _smooth(tr: Tracks, slot: int):
  st = tr.state[slot]
  win = int(round(tr.fps * 0.17)) | 1  # ~170 ms, odd
  win = max(win, 5)
  present = st > 0
  m = np.concatenate([[False], present, [False]]).astype(np.int8)
  starts = np.where(np.diff(m) == 1)[0]
  ends = np.where(np.diff(m) == -1)[0]
  for a, b in zip(starts, ends):
    n = b - a
    if n < 3:
      continue
    for arr in (tr.lm, tr.world):
      seg = arr[slot, a:b].reshape(n, -1).astype(np.float64)
      seg = median_filter(seg, size=(3, 1), mode="nearest")
      if n >= win:
        seg = savgol_filter(seg, win, 2, axis=0, mode="interp")
      arr[slot, a:b] = seg.reshape(n, 21, 3)


def track_video(video_path: str, model_path: str, progress=None) -> Tracks:
  times, width, height, fps, dets = detect_raw(video_path, model_path, progress)
  tr = assign_hands(times, width, height, dets)
  tr.fps = fps
  sizes = [_palm_size(tr.lm[s, i, :, :2] * [width, height])
           for s in (0, 1) for i in np.where(tr.state[s] == DETECTED)[0][::5]]
  typical = float(np.median(sizes)) if sizes else 50.0
  for s in (0, 1):
    _reject_spikes(tr, s, typical)
    _fill_gaps(tr, s, max_gap_s=0.35)
    _smooth(tr, s)
  return tr
