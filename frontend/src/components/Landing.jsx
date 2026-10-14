import { ArrowRight, AudioLines, FileMusic, Hand } from 'lucide-react';
import PianoKeysBackground from './PianoKeysBackground';

const STEPS = [
  {
    n: '01',
    icon: Hand,
    title: 'Track',
    text: 'Both hands followed frame by frame: every fingertip, every wrist, with posture flagged as you play.',
  },
  {
    n: '02',
    icon: AudioLines,
    title: 'Listen',
    text: 'The recording is transcribed note by note, and each note is matched to the finger that played it.',
  },
  {
    n: '03',
    icon: FileMusic,
    title: 'Grade',
    text: 'Compared with your score (PDF, MIDI or MusicXML): accuracy, timing, tempo and missed notes.',
  },
];

export function Wordmark({ onClick, size = 'text-2xl' }) {
  return (
    <button onClick={onClick} className="flex items-baseline gap-2" aria-label="PianoTracker Pro home">
      <span className={`font-display ${size} leading-none tracking-tight`}>PianoTracker</span>
      <span className="rounded-full border hairline px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-ink-300">
        Pro
      </span>
    </button>
  );
}

export default function Landing({ onEnter }) {
  return (
    <div className="h-full overflow-y-auto bg-black">
      <section className="relative flex min-h-full flex-col overflow-hidden">
        <PianoKeysBackground />

        <nav className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 md:px-10">
          <Wordmark />
          <div className="flex items-center gap-2">
            <a href="#how" className="btn-ghost px-3 py-1.5 text-sm">
              How it works
            </a>
            <button onClick={onEnter} className="btn-primary px-3 py-1.5 text-sm">
              Open studio
            </button>
          </div>
        </nav>

        <div className="relative z-10 mx-auto mt-auto grid w-full max-w-7xl gap-10 px-6 pb-14 md:grid-cols-[1.4fr_1fr] md:items-end md:px-10 md:pb-20">
          <div className="rise">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border hairline bg-black/50 px-3 py-1.5 text-xs text-ink-200 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Hand tracking · Note detection · Score grading
            </div>
            <h1 className="text-[clamp(2.75rem,6.4vw,5.5rem)] font-medium leading-[0.98] tracking-[-0.035em]">
              Hear every note.
              <br />
              <span className="text-ink-300">See every finger.</span>
            </h1>
          </div>
          <div className="rise md:pb-2" style={{ animationDelay: '120ms' }}>
            <p className="max-w-md text-[17px] leading-relaxed text-ink-300">
              Upload a video of yourself at the piano. PianoTracker follows both hands, hears what you play, and
              grades it against your sheet music in a live overlay.
            </p>
            <div className="mt-6 flex gap-3">
              <button onClick={onEnter} className="btn-primary px-4 py-2.5 text-sm">
                Open studio <ArrowRight className="h-4 w-4" />
              </button>
              <a href="#how" className="btn-ghost px-4 py-2.5 text-sm">
                See how it works
              </a>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-7xl px-6 py-24 md:px-10">
        <div className="label mb-10">How it works</div>
        <div className="grid gap-px overflow-hidden rounded-xl border hairline bg-white/[0.08] md:grid-cols-3">
          {STEPS.map(({ n, icon: Icon, title, text }) => (
            <div key={n} className="bg-black p-7">
              <div className="mb-10 flex items-center justify-between">
                <span className="font-mono text-xs text-ink-400">{n}</span>
                <Icon className="h-4 w-4 text-ink-300" />
              </div>
              <h3 className="mb-2 text-xl font-medium tracking-tight">{title}</h3>
              <p className="text-sm leading-relaxed text-ink-300">{text}</p>
            </div>
          ))}
        </div>
        <div className="mt-16 flex flex-col items-start justify-between gap-6 border-t hairline pt-8 md:flex-row md:items-center">
          <p className="font-display text-3xl italic text-ink-200">Practice with a second pair of eyes.</p>
          <button onClick={onEnter} className="btn-primary px-4 py-2.5 text-sm">
            Open studio <ArrowRight className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-16 flex justify-between font-mono text-[11px] uppercase tracking-[0.12em] text-ink-400">
          <span>Runs locally on your machine</span>
          <span>PianoTracker Pro</span>
        </div>
      </section>
    </div>
  );
}
