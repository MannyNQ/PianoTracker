"""PianoTracker Pro API.

Run:  venv/bin/python main.py   (or: venv/bin/uvicorn main:app --reload)
"""

import json
import os

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse

from pianotracker import audio as audio_mod
from pianotracker.jobs import JobManager
from pianotracker.keyboard import Calibration
from pianotracker.score import SUPPORTED as SCORE_EXTS

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")
DATA_DIR = os.path.join(BASE_DIR, "data")
VIDEO_EXTS = (".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi")
MAX_VIDEO_BYTES = 2 * 1024 ** 3
MAX_SCORE_BYTES = 20 * 1024 ** 2

app = FastAPI(title="PianoTracker Pro")
app.add_middleware(GZipMiddleware, minimum_size=2048)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)
jobs = JobManager(DATA_DIR, MODELS_DIR)
jobs.prefetch_models()


def _check_upload(f: UploadFile, exts, max_bytes, kind):
  ext = os.path.splitext(f.filename or "")[1].lower()
  if ext not in exts:
    raise HTTPException(400, f"Unsupported {kind} type '{ext or '?'}'. Allowed: {', '.join(exts)}")
  if f.size is not None and f.size > max_bytes:
    raise HTTPException(413, f"{kind.capitalize()} is too large (max {max_bytes // 1024 ** 2} MB)")


def _parse_calibration(raw):
  if not raw:
    return None
  try:
    cal = Calibration.from_dict(json.loads(raw))
  except (ValueError, TypeError, KeyError) as e:
    raise HTTPException(400, f"Invalid calibration: {e}")
  cal.source = "user"
  cal.confidence = 1.0
  return cal


def _job_or_404(fn, *a, **kw):
  try:
    return fn(*a, **kw)
  except (KeyError, FileNotFoundError):
    raise HTTPException(404, "Job not found")


@app.get("/api/health")
def health():
  ckpt = os.path.join(MODELS_DIR, "piano_transcription_note_pedal.pth")
  return {
      "ok": True,
      "transcription_ready": audio_mod.transcription_available(ckpt),
      "device": audio_mod.device_name(),
  }


# Plain `def` endpoints run in FastAPI's threadpool, so uploads and analysis
# never block the event loop.
@app.post("/api/jobs")
def create_job(
    video: UploadFile = File(...),
    score: UploadFile | None = File(None),
    calibration: str | None = Form(None),
):
  _check_upload(video, VIDEO_EXTS, MAX_VIDEO_BYTES, "video")
  if score is not None:
    _check_upload(score, SCORE_EXTS, MAX_SCORE_BYTES, "score")
  cal = _parse_calibration(calibration)
  try:
    job_id = jobs.create(video.file, video.filename,
                         score.file if score else None, score.filename if score else None, cal)
  except ValueError as e:
    raise HTTPException(400, f"Could not read score: {e}")
  return {"id": job_id}


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str):
  return _job_or_404(jobs.status, job_id)


@app.get("/api/jobs/{job_id}/result")
def job_result(job_id: str):
  return _job_or_404(jobs.result, job_id)


@app.get("/api/jobs/{job_id}/video")
def job_video(job_id: str):
  d = _job_or_404(jobs.job_dir, job_id)
  vids = [f for f in os.listdir(d) if f.startswith("video.")] if os.path.isdir(d) else []
  if not vids:
    raise HTTPException(404, "No video for this job")
  return FileResponse(os.path.join(d, vids[0]))  # supports Range requests (seeking)


@app.get("/api/jobs/{job_id}/background.jpg")
def job_background(job_id: str):
  path = os.path.join(_job_or_404(jobs.job_dir, job_id), "background.jpg")
  if not os.path.exists(path):
    raise HTTPException(404, "No background image")
  return FileResponse(path, media_type="image/jpeg")


@app.post("/api/jobs/{job_id}/rescore")
def rescore(
    job_id: str,
    calibration: str | None = Form(None),
    score: UploadFile | None = File(None),
    clear_score: bool = Form(False),
):
  if score is not None:
    _check_upload(score, SCORE_EXTS, MAX_SCORE_BYTES, "score")
  cal = _parse_calibration(calibration)
  if _job_or_404(jobs.status, job_id).get("status") != "done":
    raise HTTPException(409, "Analysis hasn't finished yet")
  try:
    return jobs.rescore(job_id, cal, score.file if score else None,
                        score.filename if score else None, clear_score)
  except ValueError as e:
    raise HTTPException(400, str(e))


if __name__ == "__main__":
  import uvicorn

  uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)
