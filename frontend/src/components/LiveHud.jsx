import { HAND_COLORS } from '../lib/overlay';
import { handAt, STATUS_COLORS, FINGER_NAMES } from '../lib/session';
import { noteName } from '../lib/keyboard';

function Ring({ value, size = 52, stroke = 3 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const color = value == null ? '#6b6b6b' : v >= 90 ? STATUS_COLORS.correct : v >= 75 ? STATUS_COLORS.missed : STATUS_COLORS.wrong;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - v / 100)}
        style={{ transition: 'stroke-dashoffset 300ms ease, stroke 300ms' }}
      />
    </svg>
  );
}

function TimingMeter({ ms }) {
  const clamp = Math.max(-150, Math.min(150, ms ?? 0));
  const pos = 50 + (clamp / 150) * 50;
  const tight = ms != null && Math.abs(ms) <= 50;
  return (
    <div className="w-40">
      <div className="mb-1.5 flex justify-between font-mono text-[9.5px] tracking-[0.12em] text-ink-400">
        <span>EARLY</span>
        <span>LATE</span>
      </div>
      <div className="relative h-px bg-white/20">
        <div className="absolute -top-1 left-1/2 h-2.5 w-px bg-white/50" />
        <div className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black transition-[left] duration-200"
          style={{ left: `${pos}%`, background: ms == null ? '#6b6b6b' : tight ? STATUS_COLORS.correct : STATUS_COLORS.missed }} />
      </div>
      <div className="tnum mt-2 text-center font-mono text-[11px] text-ink-200">
        {ms == null ? '—' : `${ms > 0 ? '+' : ''}${Math.round(ms)} ms`}
      </div>
    </div>
  );
}

export default function LiveHud({ session, t, stats, cal }) {
  // Keep the panels off the keyboard: if it sits in the upper half of the
  // frame, the stat panels go to the bottom (and the hand chips to the top).
  const kbMid = cal ? cal.quad.reduce((a, [, y]) => a + y, 0) / 4 : 0.6;
  const panelsAt = kbMid < 0.5 ? 'bottom-3' : 'top-3';
  const chipsAt = kbMid < 0.5 ? 'top-3' : 'bottom-3';
  const hasScore = !!session.score;
  const last = stats.lastNote;
  return (
    <>
      {/* top-left: accuracy */}
      <div className={`overlay-chip pointer-events-none absolute left-3 ${panelsAt} flex items-center gap-3 rounded-lg py-2 pl-2 pr-3.5`}>
        <div className="relative">
          <Ring value={hasScore ? stats.accuracy : null} />
          <div className="tnum absolute inset-0 flex items-center justify-center font-mono text-[13px] font-medium">
            {hasScore ? (stats.accuracy == null ? '—' : `${Math.round(stats.accuracy)}`) : stats.played}
          </div>
        </div>
        <div>
          <div className="label">{hasScore ? 'Accuracy' : 'Notes'}</div>
          {hasScore ? (
            <div className="tnum mt-1 flex gap-2.5 font-mono text-[11px]">
              <span style={{ color: STATUS_COLORS.correct }}>{stats.correct}✓</span>
              <span style={{ color: STATUS_COLORS.wrong }}>{stats.wrong}✗</span>
              <span style={{ color: STATUS_COLORS.missed }}>{stats.missed} miss</span>
              <span style={{ color: STATUS_COLORS.extra }}>{stats.extra} extra</span>
            </div>
          ) : (
            <div className="mt-1 text-[11px] text-ink-400">add a score to grade</div>
          )}
          {hasScore && stats.streak >= 3 && (
            <div className="mt-1 text-[11px] text-accent-soft">
              <span className="tnum font-mono font-semibold">{stats.streak}</span> in a row
            </div>
          )}
        </div>
      </div>

      {/* top-right: timing & last note */}
      <div className={`overlay-chip pointer-events-none absolute right-3 ${panelsAt} rounded-lg px-3.5 py-2.5`}>
        <div className="label mb-2 !text-[9.5px]">{hasScore ? 'Timing' : 'Last note'}</div>
        {hasScore && <TimingMeter ms={stats.lastTimed?.timing_ms} />}
        {last && (
          <div className={`flex items-baseline gap-2 ${hasScore ? 'mt-2 border-t hairline pt-2' : ''}`}>
            <span className="font-mono text-lg font-medium" style={{ color: STATUS_COLORS[last.status || 'none'] }}>
              {noteName(last.pitch)}
            </span>
            <span className="text-xs text-ink-300">
              {last.hand ? `${last.hand === 'L' ? 'Left' : 'Right'} ${FINGER_NAMES[last.finger - 1].toLowerCase()}` : 'finger unknown'}
            </span>
            {last.status === 'wrong' && last.expected_pitch != null && (
              <span className="text-xs text-ink-400">expected {noteName(last.expected_pitch)}</span>
            )}
          </div>
        )}
      </div>

      {/* bottom-left: hands */}
      <div className={`pointer-events-none absolute left-3 ${chipsAt} flex gap-2`}>
        {['L', 'R'].map((h) => {
          const pose = handAt(session.frames, h, t);
          const ep = pose?.bad
            ? session.posture_episodes.find((e) => e.hand === h && e.start <= t && t <= e.end)
            : null;
          return (
            <div key={h} className="overlay-chip flex items-center gap-2 rounded-md px-2.5 py-1 text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: pose ? HAND_COLORS[h] : '#2b2b2b' }} />
              <span className="text-ink-200">{h === 'L' ? 'Left' : 'Right'}</span>
              <span className={ep ? 'text-bad' : pose ? 'text-ink-400' : 'text-ink-600'}>
                {!pose ? 'not visible' : ep ? (ep.kind === 'wrist_sag' ? 'wrist sagging' : 'hand angled') : pose.state === 2 ? 'estimated' : 'tracking'}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
