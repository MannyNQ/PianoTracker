import { useEffect, useMemo, useRef } from 'react';
import { STATUS_COLORS } from '../lib/session';
import { isWhite, noteName } from '../lib/keyboard';

const WINDOW_BEFORE = 3;
const WINDOW_AFTER = 6;

/** Scrolling piano roll: played notes (by status), missed notes, posture bands. */
export default function PianoRoll({ session, t, onSeek }) {
  const canvas = useRef(null);
  const range = useMemo(() => {
    const ps = [...session.notes.map((n) => n.pitch), ...(session.score?.notes || []).map((n) => n.pitch)];
    const lo = ps.length ? Math.min(...ps) - 2 : 48;
    const hi = ps.length ? Math.max(...ps) + 2 : 72;
    return [lo, Math.max(hi, lo + 18)];
  }, [session]);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const W = Math.round(c.clientWidth * dpr);
    const H = Math.round(c.clientHeight * dpr);
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const [lo, hi] = range;
    const band = 10 * dpr;
    const rowH = (H - band) / (hi - lo + 1);
    const t0 = t - WINDOW_BEFORE;
    const xOf = (time) => ((time - t0) / (WINDOW_BEFORE + WINDOW_AFTER)) * W;
    const yOf = (p) => (hi - p) * rowH;

    // pitch lanes
    for (let p = lo; p <= hi; p++) {
      if (!isWhite(p)) {
        ctx.fillStyle = 'rgba(42,45,47,0.045)';
        ctx.fillRect(0, yOf(p), W, rowH);
      }
      if (p % 12 === 0) {
        ctx.fillStyle = 'rgba(42,45,47,0.14)';
        ctx.fillRect(0, yOf(p) + rowH - 1, W, 1);
        ctx.fillStyle = '#5e6466';
        ctx.font = `500 ${10 * dpr}px "Instrument Sans Variable", ui-sans-serif, sans-serif`;
        ctx.fillText(noteName(p), 4 * dpr, yOf(p) + rowH - 3 * dpr);
      }
    }
    // played notes
    for (const n of session.notes) {
      const end = Math.max(n.offset ?? n.onset + 0.15, n.onset + 0.08);
      if (end < t0 || n.onset > t + WINDOW_AFTER) continue;
      const x = xOf(n.onset);
      const w = Math.max(3 * dpr, xOf(end) - x);
      const color = STATUS_COLORS[n.status || 'none'];
      ctx.globalAlpha = n.onset <= t ? 1 : 0.4;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, yOf(n.pitch) + 1, w, Math.max(2, rowH - 2), Math.min(1.5 * dpr, rowH / 2));
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // missed notes
    ctx.setLineDash([3 * dpr, 2 * dpr]);
    ctx.strokeStyle = STATUS_COLORS.missed;
    ctx.lineWidth = dpr;
    for (const m of session.missed) {
      if (m.onset < t0 - 1 || m.onset > t + WINDOW_AFTER) continue;
      ctx.strokeRect(xOf(m.onset), yOf(m.pitch) + 1, 14 * dpr, Math.max(2, rowH - 2));
    }
    ctx.setLineDash([]);
    // posture episodes band
    for (const e of session.posture_episodes) {
      if (e.end < t0 || e.start > t + WINDOW_AFTER) continue;
      ctx.fillStyle = 'rgba(200,32,47,0.45)';
      ctx.fillRect(xOf(e.start), H - band + 3 * dpr, xOf(e.end) - xOf(e.start), band - 6 * dpr);
    }
    // playhead
    const px = xOf(t);
    ctx.fillStyle = 'rgba(47,95,168,0.08)';
    ctx.fillRect(px - 24 * dpr, 0, 24 * dpr, H);
    ctx.fillStyle = '#2a2d2f';
    ctx.fillRect(px - dpr, 0, 2 * dpr, H);
  }, [session, t, range]);

  return (
    <canvas
      ref={canvas}
      className="h-36 w-full cursor-pointer border-b border-rule bg-paper-hi"
      role="img"
      aria-label="Piano roll of the notes around the playhead. Click to seek."
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const frac = (e.clientX - r.left) / r.width;
        onSeek(Math.max(0, t - WINDOW_BEFORE + frac * (WINDOW_BEFORE + WINDOW_AFTER)));
      }}
    />
  );
}
