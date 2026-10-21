import { useEffect, useRef, useState } from 'react';

// The first four bars of Bach's Minuet in G (BWV Anh. 114), engraved on a
// treble staff and marked up the way PianoTracker grades a take: fingering
// in blue pencil as each note is heard, mistakes circled in red pencil.
// It plays through once on load; the marks then stay on the page.

const GAP = 16; // staff line spacing
const BOTTOM = 154; // y of the bottom line (E4)
const yOf = (step) => BOTTOM - step * (GAP / 2); // step: diatonic steps above E4
const STEP = { G4: 2, A4: 3, B4: 4, C5: 5, D5: 6, E5: 7, F5: 8, G5: 9 };
const STEM = 54;

const barX = (bar) => 140 + bar * 260;
const xOf = (beat) => barX(Math.floor(beat / 3)) + 30 + (beat % 3) * 76;

// [beat, note, eighth?, finger]
const NOTES = [
  [0, 'D5', false, 5], [1, 'G4', true, 1], [1.5, 'A4', true, 2], [2, 'B4', true, 3], [2.5, 'C5', true, 4],
  [3, 'D5', false, 5], [4, 'G4', false, 1], [5, 'G4', false, 1],
  [6, 'E5', false, 3], [7, 'C5', true, 1], [7.5, 'D5', true, 2], [8, 'E5', true, 3], [8.5, 'F5', true, 4],
  [9, 'G5', false, 5], [10, 'G4', false, 1], [11, 'G4', false, 1],
].map(([beat, name, eighth, finger], i) => ({ i, beat, step: STEP[name], eighth, finger, x: xOf(beat), y: yOf(STEP[name]) }));

const RUSHED = 7; // index of the note played early
const WRONG = 12; // F♯ played as F natural
const SPB = 0.46; // seconds per beat
const LEAD_IN = 0.9; // seconds before the first note
const END = 12.4; // beat at which the closing remark appears

// Stem direction and stem-end y for each note; eighth pairs share a beam.
const beams = [];
const stems = NOTES.map((n) => ({ up: n.step < 4, end: n.step < 4 ? n.y - STEM : n.y + STEM }));
for (let i = 0; i < NOTES.length - 1; i++) {
  const a = NOTES[i];
  const b = NOTES[i + 1];
  if (!a.eighth || !b.eighth || Math.floor(a.beat) !== Math.floor(b.beat)) continue;
  const up = (a.step + b.step) / 2 < 4;
  const dir = up ? -1 : 1;
  const slope = Math.max(-10, Math.min(10, b.y - a.y)) / 2;
  let mid = (a.y + b.y) / 2 + dir * STEM;
  // keep both stems at least 44 long
  for (const n of [a, b]) {
    const end = mid + (n === a ? -slope : slope);
    if (up && end > n.y - 44) mid -= end - (n.y - 44);
    if (!up && end < n.y + 44) mid += n.y + 44 - end;
  }
  stems[i] = { up, end: mid - slope };
  stems[i + 1] = { up, end: mid + slope };
  beams.push({ a, b, up, y1: mid - slope, y2: mid + slope });
  i++;
}
const stemX = (n, up) => n.x + (up ? 8.4 : -8.4);

// A hand-drawn loop: a little more than one turn, slightly uneven.
function loopPath(cx, cy, rx, ry) {
  const pts = [];
  for (let k = 0; k <= 44; k++) {
    const a = -2.2 + (k / 44) * (Math.PI * 2 + 0.6);
    const wobble = 1 + 0.07 * Math.sin(a * 3 + 1) + 0.04 * (k / 44);
    pts.push([cx + Math.cos(a) * rx * wobble, cy + Math.sin(a) * ry * wobble]);
  }
  return 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L');
}

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export default function Minuet({ className = '' }) {
  const [beat, setBeat] = useState(() => (reduceMotion() ? Infinity : -LEAD_IN / SPB));
  const scroller = useRef(null);

  useEffect(() => {
    if (beat === Infinity) return;
    let raf;
    const t0 = performance.now();
    const tick = (now) => {
      const b = (now - t0) / 1000 / SPB - LEAD_IN / SPB;
      setBeat(b > END + 2 ? Infinity : b);
      if (b <= END + 2) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // runs once on mount
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const heard = (n) => beat >= n.beat;
  const wrong = NOTES[WRONG];
  const rushed = NOTES[RUSHED];
  const playing = beat > -0.5 && beat < 12.2;
  const headX = beat < 0 ? xOf(0) - 14 : beat >= 12 ? barX(4) : xOf(Math.min(beat, 11.99)) - 14;

  // On narrow screens the staff scrolls sideways; keep the playhead in view.
  useEffect(() => {
    const el = scroller.current;
    if (!el || el.scrollWidth <= el.clientWidth || !playing) return;
    el.scrollLeft = (headX / 1200) * el.scrollWidth - el.clientWidth / 2;
  }, [headX, playing]);

  return (
    <div ref={scroller} className={`overflow-x-auto ${className}`}>
      <svg
        viewBox="0 0 1200 196"
        className="minuet block h-auto w-full min-w-[680px]"
        role="img"
        aria-label="The opening bars of Bach's Minuet in G with fingering written in blue pencil, a wrong F sharp circled in red and an early note marked rushed."
      >
        {/* staff */}
        <g stroke="var(--color-graphite)" strokeWidth="1.1">
          {[0, 1, 2, 3, 4].map((k) => (
            <line key={k} x1="12" x2={barX(4)} y1={BOTTOM - k * GAP} y2={BOTTOM - k * GAP} />
          ))}
          <line x1="12" x2="12" y1={BOTTOM - 4 * GAP} y2={BOTTOM} />
          {[1, 2, 3].map((b) => (
            <line key={b} x1={barX(b)} x2={barX(b)} y1={BOTTOM - 4 * GAP} y2={BOTTOM} />
          ))}
          <line x1={barX(4) - 7} x2={barX(4) - 7} y1={BOTTOM - 4 * GAP} y2={BOTTOM} />
        </g>
        <rect x={barX(4) - 3.5} y={BOTTOM - 4 * GAP} width="3.5" height={4 * GAP} fill="var(--color-graphite)" />

        {/* clef, key signature (one sharp on F5), 3/4 */}
        <g fill="var(--color-graphite)">
          <text x="20" y={yOf(2)} fontFamily="var(--font-music)" fontSize={GAP * 4.1}>
            𝄞
          </text>
          <text x="74" y={yOf(8) + 6} fontFamily="var(--font-music)" fontSize={GAP * 2}>
            ♯
          </text>
          <g fontFamily="var(--font-display)" fontWeight="800" fontSize={GAP * 2.3} textAnchor="middle">
            <text x="112" y={yOf(4) - 1.5}>3</text>
            <text x="112" y={yOf(0) - 1.5}>4</text>
          </g>
        </g>

        {/* playhead */}
        <rect
          x={headX}
          y={BOTTOM - 4 * GAP - 18}
          width="28"
          height={4 * GAP + 36}
          fill="var(--color-blue-pencil)"
          opacity={playing ? 0.1 : 0}
          style={{ transition: 'opacity 0.4s' }}
        />

        {/* notes */}
        {NOTES.map((n, k) => {
          const s = stems[k];
          const isWrong = k === WRONG && heard(n);
          const ink = isWrong ? 'var(--color-red-pencil)' : 'var(--color-graphite)';
          return (
            <g key={n.i} className="note" fill={ink} stroke={ink}>
              <ellipse cx={n.x} cy={n.y} rx="9.4" ry="6.6" transform={`rotate(-22 ${n.x} ${n.y})`} stroke="none" />
              <line x1={stemX(n, s.up)} x2={stemX(n, s.up)} y1={n.y + (s.up ? -2 : 2)} y2={s.end} strokeWidth="1.6" />
            </g>
          );
        })}
        {beams.map(({ a, b, up, y1, y2 }) => {
          const xa = stemX(a, up) - (up ? 0 : 0.8);
          const xb = stemX(b, up) + (up ? 0.8 : 0);
          const t = up ? 6.5 : -6.5;
          return (
            <path
              key={a.i}
              d={`M${xa} ${y1} L${xb} ${y2} L${xb} ${y2 + t} L${xa} ${y1 + t} Z`}
              fill="var(--color-graphite)"
            />
          );
        })}

        {/* blue pencil: fingering above each note as it is heard */}
        <g fontFamily="var(--font-hand)" fontSize="30" fill="var(--color-blue-pencil)" textAnchor="middle">
          {NOTES.map((n, k) => {
            const top = Math.min(n.y - 10, stems[k].up ? stems[k].end : n.y);
            return (
              <text key={n.i} x={n.x + (k % 3) - 1} y={Math.min(top - 10, 70)} className={`finger ${heard(n) ? 'on' : ''}`}>
                {n.finger}
              </text>
            );
          })}
        </g>

        {/* red pencil: corrections */}
        <g stroke="var(--color-red-pencil)" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path
            pathLength="1"
            className={`pencil-line ${heard(wrong) ? 'on' : ''}`}
            d={loopPath(wrong.x, wrong.y + 1, 22, 15)}
          />
          <path
            pathLength="1"
            className={`pencil-line ${heard(rushed) ? 'on' : ''}`}
            d={`M${rushed.x + 34} 40 Q${rushed.x + 4} 30 ${rushed.x - 30} 42 M${rushed.x - 30} 42 l12 -9 M${rushed.x - 30} 42 l13 5`}
          />
        </g>
        <g fontFamily="var(--font-hand)" fill="var(--color-red-pencil)" fontSize="36">
          <text x={rushed.x + 42} y="38" className={`remark ${heard(rushed) ? 'on' : ''}`} transform={`rotate(-4 ${rushed.x + 42} 38)`}>
            rushed
          </text>
          <text x={wrong.x + 28} y="40" className={`remark ${heard(wrong) ? 'on' : ''}`} transform={`rotate(-6 ${wrong.x + 28} 40)`}>
            F
            <tspan fontFamily="var(--font-music)" fontSize="24" dy="-2">
              ♯
            </tspan>
            <tspan dy="2">!</tspan>
          </text>
          <text x="150" y="34" className={`remark ${beat >= END ? 'on' : ''}`} transform="rotate(-3 150 34)">
            slower first,
            <tspan fontFamily="var(--font-music)" fontSize="26" dx="10">
              ♩
            </tspan>
            <tspan dx="4"> = 84</tspan>
          </text>
        </g>
      </svg>
    </div>
  );
}
