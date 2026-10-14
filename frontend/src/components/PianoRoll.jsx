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
        ctx.fillStyle = 'rgba(255,255,255,0.025)';
        ctx.fillRect(0, yOf(p), W, rowH);
      }
      if (p % 12 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(0, yOf(p) + rowH - 1, W, 1);
        ctx.fillStyle = 'rgba(200,204,214,0.45)';
        ctx.font = `${9 * dpr}px ui-monospace, monospace`;
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
      ctx.globalAlpha = n.onset <= t ? 1 : 0.55;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x, yOf(n.pitch) + 1, w, Math.max(2, rowH - 2), Math.min(3 * dpr, rowH / 2));
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
      ctx.fillStyle = 'rgba(255,107,107,0.55)';
      ctx.fillRect(xOf(e.start), H - band + 3 * dpr, xOf(e.end) - xOf(e.start), band - 6 * dpr);
    }
    // playhead
    const px = xOf(t);
    const g = ctx.createLinearGradient(px - 30 * dpr, 0, px, 0);
    g.addColorStop(0, 'rgba(232,180,90,0)');
    g.addColorStop(1, 'rgba(232,180,90,0.12)');
    ctx.fillStyle = g;
    ctx.fillRect(px - 30 * dpr, 0, 30 * dpr, H);
    ctx.fillStyle = '#e8b45a';
    ctx.fillRect(px - dpr / 2, 0, dpr, H);
  }, [session, t, range]);

  return (
    <canvas
      ref={canvas}
      className="h-36 w-full cursor-pointer rounded-xl bg-ink-900/70 ring-1 ring-white/5"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const frac = (e.clientX - r.left) / r.width;
        onSeek(Math.max(0, t - WINDOW_BEFORE + frac * (WINDOW_BEFORE + WINDOW_AFTER)));
      }}
    />
  );
}
