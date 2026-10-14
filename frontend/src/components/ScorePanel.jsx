import { useRef } from 'react';
import { FileMusic, Trash2, Upload } from 'lucide-react';

export default function ScorePanel({ session, onUpload, onClear, busy }) {
  const input = useRef(null);
  const score = session.score;
  return (
    <div className="space-y-4">
      {score ? (
        <div className="flex items-center gap-3 rounded-xl border hairline bg-ink-900/50 p-3">
          <FileMusic className="h-5 w-5 text-gold" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{score.title}</div>
            <div className="text-xs text-ink-400">{score.notes.length} notes</div>
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
        accept=".mid,.midi,.musicxml,.xml,.mxl"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onUpload(f);
        }}
      />
      <button
        onClick={() => input.current?.click()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm ring-1 ring-white/10 hover:bg-white/5 disabled:opacity-50"
      >
        <Upload className="h-4 w-4" />
        {busy ? 'Scoring…' : score ? 'Replace score' : 'Upload MIDI / MusicXML'}
      </button>
      <div className="rounded-xl border hairline p-3 text-xs leading-relaxed text-ink-400">
        <p className="mb-1 text-ink-200">How grading works</p>
        Your notes are aligned to the score note by note, so a partial run-through is fine: only the section you
        reached is graded. Timing is measured against your own tempo, so expressive rubato isn't counted as error.
        Export MIDI or MusicXML from MuseScore, Flat, Noteflight or Sibelius.
      </div>
    </div>
  );
}
