"""Background analysis jobs with progress, stored on disk under data/jobs/<id>/.

Expensive, calibration-independent results (hand tracks, audio transcription)
are cached per job so re-scoring is instant.
"""

from __future__ import annotations

import json
import os
import shutil
import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor

import cv2

from . import audio as audio_mod
from .analysis import compute_results
from .keyboard import Calibration, background_frame, detect_keyboard
from .score import load_score
from .tracking import Tracks, ensure_hand_model, track_video

STAGES = [  # (name, label, share of total progress)
    ("keyboard", "Detecting keyboard", 0.05),
    ("tracking", "Tracking hands", 0.60),
    ("audio", "Transcribing audio", 0.30),
    ("scoring", "Scoring performance", 0.05),
]


class JobManager:
  def __init__(self, data_dir: str, models_dir: str):
    self.data_dir = os.path.join(data_dir, "jobs")
    self.models_dir = models_dir
    self.hand_model = os.path.join(models_dir, "hand_landmarker.task")
    self.checkpoint = os.path.join(models_dir, "piano_transcription_note_pedal.pth")
    os.makedirs(self.data_dir, exist_ok=True)
    self._jobs: dict[str, dict] = {}
    self._lock = threading.Lock()
    # One analysis at a time: the models are memory/GPU heavy.
    self._pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix="analysis")

  # ---- paths
  def job_dir(self, job_id: str) -> str:
    if not job_id or any(c not in "0123456789abcdef" for c in job_id):
      raise KeyError(job_id)
    return os.path.join(self.data_dir, job_id)

  # ---- status
  def _set(self, job_id, **kw):
    with self._lock:
      self._jobs.setdefault(job_id, {}).update(kw, updated=time.time())

  def status(self, job_id: str) -> dict:
    with self._lock:
      st = dict(self._jobs.get(job_id) or {})
    if not st:
      d = self.job_dir(job_id)
      if os.path.exists(os.path.join(d, "result.json")):
        st = {"status": "done", "progress": 1.0, "stage": "done"}
      elif os.path.isdir(d):
        st = {"status": "error", "error": "Job was interrupted (server restarted)."}
      else:
        raise KeyError(job_id)
    st["id"] = job_id
    return st

  def result(self, job_id: str) -> dict:
    with open(os.path.join(self.job_dir(job_id), "result.json")) as f:
      return json.load(f)

  # ---- create
  def create(self, video_src, video_name: str, score_src=None, score_name=None, calibration=None) -> str:
    job_id = uuid.uuid4().hex
    d = self.job_dir(job_id)
    os.makedirs(d)
    ext = os.path.splitext(video_name or "")[1].lower() or ".mp4"
    video_path = os.path.join(d, "video" + ext)
    with open(video_path, "wb") as out:
      shutil.copyfileobj(video_src, out)
    score_path = None
    if score_src is not None:
      sext = os.path.splitext(score_name or "")[1].lower()
      score_path = os.path.join(d, "score" + sext)
      with open(score_path, "wb") as out:
        shutil.copyfileobj(score_src, out)
      try:
        load_score(score_path)  # fail fast on a bad score file
      except Exception:
        shutil.rmtree(d, ignore_errors=True)
        raise
    self._set(job_id, status="queued", stage="queued", progress=0.0, message="Waiting to start",
              video_name=os.path.basename(video_name or "video"))
    self._pool.submit(self._run, job_id, video_path, score_path, calibration)
    return job_id

  # ---- pipeline
  def _progress(self, job_id, stage, frac):
    done = 0.0
    for name, label, share in STAGES:
      if name == stage:
        self._set(job_id, stage=stage, message=label, progress=round(done + share * min(max(frac, 0), 1), 3))
        return
      done += share

  def _run(self, job_id, video_path, score_path, calibration):
    d = self.job_dir(job_id)
    try:
      self._set(job_id, status="running")
      self._progress(job_id, "keyboard", 0)
      score = load_score(score_path) if score_path else None
      if calibration is None:
        bg = background_frame(video_path)
        if bg is None:
          raise ValueError("Could not read frames from the video")
        cv2.imwrite(os.path.join(d, "background.jpg"), bg, [cv2.IMWRITE_JPEG_QUALITY, 85])
        calibration = detect_keyboard(bg)
        if calibration is None:
          calibration = Calibration.default()
          calibration.notes = ["Keyboard not found automatically — drag the corners to fit it"]

      self._progress(job_id, "tracking", 0)
      ensure_hand_model(self.hand_model)
      tracks = track_video(video_path, self.hand_model, lambda f: self._progress(job_id, "tracking", f))
      tracks.save(os.path.join(d, "tracks.npz"))

      self._progress(job_id, "audio", 0)
      notes, pedals, audio_info = self._audio(video_path, job_id)
      with open(os.path.join(d, "audio.json"), "w") as f:
        json.dump({"notes": notes, "pedals": pedals, "info": audio_info}, f)

      self._progress(job_id, "scoring", 0)
      self._finish(job_id, tracks, calibration, notes, pedals, score, audio_info)
    except Exception as e:  # report any failure to the UI
      traceback.print_exc()
      self._set(job_id, status="error", error=str(e) or e.__class__.__name__)

  def prefetch_models(self):
    """Fetch model files in the background so the first analysis isn't stuck."""
    def run():
      try:
        ensure_hand_model(self.hand_model)
        audio_mod.ensure_checkpoint(self.checkpoint)
      except OSError as e:
        print(f"Model prefetch failed (will retry on first use): {e}")
    threading.Thread(target=run, name="model-prefetch", daemon=True).start()

  def _audio(self, video_path, job_id=None):
    audio = audio_mod.extract_audio(video_path)
    if audio is None:
      return None, None, {"has_audio": False, "transcribed": False}
    info = {"has_audio": True, "transcribed": False, "device": audio_mod.device_name()}
    try:
      if job_id and not audio_mod.transcription_available(self.checkpoint):
        self._set(job_id, message="Downloading transcription model (first run only)")
      audio_mod.ensure_checkpoint(self.checkpoint)
      if job_id:
        self._progress(job_id, "audio", 0.1)
    except OSError as e:
      info["error"] = f"Transcription model unavailable: {e}"
      return None, None, info
    notes, pedals = audio_mod.transcribe(audio, self.checkpoint)
    info["transcribed"] = True
    return notes, pedals, info

  def _finish(self, job_id, tracks, cal, notes, pedals, score, audio_info):
    d = self.job_dir(job_id)
    result = compute_results(tracks, cal, notes, pedals, score, {"audio": audio_info})
    result["job_id"] = job_id
    tmp = os.path.join(d, "result.json.tmp")
    with open(tmp, "w") as f:
      json.dump(result, f, separators=(",", ":"))
    os.replace(tmp, os.path.join(d, "result.json"))
    self._set(job_id, status="done", stage="done", progress=1.0, message="Done")

  def rescore(self, job_id, calibration: Calibration | None = None, score_src=None, score_name=None,
              clear_score=False) -> dict:
    """Recompute results with new calibration and/or score (no ML re-run)."""
    d = self.job_dir(job_id)
    tracks = Tracks.load(os.path.join(d, "tracks.npz"))
    with open(os.path.join(d, "audio.json")) as f:
      a = json.load(f)
    prev = self.result(job_id)
    if calibration is None:
      calibration = Calibration.from_dict(prev["calibration"])
    old_scores = [p for p in os.listdir(d) if p.startswith("score.")]
    if score_src is not None:
      # Validate the new score before replacing the old one.
      sext = os.path.splitext(score_name or "")[1].lower()
      new_path = os.path.join(d, "upload_score" + sext)
      with open(new_path, "wb") as out:
        shutil.copyfileobj(score_src, out)
      try:
        score = load_score(new_path)
      except Exception:
        os.remove(new_path)
        raise
      for old in old_scores:
        os.remove(os.path.join(d, old))
      os.replace(new_path, os.path.join(d, "score" + sext))
    elif clear_score:
      for old in old_scores:
        os.remove(os.path.join(d, old))
      score = None
    else:
      score = load_score(os.path.join(d, old_scores[0])) if old_scores else None
    self._finish(job_id, tracks, calibration, a["notes"], a["pedals"], score, a["info"])
    return self.result(job_id)
