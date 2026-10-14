import { Check } from 'lucide-react';

const STAGES = [
  ['sheet', 'Reading sheet music'],
  ['keyboard', 'Detecting keyboard'],
  ['tracking', 'Tracking hands'],
  ['audio', 'Transcribing audio'],
  ['scoring', 'Scoring performance'],
];

export default function ProgressView({ status, fileName, onCancel, withSheet }) {
  const stages = withSheet ? STAGES : STAGES.slice(1);
  const current = stages.findIndex(([k]) => k === status?.stage);
  const pct = Math.round(100 * (status?.progress || 0));
  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center px-6 py-16">
      <div className="rise">
        <div className="label mb-5">Analyzing</div>
        <div className="mb-10 flex items-end justify-between gap-6">
          <h1 className="min-w-0 truncate text-3xl font-medium tracking-[-0.02em]">{fileName}</h1>
          <span className="tnum font-mono text-5xl font-light leading-none tracking-tight">
            {pct}
            <span className="text-xl text-ink-400">%</span>
          </span>
        </div>
        <div className="h-px overflow-hidden bg-white/10">
          <div className="h-full bg-ivory transition-[width] duration-500" style={{ width: `${Math.max(1, pct)}%` }} />
        </div>
        <div className="mt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-400">
          {status?.message || 'Uploading…'}
        </div>

        <ol className="mt-10 divide-y divide-white/[0.06] border-y hairline">
          {stages.map(([key, label], i) => {
            const done = current > i || status?.stage === 'done';
            const active = current === i;
            return (
              <li key={key} className="flex items-center justify-between py-3 text-sm">
                <span className="flex items-center gap-4">
                  <span className="font-mono text-[11px] text-ink-400">{String(i + 1).padStart(2, '0')}</span>
                  <span className={done || active ? 'text-ivory' : 'text-ink-400'}>{label}</span>
                </span>
                {done ? (
                  <Check className="h-4 w-4 text-ink-300" />
                ) : active ? (
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
                ) : null}
              </li>
            );
          })}
        </ol>
        <button onClick={onCancel} className="mt-8 font-mono text-[11px] uppercase tracking-[0.12em] text-ink-400 hover:text-ivory">
          Cancel
        </button>
      </div>
    </div>
  );
}
