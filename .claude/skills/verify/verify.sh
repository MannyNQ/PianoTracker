#!/usr/bin/env bash
# PianoTracker Pro verification harness. Run from anywhere:
#   .claude/skills/verify/verify.sh <command>
# Commands: fixtures | up | doctor | evidence <label> | adopt-job <id> | api-journey | down
set -euo pipefail

SKILL="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SKILL/../../.." && pwd)"
RUN="$SKILL/.run"
FIX="$SKILL/fixtures"
API_PORT="${PT_API_PORT:-8010}"
WEB_PORT="${PT_WEB_PORT:-5183}"
API="http://127.0.0.1:$API_PORT"
WEB="http://127.0.0.1:$WEB_PORT"
JOBS_DIR="$ROOT/backend/data/jobs"
FIXTURE_VIDEO_SRC="${PT_FIXTURE_VIDEO:-$HOME/Desktop/test clip fr.mov}"
FIXTURE_SCORE_SRC="${PT_FIXTURE_SCORE:-$HOME/Downloads/Bach - Minuet in G Minor - BWV Anh 115.pdf}"

mkdir -p "$RUN"
die() { echo "verify: $*" >&2; exit 1; }
pid_of() { cat "${RUN:?}/$1.pid" 2>/dev/null || true; }
pid_alive() { local p; p="$(pid_of "$1")"; [[ -n "$p" ]] && kill -0 "$p" 2>/dev/null; }
port_pid() { lsof -nP -iTCP:"$1" -sTCP:LISTEN -t 2>/dev/null | head -1 || true; }

cmd_fixtures() {
  mkdir -p "$FIX"
  [[ -f "$FIXTURE_VIDEO_SRC" ]] || die "video fixture missing: $FIXTURE_VIDEO_SRC (set PT_FIXTURE_VIDEO)"
  [[ -f "$FIXTURE_SCORE_SRC" ]] || die "score fixture missing: $FIXTURE_SCORE_SRC (set PT_FIXTURE_SCORE)"
  cmp -s "$FIXTURE_VIDEO_SRC" "$FIX/clip.mov" || cp "$FIXTURE_VIDEO_SRC" "$FIX/clip.mov"
  cmp -s "$FIXTURE_SCORE_SRC" "$FIX/minuet.pdf" || cp "$FIXTURE_SCORE_SRC" "$FIX/minuet.pdf"
  ls -la "$FIX"
}

cmd_up() {
  [[ -x "$ROOT/backend/venv/bin/uvicorn" ]] || die "backend/venv missing; see README 'Running it'"
  [[ -d "$ROOT/frontend/node_modules" ]] || die "frontend/node_modules missing; run: cd frontend && npm install"
  local p owner
  for p in "$API_PORT" "$WEB_PORT"; do
    owner="$(port_pid "$p")"
    [[ -z "$owner" ]] && continue
    if [[ "$owner" == "$(pid_of backend)" || "$owner" == "$(pid_of web)" ]]; then
      echo "already up (port $p is ours)"; cmd_doctor; return
    fi
    die "port $p is held by pid $owner, which this harness did not start. Pick other ports with PT_API_PORT / PT_WEB_PORT."
  done
  cmd_fixtures >/dev/null
  { ls "$JOBS_DIR" 2>/dev/null || true; } | sort > "$RUN/jobs.before"
  : > "$RUN/jobs.adopted"
  # `exec` so the recorded pid is the server itself, not a wrapper shell.
  (cd "$ROOT/backend" && exec nohup venv/bin/uvicorn main:app --host 127.0.0.1 --port "$API_PORT" > "$RUN/backend.log" 2>&1) &
  echo $! > "$RUN/backend.pid"
  (cd "$ROOT/frontend" && PT_API="$API" PT_WEB_PORT="$WEB_PORT" exec nohup node node_modules/vite/bin/vite.js --config "$SKILL/vite.verify.config.mjs" > "$RUN/web.log" 2>&1) &
  echo $! > "$RUN/web.pid"
  echo "starting backend (pid $(pid_of backend)) and web (pid $(pid_of web))..."
  local h=""
  for _ in $(seq 1 180); do
    h="$(curl -sf "$API/api/health" || true)"
    if [[ "$h" == *'"transcription_ready":true'* ]] && curl -sf -o /dev/null "$WEB/"; then
      echo "ready: $WEB (api $API)"; echo "health: $h"; return
    fi
    pid_alive backend || { tail -30 "$RUN/backend.log"; die "backend exited during startup"; }
    pid_alive web || { tail -30 "$RUN/web.log"; die "web exited during startup"; }
    sleep 1
  done
  tail -20 "$RUN/backend.log"; die "not ready after 180 s (health: ${h:-none})"
}

# Read-only: is this instance worth driving?
cmd_doctor() {
  local ok=1 name port owner h p f
  for name in backend web; do
    if pid_alive "$name"; then echo "ok   $name pid $(pid_of "$name")"; else echo "FAIL $name not running (run: verify.sh up)"; ok=0; fi
  done
  for name in backend web; do
    [[ $name == backend ]] && port=$API_PORT || port=$WEB_PORT
    owner="$(port_pid "$port")"
    if [[ -n "$owner" && "$owner" == "$(pid_of "$name")" ]]; then echo "ok   port $port owned by our $name"
    else echo "FAIL port $port owner=${owner:-nobody}, expected our $name"; ok=0; fi
  done
  h="$(curl -sf "$API/api/health" || true)"
  if [[ "$h" == *'"ok":true'* ]]; then echo "ok   api health $h"; else echo "FAIL api health: ${h:-unreachable}"; ok=0; fi
  [[ "$h" == *'"transcription_ready":true'* ]] || echo "WARN transcription model not ready: notes fall back to motion estimates"
  [[ "$h" == *'"sheet_music_ready":true'* ]] || echo "WARN OMR unavailable: PDF/photo scores will fail (needs backend/omr_venv)"
  p="$(curl -sf "$WEB/api/health" || true)"
  if [[ -n "$p" && "$p" == "$h" ]]; then echo "ok   web proxies /api to $API"; else echo "FAIL web proxy /api/health: ${p:-unreachable}"; ok=0; fi
  for f in clip.mov minuet.pdf; do
    if [[ -f "$FIX/$f" ]]; then echo "ok   fixture $f"; else echo "FAIL fixture $f missing (run: verify.sh fixtures)"; ok=0; fi
  done
  echo "info build $(git -C "$ROOT" rev-parse --short HEAD)$(git -C "$ROOT" diff --quiet HEAD -- backend frontend || echo ' +uncommitted changes')"
  [[ -f "$RUN/evidence" ]] && echo "info evidence dir $(cat "$RUN/evidence")"
  if [[ $ok == 1 ]]; then echo "doctor: healthy"; else echo "doctor: NOT healthy"; return 1; fi
}

cmd_evidence() {
  local dir
  dir="$SKILL/evidence/$(date -u +%Y%m%dT%H%M%SZ)-${1:-run}"
  mkdir -p "$dir"; echo "$dir" > "$RUN/evidence"; echo "$dir"
}

cmd_adopt_job() {
  [[ "${1:-}" =~ ^[0-9a-f]{32}$ ]] || die "usage: verify.sh adopt-job <32-hex job id>"
  grep -qx "$1" "$RUN/jobs.adopted" 2>/dev/null || echo "$1" >> "$RUN/jobs.adopted"
  echo "adopted $1 (verify.sh down deletes it)"
}

# Headless backend journey: the same multipart upload + polling the UI does.
cmd_api_journey() {
  [[ -f "$RUN/evidence" ]] || cmd_evidence api-journey >/dev/null
  local dir resp id st=""
  dir="$(cat "$RUN/evidence")"
  resp="$(curl -sf -F "video=@$FIX/clip.mov" -F "score=@$FIX/minuet.pdf" "$API/api/jobs")" || die "POST /api/jobs failed"
  id="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])' <<<"$resp")"
  cmd_adopt_job "$id"
  : > "$dir/api-status.jsonl"
  for _ in $(seq 1 900); do
    st="$(curl -sf "$API/api/jobs/$id")"; echo "$st" >> "$dir/api-status.jsonl"
    case "$st" in *'"status":"done"'*) break ;; *'"status":"error"'*) die "job $id failed: $st" ;; esac
    sleep 1
  done
  [[ "$st" == *'"status":"done"'* ]] || die "job $id not done after 900 s: $st"
  curl -sf "$API/api/jobs/$id/result" > "$dir/api-result.json"
  python3 - "$dir/api-result.json" <<'PY'
import json, sys
r = json.load(open(sys.argv[1]))
s = r["summary"]; sc = r.get("score") or {}
print(f"job {r['job_id']}: mode={s['mode']} notes={s['notes_played']} attributed={s['notes_attributed_pct']}% "
      f"score='{sc.get('title')}' source={sc.get('source')} score_notes={len(sc.get('notes', []))}")
assert s["mode"] == "audio", "expected audio transcription mode"
assert s["notes_played"] > 0 and sc.get("notes"), "expected played notes and a parsed score"
print("api-journey: PASS")
PY
}

cmd_down() {
  local name pid id new
  for name in web backend; do
    if pid_alive "$name"; then
      pid="$(pid_of "$name")"
      pkill -TERM -P "$pid" 2>/dev/null || true   # audio/OMR worker subprocesses
      kill -TERM "$pid" 2>/dev/null || true
      for _ in $(seq 1 20); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
      kill -KILL "$pid" 2>/dev/null || true
      echo "stopped $name (pid $pid)"
    fi
    rm -f "${RUN:?}/${name:?}.pid"
  done
  if [[ -s "$RUN/jobs.adopted" ]]; then
    while read -r id; do
      [[ "$id" =~ ^[0-9a-f]{32}$ ]] || continue
      rm -rf "${JOBS_DIR:?}/${id:?}" && echo "removed job $id"
    done < "$RUN/jobs.adopted"
  fi
  : > "$RUN/jobs.adopted"
  if [[ -f "$RUN/jobs.before" ]]; then
    new="$(comm -13 "$RUN/jobs.before" <({ ls "$JOBS_DIR" 2>/dev/null || true; } | sort) || true)"
    [[ -n "$new" ]] && echo "WARN job dirs created since 'up' but never adopted (left in place): $new"
  fi
  rm -f "${RUN:?}/evidence"
  echo "evidence kept under $SKILL/evidence/"
}

case "${1:-}" in
  fixtures) cmd_fixtures ;;
  up) cmd_up ;;
  doctor) cmd_doctor ;;
  evidence) cmd_evidence "${2:-}" ;;
  adopt-job) cmd_adopt_job "${2:-}" ;;
  api-journey) cmd_api_journey ;;
  down) cmd_down ;;
  *) sed -n '2,4p' "$0"; exit 2 ;;
esac
