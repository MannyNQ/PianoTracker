import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3, FileMusic, Keyboard, Plus } from 'lucide-react';
import { Wordmark } from './components/Landing';
import { createJob, getHealth, rescore, waitForJob } from './lib/api';
import { liveStats, prepare } from './lib/session';
import { isSheetImage } from './lib/formats';
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
    checking: ['bg-graphite-faint', 'Connecting to the engine…'],
    offline: ['bg-red-pencil', 'Engine offline. Start the backend.'],
    ready: ['bg-good', `Engine ready on ${health?.device?.toUpperCase()}`],
    partial: ['bg-amber', 'Engine ready, audio model still downloading'],
  }[state];
  return (
    <div className="flex items-center gap-2 text-[13px] text-graphite-soft" role="status">
      <span className={`h-2 w-2 shrink-0 rounded-full ${meta[0]}`} />
      {meta[1]}
    </div>
  );
}

const TABS = [
  ['summary', 'Summary', BarChart3],
  ['calibrate', 'Keyboard', Keyboard],
  ['score', 'Score', FileMusic],
];

// A session to reopen from the URL (#job=<id>), read when the studio opens.
const jobFromHash = () => new URLSearchParams(window.location.hash.slice(1)).get('job');

export default function Studio({ onHome }) {
  const [INITIAL_JOB] = useState(jobFromHash);
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
  const [withSheet, setWithSheet] = useState(false);
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
    setWithSheet(!!score && isSheetImage(score.name));
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
      window.history.replaceState(null, '', '#studio');
      setError(`Couldn't reopen that session: ${e.message}`);
      setPhase('upload');
    });
    return () => ctl.abort();
  }, [INITIAL_JOB]); // fixed for the life of the studio (state with no setter)

  const reset = () => {
    abort.current?.abort();
    window.history.replaceState(null, '', '#studio');
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
      <header className="flex items-center justify-between gap-4 border-b border-rule px-4 py-4 sm:px-6">
        <div className="flex items-center gap-4">
          <Wordmark
            size="text-xl"
            onClick={() => {
              abort.current?.abort();
              onHome();
            }}
          />
          <span className="hidden font-display text-lg italic text-graphite-soft sm:inline">Studio</span>
        </div>
        <div className="flex items-center gap-5">
          <EngineBadge health={health} />
          {phase === 'session' && (
            <button onClick={reset} className="btn-ghost shrink-0 px-3 py-1.5 text-[13px]">
              <Plus className="h-3.5 w-3.5" /> New session
            </button>
          )}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        {phase === 'upload' && <UploadView health={health} onStart={start} error={error} />}
        {phase === 'processing' && <ProgressView status={status} fileName={fileName} onCancel={reset} withSheet={withSheet || status?.stage === 'sheet'} />}
        {phase === 'session' && session && (
          <div className="grid gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_380px]">
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
                {!editingCal && stats && <LiveHud session={session} t={t} stats={stats} cal={calDraft} />}
                {videoError && (
                  <div className="absolute inset-0 flex items-center justify-center bg-plate/95 p-8 text-center text-sm leading-relaxed text-paper">
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

            <aside className="h-fit border-t border-graphite pt-1 lg:sticky lg:top-6 lg:border-l lg:border-t-0 lg:border-rule lg:pl-6 lg:pt-0">
              <nav className="mb-5 flex gap-5 border-b border-rule" role="tablist">
                {TABS.map(([key, label, Icon]) => (
                  <button
                    key={key}
                    onClick={() => setTab(key)}
                    role="tab"
                    aria-selected={tab === key}
                    className={`-mb-px flex items-center gap-1.5 border-b-2 py-2.5 text-sm font-medium transition-colors ${
                      tab === key ? 'border-graphite text-graphite' : 'border-transparent text-graphite-faint hover:text-graphite'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </nav>
              {error && (
                <p role="alert" className="mb-4 border-l-2 border-red-pencil pl-3 text-sm text-red-pencil">
                  {error}
                </p>
              )}
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
