"""Audio extraction and piano transcription.

Uses ByteDance's high-resolution piano transcription model (CRNN trained on
MAESTRO, ~96.8% note-onset F1), run on Apple-silicon GPU (MPS) when available.
"""

from __future__ import annotations

import contextlib
import http.client
import io
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import urllib.error
import urllib.request

import numpy as np

SAMPLE_RATE = 16000
CHECKPOINT_URL = (
    "https://zenodo.org/record/4034264/files/"
    "CRNN_note_F1%3D0.9677_pedal_F1%3D0.9186.pth?download=1"
)
CHECKPOINT_MIN_BYTES = 160_000_000

_model = None
_model_lock = threading.Lock()
_download_lock = threading.Lock()


def extract_audio(video_path: str) -> np.ndarray | None:
  """Mono float32 audio at 16 kHz, or None if there's no (audible) audio track.

  Decoding runs in a separate process: PyAV and OpenCV each bundle their own
  FFmpeg, and loading both into one process can crash on macOS.
  """
  backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
  fd, out_path = tempfile.mkstemp(suffix=".npy")
  os.close(fd)
  try:
    proc = subprocess.run(
        [sys.executable, "-m", "pianotracker._audio_worker", video_path, out_path],
        cwd=backend_dir, capture_output=True, text=True, timeout=1800,
    )
    if proc.returncode == 3:
      return None  # no audio stream / silent
    if proc.returncode != 0:
      raise RuntimeError(f"Audio extraction failed: {proc.stderr.strip()[-500:]}")
    return np.load(out_path)
  finally:
    if os.path.exists(out_path):
      os.remove(out_path)


def transcription_available(checkpoint_path: str) -> bool:
  try:
    import piano_transcription_inference  # noqa: F401
    import torch  # noqa: F401
  except ImportError:
    return False
  return os.path.exists(checkpoint_path) and os.path.getsize(checkpoint_path) >= CHECKPOINT_MIN_BYTES


def ensure_checkpoint(checkpoint_path: str, attempts: int = 8):
  """Download the ~165 MB checkpoint once, resuming if the connection drops."""
  with _download_lock:
    _download_checkpoint(checkpoint_path, attempts)


def _download_checkpoint(checkpoint_path: str, attempts: int):
  if os.path.exists(checkpoint_path) and os.path.getsize(checkpoint_path) >= CHECKPOINT_MIN_BYTES:
    return
  os.makedirs(os.path.dirname(checkpoint_path), exist_ok=True)
  tmp = checkpoint_path + ".part"
  total = None
  for _ in range(attempts):
    have = os.path.getsize(tmp) if os.path.exists(tmp) else 0
    if total is not None and have >= total:
      break
    req = urllib.request.Request(CHECKPOINT_URL, headers={"Range": f"bytes={have}-"} if have else {})
    try:
      with urllib.request.urlopen(req, timeout=60) as resp:
        if have and resp.status == 206:
          # "bytes start-end/total"
          total = int(resp.headers.get("Content-Range", "").rsplit("/", 1)[-1] or 0) or None
          mode = "ab"
        else:  # fresh download, or the server ignored the range
          total = int(resp.headers.get("Content-Length") or 0) or None
          mode = "wb"
        with open(tmp, mode) as out:
          shutil.copyfileobj(resp, out, 1 << 20)
    except urllib.error.HTTPError as e:
      if e.code == 416 and have >= CHECKPOINT_MIN_BYTES:  # nothing left to fetch
        total = have
        break
      continue
    except (OSError, ValueError, http.client.HTTPException):
      continue
    if total is not None and os.path.getsize(tmp) >= total:
      break
  size = os.path.getsize(tmp) if os.path.exists(tmp) else 0
  if total is None or size != total or size < CHECKPOINT_MIN_BYTES:
    raise OSError("Could not download the piano transcription model (network error)")
  os.replace(tmp, checkpoint_path)


def device_name() -> str:
  try:
    import torch
  except ImportError:
    return "unavailable"
  if torch.cuda.is_available():
    return "cuda"
  if torch.backends.mps.is_available():
    return "mps"
  return "cpu"


def _get_model(checkpoint_path: str):
  global _model
  with _model_lock:
    if _model is None:
      import torch
      from piano_transcription_inference import PianoTranscription

      dev = device_name()
      with contextlib.redirect_stdout(io.StringIO()):
        pt = PianoTranscription(checkpoint_path=checkpoint_path, device=torch.device("cpu"))
      if dev != "cpu":
        pt.model.to(torch.device(dev))
      _model = pt
    return _model


def transcribe(audio: np.ndarray, checkpoint_path: str) -> tuple[list[dict], list[dict]]:
  """-> (notes [{onset, offset, pitch, velocity}] sorted by onset, pedal events)."""
  model = _get_model(checkpoint_path)
  with _model_lock, contextlib.redirect_stdout(io.StringIO()):
    try:
      out = model.transcribe(audio.astype(np.float64), None)
    except (RuntimeError, NotImplementedError):
      # Some ops may be unsupported on MPS; fall back to CPU once.
      import torch
      model.model.to(torch.device("cpu"))
      out = model.transcribe(audio.astype(np.float64), None)
  notes = [
      {
          "onset": round(float(e["onset_time"]), 4),
          "offset": round(float(e["offset_time"]), 4),
          "pitch": int(e["midi_note"]),
          "velocity": int(e["velocity"]),
      }
      for e in out["est_note_events"]
  ]
  pedals = [
      {"onset": round(float(e.get("onset_time", 0)), 3), "offset": round(float(e["offset_time"]), 3)}
      for e in (out.get("est_pedal_events") or [])
  ]
  notes.sort(key=lambda n: (n["onset"], n["pitch"]))
  return notes, pedals
