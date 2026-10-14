"""Sheet-music (PDF/image) scores: page stitching and caching, with a fake OMR worker."""

import os
import sys
import textwrap

import pytest

from pianotracker import score as score_mod

PAGE = """<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
<part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
{notes}</measure></part></score-partwise>"""
NOTE = "<note><pitch><step>{s}</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>"


@pytest.fixture
def fake_omr(tmp_path, monkeypatch):
  """A worker that 'recognises' two pages: C D E F and G A B C... (one bar each)."""
  pages = []
  for i, steps in enumerate(["CDEF", "GABC"]):
    p = tmp_path / f"page{i + 1}.musicxml"
    p.write_text(PAGE.format(notes="".join(NOTE.format(s=s) for s in steps)))
    pages.append(str(p))
  worker = tmp_path / "fake_worker.py"
  worker.write_text(textwrap.dedent(f"""
      import json
      print(json.dumps({{"progress": 0.0, "page": 1, "pages_total": 2}}), flush=True)
      print(json.dumps({{"progress": 1.0, "pages": {pages!r}}}), flush=True)
  """))
  monkeypatch.setattr(score_mod, "OMR_PYTHON", sys.executable)
  monkeypatch.setattr(score_mod, "OMR_WORKER", str(worker))
  return tmp_path


def test_pdf_pages_are_stitched(fake_omr):
  pdf = fake_omr / "score.pdf"
  pdf.write_bytes(b"%PDF-fake")
  seen = []
  s = score_mod.load_score(str(pdf), lambda f, m: seen.append(m))
  assert s["source"] == "omr" and s["pages"] == 2
  assert [n["pitch"] for n in s["notes"]] == [60, 62, 64, 65, 67, 69, 71, 60]
  # Page 2 starts after page 1's last note ends (beat 4).
  assert [n["beat"] for n in s["notes"]][4:] == [4.0, 5.0, 6.0, 7.0]
  assert seen and "page 1 of 2" in seen[0]


def test_recognition_is_cached(fake_omr, monkeypatch):
  pdf = fake_omr / "score.pdf"
  pdf.write_bytes(b"%PDF-fake")
  first = score_mod.load_score(str(pdf))
  assert os.path.exists(score_mod.omr_cache_path(str(pdf)))
  monkeypatch.setattr(score_mod, "OMR_PYTHON", "/nonexistent/python")  # must not be called again
  assert score_mod.load_score(str(pdf))["notes"] == first["notes"]


def test_unreadable_sheet_reports_error(tmp_path, monkeypatch):
  worker = tmp_path / "fail_worker.py"
  worker.write_text('import json,sys; print(json.dumps({"error": "No music notation could be recognised"})); sys.exit(1)')
  monkeypatch.setattr(score_mod, "OMR_PYTHON", sys.executable)
  monkeypatch.setattr(score_mod, "OMR_WORKER", str(worker))
  img = tmp_path / "photo.jpg"
  img.write_bytes(b"not really a jpeg")
  with pytest.raises(ValueError, match="No music notation"):
    score_mod.load_score(str(img))
