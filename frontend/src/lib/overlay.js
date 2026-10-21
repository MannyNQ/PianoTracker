// Canvas overlay renderer: hand skeletons, wrist posture rings, key glow,
// floating note labels and the calibration editor.

import { KeyboardMap, noteName, isWhite, whiteIndexToMidi } from './keyboard';
import { activeNotes, handAt, STATUS_COLORS } from './session';

// Paper tones (HUD slips, panels) and brighter tones for drawing on the video.
export const HAND_COLORS = { L: '#2f5fa8', R: '#d08a1c' };
const VIDEO_HAND = { L: '#7aa2ea', R: '#f2ac3e' };
const VIDEO_STATUS = { correct: '#5fca8f', wrong: '#ff4d5a', missed: '#ccd2d0', extra: '#b993e6', none: '#f4f6f5' };
const RED = '#ff4d5a';
const BLUE = '#7aa2ea';
const SLIP = 'rgba(244,246,245,0.94)';
const FONT = '"Instrument Sans Variable", ui-sans-serif, system-ui, sans-serif';
const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];
const TIPS = [4, 8, 12, 16, 20];

function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function poly(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawHand(ctx, W, H, hand, pose, unit, episode, t) {
  const color = VIDEO_HAND[hand];
  const P = (i) => [pose.pts[2 * i] * W, pose.pts[2 * i + 1] * H];
  const estimated = pose.state === 2;
  ctx.save();
  ctx.globalAlpha = estimated ? 0.55 : 1;
  if (estimated) ctx.setLineDash([unit * 2, unit * 2]);
  // soft under-glow
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(color, 0.18);
  ctx.lineWidth = unit * 5;
  ctx.beginPath();
  for (const [a, b] of BONES) {
    const [x1, y1] = P(a);
    const [x2, y2] = P(b);
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();
  ctx.strokeStyle = rgba(color, 0.95);
  ctx.lineWidth = unit * 1.6;
  ctx.stroke();
  ctx.setLineDash([]);
  // joints
  ctx.fillStyle = '#1c1f21';
  for (let i = 1; i < 21; i++) {
    if (TIPS.includes(i)) continue;
    const [x, y] = P(i);
    ctx.beginPath();
    ctx.arc(x, y, unit * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = unit;
    ctx.strokeStyle = color;
    ctx.stroke();
  }
  // fingertips
  TIPS.forEach((tip) => {
    const [x, y] = P(tip);
    ctx.beginPath();
    ctx.arc(x, y, unit * 3, 0, Math.PI * 2);
    ctx.fillStyle = rgba(color, 0.25);
    ctx.fill();
    ctx.lineWidth = unit * 1.3;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  });
  // wrist ring: posture state
  const [wx, wy] = P(0);
  const bad = !!episode;
  const pulse = bad ? 0.5 + 0.5 * Math.sin(t * 8) : 0;
  ctx.beginPath();
  ctx.arc(wx, wy, unit * (6 + pulse * 2), 0, Math.PI * 2);
  ctx.lineWidth = unit * 1.8;
  ctx.strokeStyle = bad ? rgba(RED, 0.95) : rgba(color, 0.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(wx, wy, unit * 2, 0, Math.PI * 2);
  ctx.fillStyle = bad ? RED : color;
  ctx.fill();
  if (bad) {
    const label = episode.kind === 'wrist_sag' ? 'Wrist sagging' : 'Hand angled';
    ctx.font = `600 ${unit * 5.5}px ${FONT}`;
    const tw = ctx.measureText(label).width;
    const bx = wx + unit * 10;
    const by = wy - unit * 4;
    roundRect(ctx, bx, by - unit * 5.5, tw + unit * 7, unit * 8.5, unit * 1);
    ctx.fillStyle = SLIP;
    ctx.fill();
    ctx.fillStyle = STATUS_COLORS.wrong;
    ctx.fillRect(bx, by - unit * 5.5, unit * 1, unit * 8.5);
    ctx.fillStyle = STATUS_COLORS.wrong;
    ctx.fillText(label, bx + unit * 3.5, by + unit * 1);
  }
  ctx.restore();
}

/**
 * Draw one overlay frame.
 * opts: { session, t, cal, calibrating, showSkeleton, showKeys, activeCorner }
 */
export function drawOverlay(ctx, W, H, opts) {
  const { session, t, cal, calibrating, showSkeleton = true, showKeys = true, activeCorner } = opts;
  ctx.clearRect(0, 0, W, H);
  const unit = Math.max(1, W / 640);
  if (!cal) return;
  const km = new KeyboardMap(cal, W, H);

  // Keyboard outline (subtle) / full key grid while calibrating.
  ctx.save();
  if (calibrating) {
    for (const k of km.keys()) {
      poly(ctx, km.keyPoly(k.midi));
      ctx.fillStyle = k.white ? 'rgba(255,255,255,0.04)' : rgba(BLUE, 0.2);
      ctx.fill();
      ctx.lineWidth = unit * 0.8;
      ctx.strokeStyle = k.white ? 'rgba(255,255,255,0.6)' : rgba(BLUE, 0.9);
      ctx.stroke();
    }
    ctx.font = `600 ${unit * 5.5}px ${FONT}`;
    ctx.textAlign = 'center';
    for (let i = 0; i < cal.num_white; i++) {
      const m = whiteIndexToMidi(cal.first_white_midi, i);
      if (m % 12 !== 0 && i !== 0) continue;
      const [x, y] = km.toImage(i + 0.5, 0.88);
      ctx.fillStyle = m === 60 ? '#2f5fa8' : '#2a2d2f';
      ctx.fillText(noteName(m), x, y);
    }
  } else if (showKeys) {
    poly(ctx, cal.quad.map(([x, y]) => [x * W, y * H]));
    ctx.lineWidth = unit * 0.8;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.stroke();
  }
  ctx.restore();

  if (session && !calibrating) {
    // Active keys glow by status.
    const act = activeNotes(session, t);
    for (const n of act) {
      const color = VIDEO_STATUS[n.status || 'none'];
      const age = t - n.onset;
      const a = Math.max(0.25, 0.75 - age * 0.8);
      ctx.save();
      poly(ctx, km.keyPoly(n.pitch));
      ctx.shadowColor = color;
      ctx.shadowBlur = unit * 12;
      ctx.fillStyle = rgba(color, a * (isWhite(n.pitch) ? 0.55 : 0.8));
      ctx.fill();
      ctx.restore();
    }
    // Missed score notes: dashed outline at their expected time.
    for (const m of session.missed) {
      const dt = t - m.onset;
      if (dt < 0 || dt > 0.5) continue;
      ctx.save();
      poly(ctx, km.keyPoly(m.pitch));
      ctx.setLineDash([unit * 3, unit * 2]);
      ctx.lineWidth = unit * 1.5;
      ctx.strokeStyle = rgba(VIDEO_STATUS.missed, 1 - dt * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  if (session && showSkeleton && session.frames) {
    for (const hand of ['L', 'R']) {
      const pose = handAt(session.frames, hand, t);
      if (!pose) continue;
      const ep = pose.bad
        ? session.posture_episodes.find((e) => e.hand === hand && e.start <= t && t <= e.end)
        : null;
      drawHand(ctx, W, H, hand, pose, unit, ep, t);
    }
  }

  if (session && !calibrating) {
    // Floating note labels rising from the back edge of the key.
    ctx.save();
    ctx.textAlign = 'center';
    const recent = activeNotes(session, t, 0.9)
      .filter((n) => t - n.onset < 0.9)
      .sort((p, q) => p.onset - q.onset);
    ctx.font = `600 ${unit * 6}px ${FONT}`;
    const boxH = unit * 9.5;
    const placed = [];
    for (const n of recent) {
      const age = t - n.onset;
      const [[x0, y0], [x1]] = km.keyPoly(n.pitch);
      const x = (x0 + x1) / 2;
      const label = noteName(n.pitch) + (n.hand ? `  ${n.hand}${n.finger}` : '');
      const bw = ctx.measureText(label).width + unit * 8;
      // Rise with age; bump upward past any label it would overlap.
      let y = y0 - unit * (10 + age * 26);
      const hits = (yy) =>
        placed.some((b) => Math.abs(b.x - x) < (b.w + bw) / 2 + unit && Math.abs(b.y - yy) < boxH + unit);
      for (let k = 0; k < 8 && hits(y); k++) y -= boxH + unit * 1.5;
      placed.push({ x, y, w: bw });
      const color = STATUS_COLORS[n.status || 'none'];
      ctx.globalAlpha = Math.max(0, 1 - age / 0.9);
      roundRect(ctx, x - bw / 2, y - unit * 6.5, bw, boxH, unit * 1);
      ctx.fillStyle = SLIP;
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillText(label, x, y);
    }
    ctx.restore();
  }

  if (calibrating) {
    cal.quad.forEach(([x, y], i) => {
      ctx.beginPath();
      ctx.arc(x * W, y * H, unit * (activeCorner === i ? 9 : 7), 0, Math.PI * 2);
      ctx.fillStyle = activeCorner === i ? BLUE : 'rgba(244,246,245,0.9)';
      ctx.fill();
      ctx.lineWidth = unit * 2;
      ctx.strokeStyle = '#2f5fa8';
      ctx.stroke();
    });
  }
}
