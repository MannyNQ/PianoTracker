import { useEffect, useRef } from 'react';

// Very large keys, pressed in time to the opening of Bach's Minuet in G
// (BWV Anh. 114). Drawn flat on a canvas, then tilted in 3-D with CSS.

const FIRST_WHITE = 52; // E3
const NUM_WHITE = 17; // E3 .. G5
const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
const BLACK_AFTER = new Set([0, 2, 5, 7, 9]); // white keys followed by a black key
const BLACK_OFFSET = { 0: -0.08, 2: 0.08, 5: -0.1, 7: 0, 9: 0.1 };

const n = (name) => {
  const pc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[name[0]];
  const sharp = name[1] === '#';
  const oct = parseInt(name.slice(sharp ? 2 : 1), 10);
  return (oct + 1) * 12 + pc + (sharp ? 1 : 0);
};

// [beat, duration (beats), note] -- 3/4 time
const MELODY = [
  [0, 1, 'D5'], [1, 0.5, 'G4'], [1.5, 0.5, 'A4'], [2, 0.5, 'B4'], [2.5, 0.5, 'C5'],
  [3, 1, 'D5'], [4, 1, 'G4'], [5, 1, 'G4'],
  [6, 1, 'E5'], [7, 0.5, 'C5'], [7.5, 0.5, 'D5'], [8, 0.5, 'E5'], [8.5, 0.5, 'F#5'],
  [9, 1, 'G5'], [10, 1, 'G4'], [11, 1, 'G4'],
  [12, 1, 'C5'], [13, 0.5, 'D5'], [13.5, 0.5, 'C5'], [14, 0.5, 'B4'], [14.5, 0.5, 'A4'],
  [15, 1, 'B4'], [16, 0.5, 'C5'], [16.5, 0.5, 'B4'], [17, 0.5, 'A4'], [17.5, 0.5, 'G4'],
  [18, 1, 'F#4'], [19, 0.5, 'G4'], [19.5, 0.5, 'A4'], [20, 0.5, 'B4'], [20.5, 0.5, 'G4'],
  [21, 3, 'A4'],
];
const BASS = [
  [0, 2, 'G3'], [2, 1, 'A3'], [3, 3, 'B3'], [6, 3, 'C4'], [9, 3, 'B3'],
  [12, 3, 'A3'], [15, 3, 'G3'], [18, 3, 'D4'], [21, 3, 'F#3'],
];
const SPB = 0.62; // seconds per beat
const LOOP_BEATS = 27; // 24 beats of music + a breath
const EVENTS = [...MELODY, ...BASS].map(([b, d, name]) => ({ t: b * SPB, d: d * SPB, midi: n(name) }));

const ordinal = (m) => Math.floor(m / 12) * 7 + WHITE_PCS.indexOf(m % 12);
const isWhite = (m) => WHITE_PCS.includes(m % 12);

/** 0..1 key depression for a note event at loop time t. */
function envelope(t, ev) {
  const dt = t - ev.t;
  if (dt < 0) return 0;
  const attack = 0.07;
  const hold = Math.max(attack, ev.d * 0.82);
  if (dt < attack) return 1 - (1 - dt / attack) ** 3;
  if (dt < hold) return 1;
  const r = (dt - hold) / 0.32;
  return r >= 1 ? 0 : (1 - r) ** 2;
}

function draw(ctx, W, H, t) {
  ctx.clearRect(0, 0, W, H);
  const kw = W / NUM_WHITE;
  const bh = H * 0.62;
  const bw = kw * 0.58;
  const press = new Map();
  for (const ev of EVENTS) {
    const p = envelope(t, ev);
    if (p > 0) press.set(ev.midi, Math.max(press.get(ev.midi) || 0, p));
  }
  const base = ordinal(FIRST_WHITE);
  const lip = H * 0.035;

  // White keys
  for (let i = 0; i < NUM_WHITE; i++) {
    const o = base + i;
    const midi = Math.floor(o / 7) * 12 + WHITE_PCS[o % 7];
    const p = press.get(midi) || 0;
    const x = i * kw;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    const shade = 1 - 0.16 * p;
    g.addColorStop(0, `rgb(${222 * shade},${219 * shade},${212 * shade})`);
    g.addColorStop(1, `rgb(${246 * shade},${244 * shade},${238 * shade})`);
    ctx.fillStyle = g;
    ctx.fillRect(x + 1, 0, kw - 2, H);
    // Front lip: the key's front face, which slides down out of view when pressed.
    const lipH = lip * (1 - 0.65 * p);
    ctx.fillStyle = `rgba(255,255,255,${0.55 - 0.3 * p})`;
    ctx.fillRect(x + 1, H - lip - lipH * 0.15, kw - 2, lipH * 0.15 + 1);
    ctx.fillStyle = `rgba(0,0,0,${0.12 + 0.25 * p})`;
    ctx.fillRect(x + 1, H - lip + lipH * 0.85, kw - 2, lip - lipH * 0.85);
    if (p > 0) {
      // Neighbours now stand taller: soft shadows inside both edges.
      for (const [sx, dir] of [[x + 1, 1], [x + kw - 1, -1]]) {
        const sg = ctx.createLinearGradient(sx, 0, sx + dir * kw * 0.18, 0);
        sg.addColorStop(0, `rgba(0,0,0,${0.32 * p})`);
        sg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sg;
        ctx.fillRect(Math.min(sx, sx + dir * kw * 0.18), 0, kw * 0.18, H);
      }
    }
  }
  // Gaps between white keys
  ctx.fillStyle = '#121212';
  for (let i = 0; i <= NUM_WHITE; i++) ctx.fillRect(i * kw - 1, 0, 2, H);

  // Black keys (and the shadow each casts on the white keys)
  for (let i = 0; i < NUM_WHITE - 1; i++) {
    const o = base + i;
    const below = Math.floor(o / 7) * 12 + WHITE_PCS[o % 7];
    if (!BLACK_AFTER.has(below % 12)) continue;
    const midi = below + 1;
    const p = press.get(midi) || 0;
    const cx = (i + 1 + BLACK_OFFSET[below % 12]) * kw;
    const x = cx - bw / 2;
    const body = ctx.createLinearGradient(0, 0, 0, bh);
    body.addColorStop(0, '#050505');
    body.addColorStop(1, p > 0 ? '#0a0a0a' : '#151515');
    ctx.save();
    // Soft cast shadow on the white keys; it shortens as the key goes down.
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = kw * 0.35;
    ctx.shadowOffsetY = kw * 0.22 * (1 - 0.6 * p);
    ctx.fillStyle = body;
    ctx.fillRect(x, 0, bw, bh);
    ctx.restore();
    // Top bevel highlight and front bevel; both shrink as the key goes down.
    const bev = bh * 0.07 * (1 - 0.7 * p);
    const fg = ctx.createLinearGradient(0, bh - bev, 0, bh);
    fg.addColorStop(0, '#2c2c2c');
    fg.addColorStop(1, '#3a3a3a');
    ctx.fillStyle = fg;
    ctx.fillRect(x + bw * 0.06, bh - bev, bw * 0.88, bev);
    ctx.fillStyle = `rgba(255,255,255,${0.07 - 0.05 * p})`;
    ctx.fillRect(x + bw * 0.12, 0, bw * 0.08, bh - bev);
  }

  // Warm light where keys go down
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const [midi, p] of press) {
    const cu = isWhite(midi)
      ? ordinal(midi) - base + 0.5
      : ordinal(midi - 1) - base + 1 + BLACK_OFFSET[(midi - 1) % 12];
    const cx = cu * kw;
    const cy = isWhite(midi) ? H * 0.82 : bh * 0.8;
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, kw * 1.6);
    rg.addColorStop(0, `rgba(255,106,44,${0.22 * p})`);
    rg.addColorStop(1, 'rgba(255,106,44,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(cx - kw * 1.6, cy - kw * 1.6, kw * 3.2, kw * 3.2);
  }
  ctx.restore();
}

export default function PianoKeysBackground() {
  const canvas = useRef(null);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c.getContext('2d');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(c.clientWidth * dpr);
      c.height = Math.round(c.clientHeight * dpr);
      if (reduced) draw(ctx, c.width, c.height, 0.05);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(c);
    resize();
    if (!reduced) {
      const start = performance.now();
      const loop = (now) => {
        const t = ((now - start) / 1000) % (LOOP_BEATS * SPB);
        draw(ctx, c.width, c.height, t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ perspective: '900px' }}>
      {/* Front edge of the keyboard sits ~40% up from the bottom; the far end
          recedes into the dark at the top. */}
      <canvas
        ref={canvas}
        className="absolute left-1/2 h-[150%] w-[140%]"
        style={{ bottom: '40%', transform: 'translateX(-50%) rotateX(58deg)', transformOrigin: '50% 100%' }}
      />
      {/* Dim and fade the keys into black so text stays readable */}
      <div className="absolute inset-0 bg-black/25" />
      <div className="absolute inset-x-0 top-0 h-[42%] bg-gradient-to-b from-black via-black/70 to-transparent" />
      <div className="absolute inset-0 bg-[radial-gradient(90%_75%_at_50%_55%,transparent_40%,rgba(0,0,0,0.85)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 h-[42%] bg-black" />
      <div className="absolute inset-x-0 bottom-[42%] h-10 bg-gradient-to-t from-black to-transparent" />
    </div>
  );
}
