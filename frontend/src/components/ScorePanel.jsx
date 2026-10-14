import { useRef, useState } from 'react';
import { FileMusic, ScanLine, Trash2, Upload } from 'lucide-react';
import { isSheetImage, SCORE_ACCEPT } from '../lib/formats';

export default function ScorePanel({ session, onUpload, onClear, busy }) {
  const input = useRef(null);
  const [reading, setReading] = useState(false);
  const score = session.score;
  return (
    <div className="space-y-4">
      {score ? (
        <div className="flex items-center gap-3 rounded-lg border hairline bg-white/[0.02] p-3">
          <FileMusic className="h-4 w-4 text-ink-300" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{score.title}</div>
            <div className="flex items-center gap-1.5 text-xs text-ink-400">
              {score.notes.length} notes
              {score.source === 'omr' && (
                <span className="inline-flex items-center gap-1 rounded border border-accent/30 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-accent">
                  <ScanLine className="h-2.5 w-2.5" /> read from sheet music
                </span>
              )}
            </div>
          </div>
          <button onClick={onClear} disabled={busy} className="rounded-lg p-2 text-ink-400 hover:bg-white/5 hover:text-bad" title="Remove score">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <p className="text-sm text-ink-300">No score attached. Upload the piece you played to grade note accuracy and timing.</p>
      )}
      <input
        ref={input}
        type="file"
        accept={SCORE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) {
            setReading(isSheetImage(f.name));
            onUpload(f);
          }
        }}
      />
      <button
        onClick={() => input.current?.click()}
        disabled={busy}
        className="btn-ghost w-full px-4 py-2.5 text-sm"
      >
        <Upload className="h-4 w-4" />
        {busy ? (reading ? 'Reading sheet music…' : 'Scoring…') : score ? 'Replace score' : 'Upload score'}
      </button>
      <div className="rounded-lg border hairline p-3 text-xs leading-relaxed text-ink-400">
        <p className="mb-1 text-ink-200">How grading works</p>
        Your notes are aligned to the score note by note, so a partial run-through is fine: only the section you
        reached is graded. Timing is measured against your own tempo, so expressive rubato isn't counted as error.
        <span className="mt-2 block">
          <span className="text-ink-200">PDF or photo:</span> the notes are read by music recognition (about 10 s
          per page). Clean, printed scores work best. For exact grading, export MIDI or MusicXML from MuseScore,
          Flat, Noteflight or Sibelius.
        </span>
      </div>
    </div>
  );
}
