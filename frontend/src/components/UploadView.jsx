import { useRef, useState } from 'react';
import { ArrowRight, FileMusic, Film, X } from 'lucide-react';
import { SCORE_ACCEPT } from '../lib/formats';

function DropZone({ accept, file, onFile, icon: Icon, title, hint, optional }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  return (
    <div
      onClick={() => input.current?.click()}
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
      className={`group flex cursor-pointer items-center gap-4 px-5 py-5 transition ${
        over ? 'bg-white/[0.05]' : 'hover:bg-white/[0.025]'
      }`}
    >
      <input
        ref={input}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border hairline ${
          file ? 'text-accent' : 'text-ink-300 group-hover:text-ivory'
        }`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[15px]">
          {title}
          {optional && <span className="label !text-[9.5px] !text-ink-400">Optional</span>}
        </div>
        <div className={`truncate text-sm ${file ? 'text-ivory/80' : 'text-ink-400'}`}>{file ? file.name : hint}</div>
      </div>
      {file ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onFile(null);
          }}
          className="rounded-md p-1.5 text-ink-400 hover:bg-white/5 hover:text-ivory"
          aria-label="Remove file"
        >
          <X className="h-4 w-4" />
        </button>
      ) : (
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-400 group-hover:text-ink-200">
          Browse
        </span>
      )}
    </div>
  );
}

const TIPS = [
  ['Camera', 'Above the keys, with the section you play in frame.'],
  ['Sound', 'Keep it on: audio makes note detection exact.'],
  ['Light', 'Even light; keep wrists visible.'],
];

export default function UploadView({ health, onStart, error }) {
  const [video, setVideo] = useState(null);
  const [score, setScore] = useState(null);
  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center px-6 py-16">
      <div className="rise mb-10">
        <div className="label mb-5">New session</div>
        <h1 className="text-[2.75rem] font-medium leading-[1.05] tracking-[-0.03em]">
          Analyze a performance.
        </h1>
        <p className="mt-4 max-w-lg text-ink-300">
          Add a recording of your playing and, optionally, the score you were reading from. You'll get a tracked,
          graded replay in a minute or two.
        </p>
      </div>

      <div className="panel rise divide-y divide-white/[0.08] overflow-hidden rounded-xl" style={{ animationDelay: '80ms' }}>
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
          title="Score sheet"
          hint="PDF, photo, MIDI or MusicXML: enables grading"
          optional
        />
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-bad/30 bg-bad/5 px-4 py-3 text-sm text-red-200">{error}</div>
      )}

      <div className="rise mt-5 flex items-center justify-between gap-4" style={{ animationDelay: '140ms' }}>
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-400">
          {!health?.ok ? 'Waiting for the engine…' : video ? 'Ready' : 'Add a video to begin'}
        </span>
        <button
          disabled={!video || !health?.ok}
          onClick={() => onStart(video, score)}
          className="btn-primary px-5 py-2.5 text-sm"
        >
          Analyze <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <ul className="rise mt-14 grid gap-6 border-t hairline pt-6 sm:grid-cols-3" style={{ animationDelay: '200ms' }}>
        {TIPS.map(([k, v]) => (
          <li key={k}>
            <div className="label mb-1.5">{k}</div>
            <p className="text-sm text-ink-300">{v}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
