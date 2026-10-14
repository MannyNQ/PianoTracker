import { Minus, Plus, RotateCcw } from 'lucide-react';
import { noteName, WHITE_KEYS } from '../lib/keyboard';

export default function CalibrationPanel({ draft, setDraft, original, editing, setEditing, onApply, busy, dirty }) {
  if (!draft) return null;
  const set = (patch) => setDraft({ ...draft, ...patch });
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-300">
        The keyboard was {original?.source === 'user' ? 'set by you' : 'detected automatically'}.
        {original?.notes?.length > 0 && <span className="block mt-1 text-xs text-ink-400">{original.notes.join(' · ')}</span>}
      </p>

      <button
        onClick={() => setEditing(!editing)}
        className={`w-full rounded-lg px-4 py-2.5 text-sm ring-1 transition ${
          editing ? 'bg-accent text-black ring-accent' : 'text-ivory ring-white/10 hover:bg-white/5'
        }`}
      >
        {editing ? 'Done adjusting' : 'Adjust keyboard on video'}
      </button>
      {editing && (
        <p className="text-xs text-ink-400">
          Drag the four orange corners onto the keyboard's corners: back edge (where black keys start) and front edge
          of the white keys. Key outlines update live.
        </p>
      )}

      <div className="space-y-3 rounded-lg border hairline p-3">
        <label className="block">
          <span className="label">Lowest visible white key</span>
          <select
            value={draft.first_white_midi}
            onChange={(e) => set({ first_white_midi: parseInt(e.target.value, 10) })}
            className="mt-1.5 w-full rounded-lg border hairline bg-ink-900 px-3 py-2 text-sm"
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
          <span className="label">White keys in view</span>
          <div className="mt-1.5 flex items-center gap-2">
            <button onClick={() => set({ num_white: Math.max(7, draft.num_white - 1) })} className="rounded-lg p-2 ring-1 ring-white/10 hover:bg-white/5" aria-label="Fewer keys">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="tnum w-10 text-center font-mono">{draft.num_white}</span>
            <button onClick={() => set({ num_white: Math.min(52, draft.num_white + 1) })} className="rounded-lg p-2 ring-1 ring-white/10 hover:bg-white/5" aria-label="More keys">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <label className="block">
          <span className="label">Black key length</span>
          <input
            type="range"
            min={0.4}
            max={0.8}
            step={0.01}
            value={draft.black_depth}
            onChange={(e) => set({ black_depth: parseFloat(e.target.value) })}
            className="mt-2 w-full accent-[#ff6a2c]"
          />
        </label>
        <label className="flex items-center justify-between text-sm">
          <span>
            Mirrored video
            <span className="block text-xs text-ink-400">low notes on the right (selfie camera)</span>
          </span>
          <input type="checkbox" checked={draft.mirrored} onChange={(e) => set({ mirrored: e.target.checked })} className="h-4 w-4 accent-[#ff6a2c]" />
        </label>
      </div>

      <div className="flex gap-2">
        <button
          disabled={!dirty || busy}
          onClick={onApply}
          className="btn-primary flex-1 py-2.5 text-sm"
        >
          {busy ? 'Re-scoring…' : 'Apply & re-score'}
        </button>
        <button
          disabled={!dirty || busy}
          onClick={() => setDraft(original)}
          className="btn-ghost px-3"
          title="Revert"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
      <p className="text-[11px] text-ink-400">Re-scoring reuses the hand tracking and audio, so it takes a second.</p>
    </div>
  );
}
