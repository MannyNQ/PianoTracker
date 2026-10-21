import { useRef, useState } from 'react';
import { FileMusic, Film, X } from 'lucide-react';
import { SCORE_ACCEPT } from '../lib/formats';

function DropZone({ accept, file, onFile, icon: Icon, title, hint, optional }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          input.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
      className={`group flex cursor-pointer items-center gap-4 px-1 py-5 transition-colors ${
        over ? 'bg-paper-deep' : 'hover:bg-paper-deep/60'
      }`}
    >
      <input
        ref={input}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      <Icon className={`ml-3 h-5 w-5 shrink-0 ${file ? 'text-blue-pencil' : 'text-graphite-faint group-hover:text-graphite'}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 text-[17px] font-medium">
          {title}
          {optional && <span className="text-sm font-normal text-graphite-faint">optional</span>}
        </div>
        <div className={`truncate text-sm ${file ? 'text-blue-pencil' : 'text-graphite-soft'}`}>{file ? file.name : hint}</div>
      </div>
      {file ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFile(null);
          }}
          className="mr-2 rounded-sm p-1.5 text-graphite-soft hover:bg-paper hover:text-graphite"
          aria-label="Remove file"
        >
          <X className="h-4 w-4" />
        </button>
      ) : (
        <span className="mr-3 text-sm text-graphite-soft underline decoration-rule underline-offset-4 group-hover:text-graphite">
          Choose file
        </span>
      )}
    </div>
  );
}

const TIPS = [
  ['Camera', 'Above the keys, with the section you play in frame.'],
  ['Sound', 'Keep it on. Audio makes note detection exact.'],
  ['Light', 'Even light, with your wrists in view.'],
];

export default function UploadView({ health, onStart, error }) {
  const [video, setVideo] = useState(null);
  const [score, setScore] = useState(null);
  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center px-4 py-16 sm:px-6">
      <h1 className="font-display text-[clamp(2.5rem,6vw,3.5rem)] leading-[1.02] tracking-[-0.015em]">
        Analyze a performance
      </h1>
      <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-graphite-soft">
        Add a recording of your playing and, if you have it, the score you were reading from. You'll get a tracked,
        marked-up replay in a minute or two.
      </p>

      <div className="mt-10 divide-y divide-rule border-y border-graphite">
        <DropZone
          accept="video/*,.mov,.mp4,.m4v,.webm,.mkv"
          file={video}
          onFile={setVideo}
          icon={Film}
          title="Performance video"
          hint="MP4, MOV or WebM, with sound"
        />
        <DropZone
          accept={SCORE_ACCEPT}
          file={score}
          onFile={setScore}
          icon={FileMusic}
          title="Score"
          hint="PDF, photo, MIDI or MusicXML. Needed for grading."
          optional
        />
      </div>

      {error && (
        <p role="alert" className="mt-4 border-l-2 border-red-pencil pl-3 text-sm text-red-pencil">
          {error}
        </p>
      )}

      <div className="mt-6 flex items-center justify-between gap-4">
        <span className="text-sm text-graphite-soft">
          {!health?.ok ? 'Waiting for the engine to start…' : video ? 'Ready to analyze.' : 'Add a video to begin.'}
        </span>
        <button
          disabled={!video || !health?.ok}
          onClick={() => onStart(video, score)}
          className="btn-primary px-6 py-3 text-[15px]"
        >
          Analyze
        </button>
      </div>

      <dl className="mt-16 grid gap-6 sm:grid-cols-3">
        {TIPS.map(([k, v]) => (
          <div key={k}>
            <dt className="font-display text-lg italic">{k}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-graphite-soft">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
