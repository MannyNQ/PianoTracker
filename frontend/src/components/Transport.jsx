import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Hand, Pause, Play, Square } from 'lucide-react';
import { fmtTime, STATUS_COLORS, togglePlay } from '../lib/session';

const SPEEDS = [0.25, 0.5, 0.75, 1];

function Toggle({ on, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition ${
        on ? 'bg-white/10 text-ivory' : 'text-ink-400 hover:bg-white/5 hover:text-ivory'
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
    <div className="panel flex items-center gap-3 rounded-xl px-3 py-2">
      <button
        onClick={() => togglePlay(videoRef.current)}
        className="btn-primary h-9 w-9"
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 translate-x-px fill-current" />}
      </button>
      <button onClick={() => step(-1)} className="rounded-lg p-1.5 text-ink-300 hover:bg-white/5" title="Previous frame (←)">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <button onClick={() => step(1)} className="rounded-lg p-1.5 text-ink-300 hover:bg-white/5" title="Next frame (→)">
        <ChevronRight className="h-4 w-4" />
      </button>
      <span className="tnum w-24 font-mono text-xs text-ink-300">
        {fmtTime(t)} / {fmtTime(duration)}
      </span>

      <div className="relative flex-1 py-2">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-ink-700" />
        <div className="absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-ivory/80" style={{ width: `${pct}%` }} />
        {duration > 0 &&
          session?.posture_episodes.map((e, i) => (
            <div
              key={`p${i}`}
              className="absolute top-1/2 h-1 -translate-y-1/2 bg-bad/80"
              style={{ left: `${(100 * e.start) / duration}%`, width: `${(100 * (e.end - e.start)) / duration}%` }}
            />
          ))}
        {duration > 0 &&
          session?.notes
            .filter((n) => n.status === 'wrong')
            .map((n, i) => (
              <div
                key={`w${i}`}
                className="absolute top-0 h-1.5 w-0.5 rounded-full"
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

      <div className="flex items-center rounded-lg bg-ink-800/80 p-0.5">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => setSpeed(s)}
            className={`tnum rounded-md px-2 py-1 font-mono text-[11px] ${speed === s ? 'bg-ink-600 text-ivory' : 'text-ink-400 hover:text-ivory'}`}
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
