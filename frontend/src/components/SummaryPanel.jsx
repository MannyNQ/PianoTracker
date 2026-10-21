import { AlertTriangle, AudioLines, Eye } from 'lucide-react';
import { HAND_COLORS } from '../lib/overlay';
import { FINGER_NAMES, fmtTime, STATUS_COLORS } from '../lib/session';

function Stat({ label, value, unit, sub, color }) {
  return (
    <div className="border-b border-rule-soft pb-2.5">
      <div className="caption">{label}</div>
      <div className="tnum mt-0.5 font-display text-2xl font-medium" style={color ? { color } : undefined}>
        {value ?? '—'}
        {value != null && unit && <span className="ml-1 font-sans text-xs font-normal text-graphite-soft">{unit}</span>}
      </div>
      {sub && <div className="mt-0.5 text-xs leading-snug text-graphite-soft">{sub}</div>}
    </div>
  );
}

function Section({ title, children, right }) {
  return (
    <section className="border-t border-graphite pt-3">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-lg italic">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

function FingerBars({ counts, hand }) {
  const vals = [1, 2, 3, 4, 5].map((f) => counts?.[f] || 0);
  const max = Math.max(1, ...vals);
  return (
    <div>
      <div className="caption mb-1.5">{hand === 'L' ? 'Left' : 'Right'} hand</div>
      <div className="flex h-16 items-end gap-1.5">
        {vals.map((v, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`${FINGER_NAMES[i]}: ${v}`}>
            <div
              className="w-full rounded-t-[2px]"
              style={{ height: `${(48 * v) / max + 2}px`, background: HAND_COLORS[hand], opacity: 0.35 + (0.65 * v) / max }}
            />
            <span className="tnum font-hand text-lg leading-none text-blue-pencil">{i + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SummaryPanel({ session, onSeek }) {
  const s = session.summary;
  const sc = s.score;
  const tim = sc?.timing;
  const audio = s.mode === 'audio';
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${audio ? 'text-good' : 'text-amber'}`}>
          {audio ? <AudioLines className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {audio ? 'Heard and seen' : 'Estimated from video only'}
        </span>
        <span className="tnum text-[13px] text-graphite-soft">
          {s.notes_played} notes in {fmtTime(s.duration_s)}
        </span>
      </div>

      {session.warnings.length > 0 && (
        <div className="space-y-2">
          {session.warnings.map((w, i) => (
            <div key={i} className="flex gap-2 border-l-2 border-amber pl-3 text-[13px] leading-relaxed text-graphite">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {sc ? (
        <div>
          <div className="flex items-end justify-between gap-4">
            <div>
              <div className="caption">Note accuracy</div>
              <div className="tnum mt-1 font-display text-6xl font-medium leading-none tracking-[-0.02em]">
                {sc.accuracy_pct}
                <span className="text-3xl text-graphite-faint">%</span>
              </div>
            </div>
            <div className="min-w-0 text-right text-xs text-graphite-soft">
              <div className="truncate font-display text-sm italic text-graphite">{session.score.title}</div>
              <div>
                {sc.covered_notes} of {sc.score_notes} notes reached ({sc.coverage_pct}%)
              </div>
            </div>
          </div>
          <div className="mt-4 flex h-1.5 overflow-hidden bg-rule-soft">
            {[
              ['correct', sc.correct],
              ['wrong', sc.wrong],
              ['missed', sc.missed],
            ].map(([k, v]) => (
              <div key={k} style={{ width: `${(100 * v) / Math.max(1, sc.covered_notes)}%`, background: STATUS_COLORS[k] }} />
            ))}
          </div>
          <div className="tnum mt-2 flex justify-between text-xs font-medium">
            <span style={{ color: STATUS_COLORS.correct }}>{sc.correct} correct</span>
            <span style={{ color: STATUS_COLORS.wrong }}>{sc.wrong} wrong</span>
            <span style={{ color: STATUS_COLORS.missed }}>{sc.missed} missed</span>
            <span style={{ color: STATUS_COLORS.extra }}>{sc.extra} extra</span>
          </div>
        </div>
      ) : (
        <div className="border-l-2 border-blue-pencil pl-3 text-sm leading-relaxed text-graphite-soft">
          To grade accuracy and timing, add the score as a PDF, photo, MIDI or MusicXML in the{' '}
          <span className="font-medium text-graphite">Score</span> tab.
        </div>
      )}

      {sc && (
        <div className="grid grid-cols-2 gap-x-5 gap-y-3">
          <Stat
            label="Timing error"
            value={tim?.mean_abs_ms}
            unit="ms"
            sub={tim ? `${tim.within_50ms_pct}% within 50 ms` : 'Not enough matched notes'}
          />
          <Stat
            label="Tendency"
            value={tim ? `${tim.median_ms > 0 ? '+' : ''}${Math.round(tim.median_ms)}` : null}
            unit="ms"
            sub={tim ? (Math.abs(tim.median_ms) < 15 ? 'Steady, no lean' : tim.median_ms < 0 ? 'Rushing' : 'Dragging') : null}
          />
          <Stat label="Tempo" value={sc.tempo?.bpm} unit="bpm" sub={sc.tempo ? `${sc.tempo.stability_pct}% steady` : null} />
          {sc.accuracy_by_hand_pct ? (
            <Stat
              label="By hand"
              value={`${sc.accuracy_by_hand_pct.L ?? '—'} / ${sc.accuracy_by_hand_pct.R ?? '—'}`}
              sub="Left / right accuracy, %"
            />
          ) : (
            <Stat label="Precision" value={sc.precision_pct} unit="%" sub="Played notes that were right" />
          )}
        </div>
      )}

      <Section title="Technique">
        <div className="grid grid-cols-2 gap-x-5 gap-y-3">
          {['L', 'R'].map((h) => (
            <Stat
              key={h}
              label={`${h === 'L' ? 'Left' : 'Right'} posture`}
              value={s.posture[h].good_pct}
              unit="%"
              sub={s.posture[h].good_pct == null ? 'Hand not visible' : `Good, median angle ${s.posture[h].median_angle_deg}°`}
              color={s.posture[h].good_pct == null ? undefined : s.posture[h].good_pct >= 90 ? STATUS_COLORS.correct : STATUS_COLORS.wrong}
            />
          ))}
          {s.dynamics && (
            <Stat label="Dynamics" value={s.dynamics.evenness_pct} unit="%" sub={`Evenness, average velocity ${s.dynamics.mean_velocity}`} />
          )}
          <Stat label="Fingering found" value={s.notes_attributed_pct} unit="%" sub="Notes matched to a finger" />
        </div>
        {session.posture_episodes.length > 0 && (
          <ul className="mt-3 max-h-36 space-y-1 overflow-y-auto pr-1">
            {session.posture_episodes.map((e, i) => (
              <li key={i}>
                <button
                  onClick={() => onSeek(e.start)}
                  className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-[13px] hover:bg-paper-deep"
                >
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-red-pencil" />
                    {e.hand === 'L' ? 'Left' : 'Right'} {e.kind === 'wrist_sag' ? 'wrist sagging' : 'hand angled'}
                  </span>
                  <span className="tnum text-graphite-soft">
                    {fmtTime(e.start)}, {(e.end - e.start).toFixed(1)} s
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs leading-relaxed text-graphite-soft">
          Hand angle is measured from above. Wrist sag is experimental: it flags moments your wrist drops below your
          own usual level.
        </p>
      </Section>

      <Section title="Finger usage">
        <div className="grid grid-cols-2 gap-4">
          <FingerBars counts={s.fingers.L} hand="L" />
          <FingerBars counts={s.fingers.R} hand="R" />
        </div>
      </Section>

      <Section title="Tracking quality">
        <div className="grid grid-cols-3 gap-x-4">
          <Stat label="Left hand" value={s.tracking.left.detected_pct} unit="%" sub={`+${s.tracking.left.interpolated_pct}% estimated`} />
          <Stat label="Right hand" value={s.tracking.right.detected_pct} unit="%" sub={`+${s.tracking.right.interpolated_pct}% estimated`} />
          <Stat label="Both" value={s.tracking.both_hands_pct} unit="%" sub={`${s.tracking.fps} fps`} />
        </div>
        {s.calibration_check?.on_key_pct != null && (
          <p className={`mt-3 text-xs ${s.calibration_check.on_key_pct < 75 ? 'text-red-pencil' : 'text-graphite-soft'}`}>
            {s.calibration_check.on_key_pct}% of heard notes had a fingertip on the matching key.
          </p>
        )}
      </Section>
    </div>
  );
}
