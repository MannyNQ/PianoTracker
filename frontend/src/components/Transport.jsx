import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Hand, Pause, Play, Square } from 'lucide-react';
import { fmtTime, STATUS_COLORS, togglePlay } from '../lib/session';

const SPEEDS = [0.25, 0.5, 0.75, 1];

function Toggle({ on, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-pressed={on}
      className={`flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-[13px] transition-colors ${
        on ? 'bg-paper-deep text-graphite' : 'text-graphite-faint hover:text-graphite'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export default function Transport({ videoRef, t, duration, session, showSkeleton, setShowSkeleton, showKeys, setShowKeys }) {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const fps = session?.video?.fps || 30;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const on = () => setPlaying(!v.paused);
    v.addEventListener('play', on);
    v.addEventListener('pause', on);
    return () => {
      v.removeEventListener('play', on);
      v.removeEventListener('pause', on);
    };
  }, [videoRef]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed, videoRef]);

  // Keyboard shortcuts: space = play/pause, ←/→ = frame step (shift: 1 s).
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest('input, select, textarea')) return;
      const v = videoRef.current;
      if (!v) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay(v);
      } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        e.preventDefault();
        v.pause();
        const step = e.shiftKey ? 1 : 1 / fps;
        v.currentTime = Math.max(0, v.currentTime + (e.code === 'ArrowLeft' ? -step : step));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [videoRef, fps]);

  const seek = (s) => {
    if (videoRef.current) videoRef.current.currentTime = s;
  };
  const step = (dir) => {
    const v = videoRef.current;
    if (!v) return;
    v.pause();
    v.currentTime = Math.max(0, v.currentTime + dir / fps);
  };
  const pct = duration ? (100 * t) / duration : 0;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-rule py-2">
      <button
        onClick={() => togglePlay(videoRef.current)}
        className="btn-primary h-9 w-9"
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 translate-x-px fill-current" />}
      </button>
      <button onClick={() => step(-1)} className="rounded-sm p-1.5 text-graphite-soft hover:bg-paper-deep hover:text-graphite" title="Previous frame (←)" aria-label="Previous frame">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button onClick={() => step(1)} className="rounded-sm p-1.5 text-graphite-soft hover:bg-paper-deep hover:text-graphite" title="Next frame (→)" aria-label="Next frame">
        <ChevronRight className="h-4 w-4" />
      </button>
      <span className="tnum w-24 text-[13px] text-graphite-soft">
        {fmtTime(t)} / {fmtTime(duration)}
      </span>

      <div className="relative min-w-40 flex-1 py-2">
        <div className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2 bg-rule" />
        <div className="absolute left-0 top-1/2 h-0.5 -translate-y-1/2 bg-graphite" style={{ width: `${pct}%` }} />
        {duration > 0 &&
          session?.posture_episodes.map((e, i) => (
            <div
              key={`p${i}`}
              className="absolute top-1/2 h-1 -translate-y-1/2 bg-red-pencil/45"
              style={{ left: `${(100 * e.start) / duration}%`, width: `${(100 * (e.end - e.start)) / duration}%` }}
            />
          ))}
        {duration > 0 &&
          session?.notes
            .filter((n) => n.status === 'wrong')
            .map((n, i) => (
              <div
                key={`w${i}`}
                className="absolute top-0 h-2 w-0.5"
                style={{ left: `${(100 * n.onset) / duration}%`, background: STATUS_COLORS.wrong }}
              />
            ))}
        <input
          type="range"
          className="scrub relative"
          min={0}
          max={duration || 0}
          step={0.001}
          value={Math.min(t, duration || 0)}
          onChange={(e) => seek(parseFloat(e.target.value))}
          aria-label="Seek"
        />
      </div>

      <div className="flex items-center" role="group" aria-label="Playback speed">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            aria-pressed={speed === s}
            className={`tnum rounded-sm px-2 py-1 text-[13px] ${speed === s ? 'bg-paper-deep font-medium text-graphite' : 'text-graphite-faint hover:text-graphite'}`}
          >
            {s}×
          </button>
        ))}
      </div>
      <Toggle on={showSkeleton} onClick={() => setShowSkeleton(!showSkeleton)} icon={Hand} label="Hands" />
      <Toggle on={showKeys} onClick={() => setShowKeys(!showKeys)} icon={Square} label="Keys" />
    </div>
  );
}
