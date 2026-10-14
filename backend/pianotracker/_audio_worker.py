"""Subprocess entry point: decode a video's audio track to a .npy file.

Usage: python -m pianotracker._audio_worker <video> <out.npy>
Exit codes: 0 = written, 3 = no audible audio, 1 = error.
"""

import sys

import av
import numpy as np

SAMPLE_RATE = 16000


def decode(video_path: str):
  try:
    container = av.open(video_path)
  except av.error.FFmpegError:
    return None
  with container:
    if not container.streams.audio:
      return None
    stream = container.streams.audio[0]
    # Align audio time 0 with the first video frame (what the browser shows).
    v_start = 0.0
    if container.streams.video and container.streams.video[0].start_time is not None:
      vs = container.streams.video[0]
      v_start = float(vs.start_time * vs.time_base)
    a_start = float(stream.start_time * stream.time_base) if stream.start_time is not None else 0.0
    resampler = av.AudioResampler(format="flt", layout="mono", rate=SAMPLE_RATE)
    chunks = []
    for frame in container.decode(stream):
      for out in resampler.resample(frame):
        chunks.append(out.to_ndarray().reshape(-1))
    for out in resampler.resample(None):
      chunks.append(out.to_ndarray().reshape(-1))
  if not chunks:
    return None
  audio = np.concatenate(chunks).astype(np.float32)
  offset = int(round((a_start - v_start) * SAMPLE_RATE))
  if offset > 0:
    audio = np.concatenate([np.zeros(offset, np.float32), audio])
  elif offset < 0:
    audio = audio[-offset:]
  # Treat near-silent tracks (e.g. screen recordings) as no audio.
  if audio.size < SAMPLE_RATE // 2 or np.sqrt(np.mean(audio ** 2)) < 1e-3:
    return None
  return audio


if __name__ == "__main__":
  audio = decode(sys.argv[1])
  if audio is None:
    sys.exit(3)
  np.save(sys.argv[2], audio)
