import { HAND_COLORS } from '../lib/overlay';
import { handAt, STATUS_COLORS, FINGER_NAMES } from '../lib/session';
import { noteName } from '../lib/keyboard';

function Ring({ value, size = 52, stroke = 3 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const color = value == null ? '#b9bfbc' : v >= 90 ? STATUS_COLORS.correct : v >= 75 ? STATUS_COLORS.none : STATUS_COLORS.wrong;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#cfd4d1" strokeWidth={stroke} />
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
      <div className="mb-1.5 flex justify-between text-[11px] text-graphite-soft">
        <span>early</span>
        <span>late</span>
      </div>
      <div className="relative h-px bg-rule">
        <div className="absolute -top-1 left-1/2 h-2.5 w-px bg-graphite-soft" />
        <div className="absolute top-1/2 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-[1px] transition-[left] duration-200"
          style={{ left: `${pos}%`, background: ms == null ? '#b9bfbc' : tight ? STATUS_COLORS.correct : STATUS_COLORS.wrong }} />
      </div>
      <div className="tnum mt-2 text-center text-xs font-medium text-graphite">
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
      <div className={`slip pointer-events-none absolute left-3 ${panelsAt} flex items-center gap-3 py-2 pl-2 pr-3.5`}>
        <div className="relative">
          <Ring value={hasScore ? stats.accuracy : null} />
          <div className="tnum absolute inset-0 flex items-center justify-center font-display text-[17px] font-semibold">
            {hasScore ? (stats.accuracy == null ? '—' : `${Math.round(stats.accuracy)}`) : stats.played}
          </div>
        </div>
        <div>
          <div className="caption">{hasScore ? 'Accuracy so far' : 'Notes heard'}</div>
          {hasScore ? (
            <div className="tnum mt-0.5 flex gap-2.5 text-xs font-medium">
              <span style={{ color: STATUS_COLORS.correct }}>{stats.correct} right</span>
              <span style={{ color: STATUS_COLORS.wrong }}>{stats.wrong} wrong</span>
              <span style={{ color: STATUS_COLORS.missed }}>{stats.missed} miss</span>
              <span style={{ color: STATUS_COLORS.extra }}>{stats.extra} extra</span>
            </div>
          ) : (
            <div className="mt-0.5 text-xs text-graphite-soft">Add a score to grade</div>
          )}
          {hasScore && stats.streak >= 3 && (
            <div className="mt-0.5 text-xs text-blue-pencil">
              <span className="tnum font-semibold">{stats.streak}</span> right in a row
            </div>
          )}
        </div>
      </div>

      {/* top-right: timing & last note */}
      <div className={`slip pointer-events-none absolute right-3 ${panelsAt} px-3.5 py-2.5`}>
        <div className="caption mb-1.5">{hasScore ? 'Timing' : 'Last note'}</div>
        {hasScore && <TimingMeter ms={stats.lastTimed?.timing_ms} />}
        {last && (
          <div className={`flex items-baseline gap-2 ${hasScore ? 'mt-2 border-t border-rule-soft pt-2' : ''}`}>
            <span className="font-display text-xl font-semibold" style={{ color: STATUS_COLORS[last.status || 'none'] }}>
              {noteName(last.pitch)}
            </span>
            <span className="text-xs text-blue-pencil">
              {last.hand ? `${last.hand === 'L' ? 'Left' : 'Right'} ${FINGER_NAMES[last.finger - 1].toLowerCase()}` : 'finger unknown'}
            </span>
            {last.status === 'wrong' && last.expected_pitch != null && (
              <span className="text-xs text-graphite-soft">expected {noteName(last.expected_pitch)}</span>
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
            <div key={h} className="slip flex items-center gap-2 px-2.5 py-1 text-xs">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: pose ? HAND_COLORS[h] : '#b9bfbc' }} />
              <span className="font-medium">{h === 'L' ? 'Left' : 'Right'}</span>
              <span className={ep ? 'text-red-pencil' : pose ? 'text-graphite-soft' : 'text-graphite-faint'}>
                {!pose ? 'not visible' : ep ? (ep.kind === 'wrist_sag' ? 'wrist sagging' : 'hand angled') : pose.state === 2 ? 'estimated' : 'tracking'}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
