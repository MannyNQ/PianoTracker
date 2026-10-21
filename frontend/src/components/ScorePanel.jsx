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
        <div className="flex items-center gap-3 border-y border-rule py-3">
          <FileMusic className="h-5 w-5 text-graphite-soft" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-lg italic">{score.title}</div>
            <div className="flex flex-wrap items-center gap-x-2 text-xs text-graphite-soft">
              {score.notes.length} notes
              {score.source === 'omr' && (
                <span className="inline-flex items-center gap-1 text-blue-pencil">
                  <ScanLine className="h-3 w-3" /> read from sheet music
                </span>
              )}
            </div>
          </div>
          <button onClick={onClear} disabled={busy} className="rounded-sm p-2 text-graphite-soft hover:bg-paper-deep hover:text-red-pencil" title="Remove score" aria-label="Remove score">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-graphite-soft">No score attached. Upload the piece you played to grade note accuracy and timing.</p>
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
      <div className="text-[13px] leading-relaxed text-graphite-soft">
        <h3 className="mb-1 font-display text-lg italic text-graphite">How grading works</h3>
        Your notes are aligned to the score note by note, so a partial run-through is fine: only the section you
        reached is graded. Timing is measured against your own tempo, so expressive rubato isn't counted as error.
        <span className="mt-2 block">
          <span className="font-medium text-graphite">PDF or photo:</span> the notes are read by music recognition (about 10 s
          per page). Clean, printed scores work best. For exact grading, export MIDI or MusicXML from MuseScore,
          Flat, Noteflight or Sibelius.
        </span>
      </div>
    </div>
  );
}
