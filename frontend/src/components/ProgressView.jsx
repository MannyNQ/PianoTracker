import { Check, Loader2 } from 'lucide-react';

const STAGES = [
  ['keyboard', 'Detecting keyboard'],
  ['tracking', 'Tracking hands'],
  ['audio', 'Transcribing audio'],
  ['scoring', 'Scoring performance'],
];

export default function ProgressView({ status, fileName, onCancel }) {
  const current = STAGES.findIndex(([k]) => k === status?.stage);
  const pct = Math.round(100 * (status?.progress || 0));
  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-16">
      <div className="glass rise rounded-3xl p-8">
        <div className="label mb-2">Analyzing</div>
        <div className="mb-6 truncate font-display text-2xl">{fileName}</div>
        <div className="mb-2 flex items-end justify-between">
          <span className="text-sm text-ink-300">{status?.message || 'Uploading…'}</span>
          <span className="tnum font-mono text-sm text-gold">{pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-ink-700">
          <div
            className="h-full rounded-full bg-gradient-to-r from-gold to-gold-soft transition-[width] duration-500"
            style={{ width: `${Math.max(2, pct)}%` }}
          />
        </div>
        <ol className="mt-6 space-y-2.5">
          {STAGES.map(([key, label], i) => {
            const done = current > i || status?.stage === 'done';
            const active = current === i;
            return (
              <li key={key} className={`flex items-center gap-3 text-sm ${done || active ? 'text-ivory' : 'text-ink-400'}`}>
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full ring-1 ${
                    done ? 'bg-good/15 text-good ring-good/40' : active ? 'text-gold ring-gold/50' : 'ring-white/10'
                  }`}
                >
                  {done ? <Check className="h-3 w-3" /> : active ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                </span>
                {label}
              </li>
            );
          })}
        </ol>
        <button onClick={onCancel} className="mt-8 text-sm text-ink-400 hover:text-ivory">
          Cancel
        </button>
      </div>
    </div>
  );
}
