import { Minus, Plus, RotateCcw } from 'lucide-react';
import { noteName, WHITE_KEYS } from '../lib/keyboard';

export default function CalibrationPanel({ draft, setDraft, original, editing, setEditing, onApply, busy, dirty }) {
  if (!draft) return null;
  const set = (patch) => setDraft({ ...draft, ...patch });
  return (
    <div className="space-y-5">
      <p className="text-sm text-graphite-soft">
        The keyboard was {original?.source === 'user' ? 'set by you' : 'detected automatically'}.
        {original?.notes?.length > 0 && <span className="mt-1 block text-xs">{original.notes.join('. ')}</span>}
      </p>

      <button
        onClick={() => setEditing(!editing)}
        aria-pressed={editing}
        className={`w-full rounded-[3px] px-4 py-2.5 text-sm font-medium transition-colors ${
          editing ? 'bg-blue-pencil text-paper-hi' : 'border border-rule text-graphite hover:bg-paper-deep'
        }`}
      >
        {editing ? 'Done adjusting' : 'Adjust keyboard on video'}
      </button>
      {editing && (
        <p className="text-[13px] leading-relaxed text-graphite-soft">
          Drag the four blue corners onto the keyboard's corners: back edge (where black keys start) and front edge
          of the white keys. Key outlines update live.
        </p>
      )}

      <div className="space-y-4 border-y border-rule py-4">
        <label className="block">
          <span className="caption">Lowest visible white key</span>
          <select
            value={draft.first_white_midi}
            onChange={(e) => set({ first_white_midi: parseInt(e.target.value, 10) })}
            className="mt-1.5 w-full rounded-[3px] border border-rule bg-paper-hi px-3 py-2 text-sm"
          >
            {WHITE_KEYS.map((m) => (
              <option key={m} value={m}>
                {noteName(m)}
                {m === 60 ? ' (middle C)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div>
          <span className="caption">White keys in view</span>
          <div className="mt-1.5 flex items-center gap-2">
            <button onClick={() => set({ num_white: Math.max(7, draft.num_white - 1) })} className="rounded-[3px] border border-rule p-2 hover:bg-paper-deep" aria-label="Fewer keys">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="tnum w-10 text-center font-display text-lg">{draft.num_white}</span>
            <button onClick={() => set({ num_white: Math.min(52, draft.num_white + 1) })} className="rounded-[3px] border border-rule p-2 hover:bg-paper-deep" aria-label="More keys">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <label className="block">
          <span className="caption">Black key length</span>
          <input
            type="range"
            min={0.4}
            max={0.8}
            step={0.01}
            value={draft.black_depth}
            onChange={(e) => set({ black_depth: parseFloat(e.target.value) })}
            className="mt-2 w-full accent-[#2f5fa8]"
          />
        </label>
        <label className="flex items-center justify-between text-sm">
          <span>
            Mirrored video
            <span className="block text-xs text-graphite-soft">Low notes on the right, as with a selfie camera</span>
          </span>
          <input type="checkbox" checked={draft.mirrored} onChange={(e) => set({ mirrored: e.target.checked })} className="h-4 w-4 accent-[#2f5fa8]" />
        </label>
      </div>

      <div className="flex gap-2">
        <button
          disabled={!dirty || busy}
          onClick={onApply}
          className="btn-primary flex-1 py-2.5 text-sm"
        >
          {busy ? 'Re-scoring…' : 'Apply and re-score'}
        </button>
        <button
          disabled={!dirty || busy}
          onClick={() => setDraft(original)}
          className="btn-ghost px-3"
          title="Revert" aria-label="Revert keyboard changes"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
      <p className="text-xs text-graphite-soft">Re-scoring reuses the hand tracking and audio, so it takes a second.</p>
    </div>
  );
}
