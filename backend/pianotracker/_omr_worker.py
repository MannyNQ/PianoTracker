"""Subprocess entry point: sheet music PDF/image -> one MusicXML file per page.

Runs inside backend/omr_venv (homr needs an OpenCV build that conflicts with
the one MediaPipe uses, so it lives in its own environment).

Usage: python _omr_worker.py <input.pdf|png|jpg> <out_dir>
Prints one JSON line per event: {"progress": 0..1} and finally
{"pages": ["<out_dir>/page-1.musicxml", ...]}. Exit code 1 on error.
"""

import json
import os
import shutil
import subprocess
import sys

RENDER_DPI = 300
MAX_PAGES = 30


def emit(**kw):
  print(json.dumps(kw), flush=True)


def render_pages(src, out_dir):
  ext = os.path.splitext(src)[1].lower()
  if ext != ".pdf":
    dst = os.path.join(out_dir, "page-1" + ext)
    shutil.copyfile(src, dst)
    return [dst]
  import pymupdf as fitz

  doc = fitz.open(src)
  if doc.page_count == 0:
    raise ValueError("The PDF has no pages")
  if doc.page_count > MAX_PAGES:
    raise ValueError(f"The PDF has {doc.page_count} pages (max {MAX_PAGES})")
  paths = []
  for i, page in enumerate(doc):
    pix = page.get_pixmap(dpi=RENDER_DPI, colorspace=fitz.csGRAY)
    p = os.path.join(out_dir, f"page-{i + 1}.png")
    pix.save(p)
    paths.append(p)
  return paths


def main():
  src, out_dir = sys.argv[1], sys.argv[2]
  os.makedirs(out_dir, exist_ok=True)
  images = render_pages(src, out_dir)
  homr = os.path.join(os.path.dirname(sys.executable), "homr")
  pages = []
  for i, img in enumerate(images):
    emit(progress=i / len(images), page=i + 1, pages_total=len(images))
    proc = subprocess.run([homr, img], capture_output=True, text=True)
    xml = os.path.splitext(img)[0] + ".musicxml"
    if proc.returncode != 0 or not os.path.exists(xml):
      # A page without music (title page, notes) is not fatal.
      emit(warning=f"No music recognised on page {i + 1}")
      continue
    pages.append(xml)
  if not pages:
    raise ValueError("No music notation could be recognised in this file")
  emit(progress=1.0, pages=pages)


if __name__ == "__main__":
  try:
    main()
  except Exception as e:  # report to the parent as a clean message
    emit(error=str(e) or e.__class__.__name__)
    sys.exit(1)
