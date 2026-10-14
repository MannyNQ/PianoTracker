import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, FileMusic, Keyboard, Plus } from 'lucide-react';
import { createJob, getHealth, rescore, waitForJob } from './lib/api';
import { liveStats, prepare } from './lib/session';
import UploadView from './components/UploadView';
import ProgressView from './components/ProgressView';
import VideoStage from './components/VideoStage';
import LiveHud from './components/LiveHud';
import Transport from './components/Transport';
import PianoRoll from './components/PianoRoll';
import SummaryPanel from './components/SummaryPanel';
import CalibrationPanel from './components/CalibrationPanel';
import ScorePanel from './components/ScorePanel';

function EngineBadge({ health }) {
  const state = !health ? 'checking' : !health.ok ? 'offline' : health.transcription_ready ? 'ready' : 'partial';
  const meta = {
    checking: ['bg-ink-400', 'Connecting…'],
    offline: ['bg-bad', 'Engine offline'],
    ready: ['bg-good', `Engine ready · ${health?.device?.toUpperCase()}`],
    partial: ['bg-warn', 'Engine ready · audio model downloading'],
  }[state];
  return (
    <div className="flex items-center gap-2 rounded-full border hairline bg-ink-900/70 px-3 py-1.5 text-[11px] text-ink-300">
      <span className={`h-1.5 w-1.5 rounded-full ${meta[0]} ${state === 'ready' ? 'animate-pulse' : ''}`} />
      {meta[1]}
    </div>
  );
}

const TABS = [
  ['summary', 'Summary', BarChart3],
  ['calibrate', 'Keyboard', Keyboard],
  ['score', 'Score', FileMusic],
];

// A session to reopen from the URL (#job=<id>), read once at startup.
const INITIAL_JOB = new URLSearchParams(window.location.hash.slice(1)).get('job');

export default function App() {
  const [health, setHealth] = useState(null);
  const [phase, setPhase] = useState(INITIAL_JOB ? 'processing' : 'upload');
  const [error, setError] = useState(null);
  const [fileName, setFileName] = useState(INITIAL_JOB ? 'Previous session' : '');
  const [videoUrl, setVideoUrl] = useState(INITIAL_JOB ? `/api/jobs/${INITIAL_JOB}/video` : null);
  const [status, setStatus] = useState(null);
  const [jobId, setJobId] = useState(INITIAL_JOB);
  const [result, setResult] = useState(null);
  const [tab, setTab] = useState('summary');
  const [t, setT] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [showKeys, setShowKeys] = useState(true);
  const [calDraft, setCalDraft] = useState(null);
  const [editingCal, setEditingCal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const videoRef = useRef(null);
  const abort = useRef(null);

  // Engine status: poll until the audio model is ready.
  useEffect(() => {
    let stop = false;
    let timer;
    const check = async () => {
      try {
        const h = await getHealth();
        if (!stop) setHealth(h);
        if (!h.transcription_ready) timer = setTimeout(check, 5000);
      } catch {
        if (!stop) setHealth({ ok: false });
        timer = setTimeout(check, 3000);
      }
    };
    check();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, []);

  // Free the blob URL when the video changes.
  useEffect(() => () => videoUrl?.startsWith('blob:') && URL.revokeObjectURL(videoUrl), [videoUrl]);

  const session = useMemo(() => (result ? prepare(result) : null), [result]);
  const stats = useMemo(() => (session ? liveStats(session, t) : null), [session, t]);
  const calDirty = !!(calDraft && result && JSON.stringify(calDraft) !== JSON.stringify(result.calibration));

  // Follow a job to completion, then open the session. The job id lives in the
  // URL hash so a page reload reopens the same session.
  const follow = async (id, ctl) => {
    window.history.replaceState(null, '', `#job=${id}`);
    const res = await waitForJob(id, setStatus, ctl.signal);
    setResult(res);
    setCalDraft(res.calibration);
    setTab('summary');
    setPhase('session');
  };

  const start = async (video, score) => {
    setError(null);
    setFileName(video.name);
    setVideoUrl(URL.createObjectURL(video));
    setVideoError(false);
    setStatus(null);
    setPhase('processing');
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      const { id } = await createJob(video, score);
      setJobId(id);
      await follow(id, ctl);
    } catch (e) {
      if (e.name === 'AbortError') return;
      setError(e.message);
      setPhase('upload');
    }
  };

  // Reopen a session from the URL (#job=<id>) on load.
  useEffect(() => {
    if (!INITIAL_JOB) return;
    const ctl = new AbortController();
    abort.current = ctl;
    // oxlint-disable-next-line react/set-state-in-effect -- async: state is only set after the server responds
    follow(INITIAL_JOB, ctl).catch((e) => {
      if (e.name === 'AbortError') return;
      window.history.replaceState(null, '', window.location.pathname);
      setError(`Couldn't reopen that session: ${e.message}`);
      setPhase('upload');
    });
    return () => ctl.abort();
  }, []);

  const reset = () => {
    abort.current?.abort();
    window.history.replaceState(null, '', window.location.pathname);
    setPhase('upload');
    setResult(null);
    setJobId(null);
    setCalDraft(null);
    setEditingCal(false);
    setVideoUrl(null);
    setT(0);
  };

  const runRescore = async (opts) => {
    setBusy(true);
    setError(null);
    try {
      const res = await rescore(jobId, opts);
      setResult(res);
      setCalDraft(res.calibration);
      setEditingCal(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const seek = (s) => {
    if (videoRef.current) videoRef.current.currentTime = s;
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <button onClick={reset} className="flex items-center gap-3 text-left">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <div>
            <div className="font-display text-lg leading-none tracking-tight">PianoTracker Pro</div>
            <div className="mt-0.5 text-[11px] text-ink-400">Performance analysis</div>
          </div>
        </button>
        <div className="flex items-center gap-3">
          <EngineBadge health={health} />
          {phase === 'session' && (
            <button onClick={reset} className="flex items-center gap-1.5 rounded-full bg-ink-800 px-3 py-1.5 text-xs ring-1 ring-white/10 hover:bg-ink-700">
              <Plus className="h-3.5 w-3.5" /> New session
            </button>
          )}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {phase === 'upload' && <UploadView health={health} onStart={start} error={error} />}
        {phase === 'processing' && <ProgressView status={status} fileName={fileName} onCancel={reset} />}
        {phase === 'session' && session && (
          <div className="grid gap-5 px-6 pb-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <div className="min-w-0 space-y-3">
              <VideoStage
                src={videoUrl}
                videoRef={videoRef}
                session={session}
                cal={calDraft}
                calibrating={editingCal}
                onCalChange={setCalDraft}
                showSkeleton={showSkeleton}
                showKeys={showKeys}
                onTick={(time) => {
                  setT(time);
                  const d = videoRef.current?.duration;
                  if (d && isFinite(d) && d !== duration) setDuration(d);
                }}
                onVideoError={() => setVideoError(true)}
              >
                {!editingCal && stats && <LiveHud session={session} t={t} stats={stats} />}
                {videoError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-ink-950/90 p-8 text-center text-sm text-ink-200">
                    Your browser can't play this video format (often HEVC/H.265 from iPhones). Open the app in
                    Safari, or export the video as H.264 MP4. The analysis itself is complete.
                  </div>
                )}
              </VideoStage>
              <Transport
                videoRef={videoRef}
                t={t}
                duration={duration || session.summary.duration_s}
                session={session}
                showSkeleton={showSkeleton}
                setShowSkeleton={setShowSkeleton}
                showKeys={showKeys}
                setShowKeys={setShowKeys}
              />
              <PianoRoll session={session} t={t} onSeek={seek} />
            </div>

            <aside className="glass h-fit rounded-3xl p-5 lg:sticky lg:top-0">
              <nav className="mb-5 flex rounded-xl bg-ink-900/80 p-1">
                {TABS.map(([key, label, Icon]) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition ${
                      tab === key ? 'bg-ink-700 text-ivory shadow' : 'text-ink-400 hover:text-ivory'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </nav>
              {error && <div className="mb-4 rounded-xl border border-bad/30 bg-bad/10 p-3 text-xs text-red-200">{error}</div>}
              {tab === 'summary' && <SummaryPanel session={session} onSeek={seek} />}
              {tab === 'calibrate' && (
                <CalibrationPanel
                  draft={calDraft}
                  setDraft={setCalDraft}
                  original={result.calibration}
                  editing={editingCal}
                  setEditing={(on) => {
                    if (on) videoRef.current?.pause();
                    setEditingCal(on);
                  }}
                  onApply={() => runRescore({ calibration: calDraft })}
                  busy={busy}
                  dirty={calDirty}
                />
              )}
              {tab === 'score' && (
                <ScorePanel
                  session={session}
                  busy={busy}
                  onUpload={(f) => runRescore({ score: f })}
                  onClear={() => runRescore({ clearScore: true })}
                />
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
