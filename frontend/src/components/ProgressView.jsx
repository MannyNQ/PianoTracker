import { Check } from 'lucide-react';

const STAGES = [
  ['sheet', 'Reading sheet music'],
  ['keyboard', 'Finding the keyboard'],
  ['tracking', 'Tracking hands'],
  ['audio', 'Transcribing audio'],
  ['scoring', 'Marking the performance'],
];

export default function ProgressView({ status, fileName, onCancel, withSheet }) {
  const stages = withSheet ? STAGES : STAGES.slice(1);
  const current = stages.findIndex(([k]) => k === status?.stage);
  const pct = Math.round(100 * (status?.progress || 0));
  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center px-4 py-16 sm:px-6">
      <p className="truncate text-sm text-graphite-soft">Analyzing {fileName}</p>
      <div className="mt-2 flex items-baseline justify-between gap-6">
        <h1 className="font-display text-4xl tracking-[-0.01em]">{status?.message || 'Uploading…'}</h1>
        <span className="tnum font-display text-6xl leading-none" aria-label={`${pct} percent`}>
          {pct}
          <span className="text-2xl text-graphite-faint">%</span>
        </span>
      </div>
      <div className="mt-6 h-[3px] bg-rule-soft">
        <div className="h-full bg-graphite transition-[width] duration-500" style={{ width: `${Math.max(1, pct)}%` }} />
      </div>

      <ol className="mt-10 border-t border-graphite">
        {stages.map(([key, label], i) => {
          const done = current > i || status?.stage === 'done';
          const active = current === i;
          return (
            <li key={key} className="flex items-center justify-between border-b border-rule py-3.5 text-[15px]">
              <span className={done || active ? 'text-graphite' : 'text-graphite-faint'}>
                {label}
                {active && <span className="text-graphite-soft">…</span>}
              </span>
              {done && <Check className="h-4 w-4 text-blue-pencil" strokeWidth={2.5} aria-label="done" />}
            </li>
          );
        })}
      </ol>
      <button onClick={onCancel} className="mt-8 self-start text-sm text-graphite-soft underline decoration-rule underline-offset-4 hover:text-graphite">
        Cancel analysis
      </button>
    </div>
  );
}
