import { AlertTriangle, AudioLines, Eye } from 'lucide-react';
import { HAND_COLORS } from '../lib/overlay';
import { FINGER_NAMES, fmtTime, STATUS_COLORS } from '../lib/session';

function Stat({ label, value, unit, sub, color }) {
  return (
    <div className="rounded-lg border hairline bg-white/[0.02] p-3">
      <div className="label !text-[9.5px]">{label}</div>
      <div className="tnum mt-1 font-mono text-xl font-semibold" style={color ? { color } : undefined}>
        {value ?? '—'}
        {value != null && unit && <span className="ml-0.5 text-xs font-normal text-ink-400">{unit}</span>}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-ink-400">{sub}</div>}
    </div>
  );
}

function Section({ title, children, right }) {
  return (
    <section className="border-t hairline pt-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="label">{title}</h3>
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
      <div className="mb-1.5 text-[11px] text-ink-300">{hand === 'L' ? 'Left' : 'Right'} hand</div>
      <div className="flex h-16 items-end gap-1.5">
        {vals.map((v, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`${FINGER_NAMES[i]}: ${v}`}>
            <div
              className="w-full rounded-t-md"
              style={{ height: `${(48 * v) / max + 2}px`, background: HAND_COLORS[hand], opacity: 0.35 + (0.65 * v) / max }}
            />
            <span className="tnum font-mono text-[10px] text-ink-400">{i + 1}</span>
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
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[10px] uppercase tracking-[0.1em] ring-1 ${
            audio ? 'text-good ring-good/25' : 'text-warn ring-warn/25'
          }`}
        >
          {audio ? <AudioLines className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          {audio ? 'Audio + video' : 'Video-only estimate'}
        </span>
        <span className="font-mono text-[11px] text-ink-400">
          {fmtTime(s.duration_s)} · {s.notes_played} notes
        </span>
      </div>

      {session.warnings.length > 0 && (
        <div className="space-y-2">
          {session.warnings.map((w, i) => (
            <div key={i} className="flex gap-2 rounded-lg border border-warn/20 bg-warn/[0.04] p-3 text-xs leading-relaxed text-ink-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {sc ? (
        <div className="rounded-lg border hairline p-4">
          <div className="flex items-end justify-between">
            <div>
              <div className="label">Note accuracy</div>
              <div className="tnum mt-1 text-5xl font-medium leading-none tracking-[-0.04em]">
                {sc.accuracy_pct}
                <span className="text-2xl text-ink-400">%</span>
              </div>
            </div>
            <div className="text-right text-[11px] text-ink-400">
              <div className="truncate text-ink-200">{session.score.title}</div>
              <div>
                {sc.covered_notes} of {sc.score_notes} notes reached ({sc.coverage_pct}%)
              </div>
            </div>
          </div>
          <div className="mt-4 flex h-1 overflow-hidden rounded-full bg-ink-700">
            {[
              ['correct', sc.correct],
              ['wrong', sc.wrong],
              ['missed', sc.missed],
            ].map(([k, v]) => (
              <div key={k} style={{ width: `${(100 * v) / Math.max(1, sc.covered_notes)}%`, background: STATUS_COLORS[k] }} />
            ))}
          </div>
          <div className="tnum mt-2 flex justify-between font-mono text-[11px]">
            <span style={{ color: STATUS_COLORS.correct }}>{sc.correct} correct</span>
            <span style={{ color: STATUS_COLORS.wrong }}>{sc.wrong} wrong</span>
            <span style={{ color: STATUS_COLORS.missed }}>{sc.missed} missed</span>
            <span style={{ color: STATUS_COLORS.extra }}>{sc.extra} extra</span>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed hairline p-4 text-sm text-ink-300">
          Add a score (PDF, photo, MIDI or MusicXML) in the <span className="text-ivory">Score</span> tab to grade accuracy and timing.
        </div>
      )}

      {sc && (
        <div className="grid grid-cols-2 gap-2">
          <Stat
            label="Timing error"
            value={tim?.mean_abs_ms}
            unit="ms"
            sub={tim ? `${tim.within_50ms_pct}% within ±50 ms` : 'not enough matched notes'}
          />
          <Stat
            label="Tendency"
            value={tim ? `${tim.median_ms > 0 ? '+' : ''}${Math.round(tim.median_ms)}` : null}
            unit="ms"
            sub={tim ? (Math.abs(tim.median_ms) < 15 ? 'centred' : tim.median_ms < 0 ? 'rushing' : 'dragging') : null}
          />
          <Stat label="Tempo" value={sc.tempo?.bpm} unit="bpm" sub={sc.tempo ? `${sc.tempo.stability_pct}% steady` : null} />
          {sc.accuracy_by_hand_pct ? (
            <Stat
              label="By hand"
              value={`${sc.accuracy_by_hand_pct.L ?? '—'} / ${sc.accuracy_by_hand_pct.R ?? '—'}`}
              sub="left / right accuracy %"
            />
          ) : (
            <Stat label="Precision" value={sc.precision_pct} unit="%" sub="played notes that were right" />
          )}
        </div>
      )}

      <Section title="Technique">
        <div className="grid grid-cols-2 gap-2">
          {['L', 'R'].map((h) => (
            <Stat
              key={h}
              label={`${h === 'L' ? 'Left' : 'Right'} posture`}
              value={s.posture[h].good_pct}
              unit="%"
              sub={s.posture[h].good_pct == null ? 'not visible' : `good · median angle ${s.posture[h].median_angle_deg}°`}
              color={s.posture[h].good_pct == null ? undefined : s.posture[h].good_pct >= 90 ? STATUS_COLORS.correct : STATUS_COLORS.missed}
            />
          ))}
          {s.dynamics && (
            <Stat label="Dynamics" value={s.dynamics.evenness_pct} unit="%" sub={`evenness · avg velocity ${s.dynamics.mean_velocity}`} />
          )}
          <Stat label="Fingering found" value={s.notes_attributed_pct} unit="%" sub="notes matched to a finger" />
        </div>
        {session.posture_episodes.length > 0 && (
          <ul className="mt-3 max-h-36 space-y-1 overflow-y-auto pr-1">
            {session.posture_episodes.map((e, i) => (
              <li key={i}>
                <button
                  onClick={() => onSeek(e.start)}
                  className="flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-left text-xs hover:bg-white/5"
                >
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-bad" />
                    {e.hand === 'L' ? 'Left' : 'Right'} · {e.kind === 'wrist_sag' ? 'wrist sagging' : 'hand angled'}
                  </span>
                  <span className="tnum font-mono text-ink-400">
                    {fmtTime(e.start)} · {(e.end - e.start).toFixed(1)}s
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
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
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Left hand" value={s.tracking.left.detected_pct} unit="%" sub={`+${s.tracking.left.interpolated_pct}% estimated`} />
          <Stat label="Right hand" value={s.tracking.right.detected_pct} unit="%" sub={`+${s.tracking.right.interpolated_pct}% estimated`} />
          <Stat label="Both" value={s.tracking.both_hands_pct} unit="%" sub={`${s.tracking.fps} fps`} />
        </div>
        {s.calibration_check?.on_key_pct != null && (
          <p className={`mt-2 text-[11px] ${s.calibration_check.on_key_pct < 75 ? 'text-warn' : 'text-ink-400'}`}>
            {s.calibration_check.on_key_pct}% of heard notes had a fingertip on the matching key.
          </p>
        )}
      </Section>
    </div>
  );
}
