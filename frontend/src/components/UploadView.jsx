import { useRef, useState } from 'react';
import { FileMusic, Film, Sparkles, X } from 'lucide-react';
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
      className={`group relative cursor-pointer rounded-2xl border border-dashed p-6 transition ${
        over ? 'border-gold bg-gold/5' : file ? 'border-gold/40 bg-ink-850' : 'hairline bg-ink-900/60 hover:border-gold/50'
      }`}
    >
      <input
        ref={input}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
      />
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-ink-800 text-gold ring-1 ring-white/5">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{title}</span>
            {optional && <span className="label !text-[9.5px] !text-ink-400">optional</span>}
          </div>
          <div className="truncate text-sm text-ink-300">{file ? file.name : hint}</div>
        </div>
        {file && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFile(null);
            }}
            className="rounded-lg p-1.5 text-ink-400 hover:bg-white/5 hover:text-ivory"
            aria-label="Remove file"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function UploadView({ health, onStart, error }) {
  const [video, setVideo] = useState(null);
  const [score, setScore] = useState(null);
  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col justify-center px-6 py-16">
      <div className="rise mb-10 text-center">
        <div className="label mb-4 !text-gold">Performance analysis</div>
        <h1 className="font-display text-5xl leading-tight tracking-tight">
          See every note <span className="italic text-gold-soft">you play.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-lg text-ink-300">
          Upload a recording of your playing. We track both hands, hear each note, and grade it against your
          score: accuracy, timing, fingering and posture.
        </p>
      </div>

      <div className="glass rise space-y-3 rounded-3xl p-5" style={{ animationDelay: '80ms' }}>
        <DropZone
          accept="video/*,.mov,.mp4,.m4v,.webm,.mkv"
          file={video}
          onFile={setVideo}
          icon={Film}
          title="Performance video"
          hint="Overhead or high angle, keyboard in frame, with sound"
        />
        <DropZone
          accept={SCORE_ACCEPT}
          file={score}
          onFile={setScore}
          icon={FileMusic}
          title="Score sheet"
          hint="PDF, photo, MIDI or MusicXML: enables accuracy & timing grading"
          optional
        />
        {error && (
          <div className="rounded-xl border border-bad/30 bg-bad/10 px-4 py-3 text-sm text-red-200">{error}</div>
        )}
        <button
          disabled={!video || !health?.ok}
          onClick={() => onStart(video, score)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gold py-3.5 font-semibold text-ink-950 shadow-[0_10px_30px_-10px_rgba(232,180,90,0.6)] transition hover:bg-gold-soft disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-ink-400 disabled:shadow-none"
        >
          <Sparkles className="h-4 w-4" />
          Analyze performance
        </button>
      </div>

      <ul className="rise mt-8 grid grid-cols-3 gap-3 text-xs text-ink-300" style={{ animationDelay: '160ms' }}>
        <li className="rounded-xl border hairline p-3">
          <span className="text-ivory">Camera</span> above the keys; the whole keyboard section you play in view.
        </li>
        <li className="rounded-xl border hairline p-3">
          <span className="text-ivory">Sound on.</span> Audio is what makes note detection exact.
        </li>
        <li className="rounded-xl border hairline p-3">
          <span className="text-ivory">Good light,</span> hands visible; avoid sleeves covering wrists.
        </li>
      </ul>
    </div>
  );
}
