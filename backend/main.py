import os
import shutil
import urllib.request
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
MODEL_PATH = "hand_landmarker.task"
if not os.path.exists(MODEL_PATH):
  urllib.request.urlretrieve(MODEL_URL, MODEL_PATH)


@app.post("/api/analyze")
async def analyze_video(
    file: UploadFile = File(...),
    x1_ratio: float = 0.12,
    x2_ratio: float = 0.98,
    y1_ratio: float = 0.35,
    y2_ratio: float = 0.70,
    num_keys: int = 28,
):
  temp_video_path = f"temp_{file.filename}"

  with open(temp_video_path, "wb") as buffer:
    shutil.copyfileobj(file.file, buffer)

  cap = cv2.VideoCapture(temp_video_path)
  if not cap.isOpened():
    os.remove(temp_video_path)
    return {"error": "Could not open video file."}

  fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
  success, first_frame = cap.read()
  if not success:
    cap.release()
    os.remove(temp_video_path)
    return {"error": "Failed to read video frames."}

  h, w, _ = first_frame.shape

  base_options = python.BaseOptions(model_asset_path=MODEL_PATH)
  options = vision.HandLandmarkerOptions(
      base_options=base_options,
      num_hands=2,
      min_hand_detection_confidence=0.5,
      min_hand_presence_confidence=0.5,
  )
  detector = vision.HandLandmarker.create_from_options(options)

  x1, x2 = int(w * x1_ratio), int(w * x2_ratio)
  y1, y2 = int(h * y1_ratio), int(h * y2_ratio)
  key_width = (x2 - x1) / float(num_keys)

  key_cooldown = [0] * num_keys
  total_notes = 0
  posture_alerts = 0
  fingertip_indices = [4, 8, 12, 16, 20]

  frame_data = []
  frame_count = 0
  cap.set(cv2.CAP_PROP_POS_FRAMES, 0)

  while cap.isOpened():
    success, frame = cap.read()
    if not success:
      break

    frame_count += 1
    # Sample every 2nd frame for optimal tracking fluidity & speed
    if frame_count % 2 != 0:
      continue

    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
    detection_result = detector.detect(mp_image)

    active_keys = [False] * num_keys
    is_wrist_dropping = False
    current_fingertips = []

    for i in range(num_keys):
      if key_cooldown[i] > 0:
        key_cooldown[i] -= 1

    if detection_result.hand_landmarks:
      for hand_landmarks in detection_result.hand_landmarks:
        wrist = hand_landmarks[0]
        wrist_y = int(wrist.y * h)
        if wrist_y > (y2 + 25):
          is_wrist_dropping = True

        for idx in fingertip_indices:
          tip = hand_landmarks[idx]
          fx, fy = int(tip.x * w), int(tip.y * h)
          current_fingertips.append({"x": tip.x, "y": tip.y})

          if y1 - 15 <= fy <= y2 + 20 and x1 <= fx <= x2:
            k_idx = int((fx - x1) / key_width)
            if 0 <= k_idx < num_keys:
              active_keys[k_idx] = True

    for i in range(num_keys):
      if active_keys[i] and key_cooldown[i] == 0:
        total_notes += 1
        key_cooldown[i] = 15

    if is_wrist_dropping:
      posture_alerts += 1

    frame_data.append({
        "time": frame_count / fps,
        "fingertips": current_fingertips,
        "wrist_drop": is_wrist_dropping,
    })

  cap.release()
  os.remove(temp_video_path)

  accuracy = f"{max(85.0, 100 - (posture_alerts * 1.5)):.1f}%"

  return {
      "status": "success",
      "total_notes": total_notes,
      "posture_alerts": posture_alerts,
      "accuracy_score": accuracy,
      "tracked_frames": frame_data,
  }


if __name__ == "__main__":
  import uvicorn

  uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)