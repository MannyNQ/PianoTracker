import Minuet from './Minuet';

const LISTENS_FOR = [
  {
    title: 'Your hands',
    text: 'Both hands are followed frame by frame, every fingertip and wrist. A sagging wrist or an angled hand is flagged at the moment it happens.',
  },
  {
    title: 'Your notes',
    text: 'The recording is transcribed note by note, and each note is matched to the finger that played it, so you can check your fingering too.',
  },
  {
    title: 'Your score',
    text: 'Add the piece as a PDF, a photo, MIDI or MusicXML. Wrong, missed and extra notes are marked, along with rushing, dragging and how steady your tempo was.',
  },
];

export function Wordmark({ onClick, size = 'text-2xl' }) {
  return (
    <button onClick={onClick} className="flex items-baseline gap-1.5 rounded-sm" aria-label="PianoTracker Pro home">
      <span className={`font-display ${size} font-medium leading-none tracking-tight`}>PianoTracker</span>
      <span className="font-display text-[0.95em] italic leading-none text-graphite-soft">Pro</span>
    </button>
  );
}

export default function Landing({ onEnter }) {
  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-6 sm:px-8">
        <Wordmark />
        <div className="flex items-center gap-5">
          <a href="#listens" className="hidden text-sm text-graphite-soft hover:text-graphite sm:inline">
            How it works
          </a>
          <button onClick={onEnter} className="btn-primary px-3.5 py-2 text-sm">
            Open studio
          </button>
        </div>
      </nav>

      <header className="mx-auto max-w-6xl px-4 pt-10 sm:px-8 md:pt-16">
        <h1 className="font-display text-[clamp(3rem,8.2vw,7.25rem)] font-normal leading-[1.02] tracking-[-0.02em]">
          Hear every note.
          <br />
          See every finger.
        </h1>

        <figure className="mt-12 md:mt-16">
          <Minuet className="-mx-4 px-4 sm:mx-0 sm:px-0" />
          <figcaption className="mt-3 font-display text-sm italic text-graphite-soft">
            Minuet in G, bars 1 to 4, as PianoTracker marks a practice take.
          </figcaption>
        </figure>

        <div className="mt-12 grid gap-8 border-t border-rule pt-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <p className="max-w-[46ch] text-lg leading-relaxed text-graphite-soft">
            Film yourself at the piano and upload the video. PianoTracker follows both hands, hears what you play and
            marks it against your sheet music, right on the replay.
          </p>
          <div className="flex flex-wrap gap-3">
            <button onClick={onEnter} className="btn-primary px-5 py-3 text-[15px]">
              Open studio
            </button>
            <a href="#listens" className="btn-ghost px-5 py-3 text-[15px]">
              See how it works
            </a>
          </div>
        </div>
      </header>

      <section id="listens" className="mx-auto max-w-6xl scroll-mt-6 px-4 pb-16 pt-28 sm:px-8">
        <h2 className="max-w-[18ch] font-display text-[clamp(2rem,4vw,3.25rem)] leading-[1.05] tracking-[-0.01em]">
          What it listens for while you play
        </h2>
        <dl className="mt-12 border-t border-graphite">
          {LISTENS_FOR.map(({ title, text }) => (
            <div key={title} className="grid gap-2 border-b border-rule py-7 md:grid-cols-[16rem_minmax(0,1fr)] md:gap-10">
              <dt className="font-display text-[1.75rem] italic leading-tight">{title}</dt>
              <dd className="max-w-[58ch] text-[17px] leading-relaxed text-graphite-soft">{text}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-24 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <p className="max-w-[26ch] font-display text-[clamp(1.75rem,3.2vw,2.5rem)] italic leading-tight">
            Practice with a second pair of ears.
          </p>
          <button onClick={onEnter} className="btn-primary px-5 py-3 text-[15px]">
            Open studio
          </button>
        </div>
        <p className="mt-20 border-t border-rule pt-5 text-sm text-graphite-faint">
          Runs locally on your machine. Your recordings never leave it.
        </p>
      </section>
    </div>
  );
}
