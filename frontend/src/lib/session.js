// Time-indexed views over an analysis result, for the live HUD.

export const FINGER_NAMES = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];

export const STATUS_COLORS = {
  correct: '#6ee7a8',
  wrong: '#ff5c5c',
  extra: '#a78bfa',
  missed: '#f5b84a',
  none: '#f2f2f2',
};

/** Index of the last element with key(el) <= t (binary search), or -1. */
export function lastIndexAtOrBefore(arr, t, key = (x) => x) {
  let lo = 0;
  let hi = arr.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (key(arr[mid]) <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

/** Interpolated landmarks for a hand at time t: Float array [x0,y0,...] or null. */
export function handAt(frames, hand, t) {
  const ts = frames.t;
  const h = frames.hands[hand];
  const i = lastIndexAtOrBefore(ts, t);
  if (i < 0) return null;
  const a = h.pts[i];
  const j = Math.min(i + 1, ts.length - 1);
  const b = h.pts[j];
  if (!a) return null;
  const state = h.state[i];
  const bad = h.bad[i] === 1;
  if (!b || j === i) return { pts: a, state, bad };
  const w = Math.min(1, Math.max(0, (t - ts[i]) / (ts[j] - ts[i] || 1)));
  const pts = a.map((v, k) => v + (b[k] - v) * w);
  return { pts, state, bad };
}

/** Precompute per-session structures once per result. */
export function prepare(result) {
  const notes = [...result.notes].sort((a, b) => a.onset - b.onset);
  const missed = (result.score?.notes || [])
    .filter((n) => n.status === 'missed')
    .map((n) => ({ ...n, onset: n.expected_time }))
    .sort((a, b) => a.onset - b.onset);
  return { ...result, notes, missed };
}

/** Running stats at time t (what the HUD shows while playing). */
export function liveStats(session, t) {
  const { notes, missed } = session;
  const n = lastIndexAtOrBefore(notes, t, (x) => x.onset) + 1;
  const m = lastIndexAtOrBefore(missed, t, (x) => x.onset) + 1;
  let correct = 0;
  let wrong = 0;
  let extra = 0;
  let streak = 0;
  let bestStreak = 0;
  for (let i = 0; i < n; i++) {
    const s = notes[i].status;
    if (s === 'correct') {
      correct++;
      streak++;
      bestStreak = Math.max(bestStreak, streak);
    } else if (s === 'wrong' || s === 'extra') {
      if (s === 'wrong') wrong++;
      else extra++;
      streak = 0;
    }
  }
  // Missed notes also break the streak if they're more recent than the last hit.
  if (m > 0 && n > 0 && missed[m - 1].onset > notes[n - 1].onset) streak = 0;
  const graded = correct + wrong + m;
  let lastTimed = null;
  for (let i = n - 1; i >= 0 && i >= n - 12; i--) {
    if (notes[i].timing_ms != null) {
      lastTimed = notes[i];
      break;
    }
  }
  return {
    played: n,
    correct,
    wrong,
    extra,
    missed: m,
    accuracy: graded ? (100 * correct) / graded : null,
    streak,
    bestStreak,
    lastTimed,
    lastNote: n ? notes[n - 1] : null,
  };
}

/** Notes sounding at t (onset <= t < max(offset, onset+minDur)). */
export function activeNotes(session, t, minDur = 0.18) {
  const out = [];
  const { notes } = session;
  const i = lastIndexAtOrBefore(notes, t, (x) => x.onset);
  for (let k = i; k >= 0 && k > i - 40; k--) {
    const nt = notes[k];
    if (t < Math.max(nt.offset ?? nt.onset, nt.onset + minDur)) out.push(nt);
    if (t - nt.onset > 8) break;
  }
  return out;
}

export const fmtTime = (s) => {
  if (s == null || !isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
};

export function togglePlay(video) {
  if (!video) return;
  if (video.paused) video.play();
  else video.pause();
}
