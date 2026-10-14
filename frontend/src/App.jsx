import React, { useState, useRef, useEffect } from 'react';
import { Upload, Play, CheckCircle2, AlertTriangle, Activity, RefreshCw, Sliders } from 'lucide-react';

export default function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [videoSrc, setVideoSrc] = useState(null);

  // Calibration state
  const [x1Ratio, setX1Ratio] = useState(0.12);
  const [x2Ratio, setX2Ratio] = useState(0.98);
  const [y1Ratio, setY1Ratio] = useState(0.35);
  const [y2Ratio, setY2Ratio] = useState(0.70);
  const [numKeys, setNumKeys] = useState(28);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setVideoSrc(URL.createObjectURL(file));
      setResults(null);
    }
  };

  const handleStartAnalysis = async () => {
    if (!selectedFile) return;

    setIsAnalyzing(true);
    const formData = new FormData();
    formData.append("file", selectedFile);

    const url = `http://127.0.0.1:8000/api/analyze?x1_ratio=${x1Ratio}&x2_ratio=${x2Ratio}&y1_ratio=${y1Ratio}&y2_ratio=${y2Ratio}&num_keys=${numKeys}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      setResults(data);
    } catch (error) {
      console.error("Error connecting to Python backend:", error);
      alert("Failed to connect to the Python backend. Make sure FastAPI is running!");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Real-time Canvas Overlay Render Loop for Fingertip Tracking
  useEffect(() => {
    let animationFrameId;

    const renderOverlay = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas) {
        const ctx = canvas.getContext('2d');
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 360;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // 1. Draw Calibration Keyboard Boundary Box
        const x1 = canvas.width * x1Ratio;
        const x2 = canvas.width * x2Ratio;
        const y1 = canvas.height * y1Ratio;
        const y2 = canvas.height * y2Ratio;

        ctx.strokeStyle = '#10b981'; // Emerald Green
        ctx.lineWidth = 3;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

        // 2. Draw Fingertip Tracking Dots if analysis results exist
        if (results && results.tracked_frames) {
          const currentTime = video.currentTime;
          // Find the closest analyzed frame based on video timestamp
          const currentFrameData = results.tracked_frames.reduce((prev, curr) =>
            Math.abs(curr.time - currentTime) < Math.abs(prev.time - currentTime) ? curr : prev
          , results.tracked_frames[0]);

          if (currentFrameData && currentFrameData.fingertips) {
            currentFrameData.fingertips.forEach(tip => {
              const fx = tip.x * canvas.width;
              const fy = tip.y * canvas.height;

              ctx.fillStyle = '#3b82f6'; // Bright Blue fingertip dots
              ctx.beginPath();
              ctx.arc(fx, fy, 6, 0, 2 * Math.PI);
              ctx.fill();
              ctx.lineWidth = 2;
              ctx.strokeStyle = '#ffffff';
              ctx.stroke();
            });

            // Draw Posture Alert banner if wrist is dropping in this frame
            if (currentFrameData.wrist_drop) {
              ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
              ctx.fillRect(40, 30, 340, 40);
              ctx.fillStyle = '#ffffff';
              ctx.font = 'bold 16px sans-serif';
              ctx.fillText('⚠️ POSTURE ALERT: Wrist Dropping!', 55, 55);
            }
          }
        }
      }

      animationFrameId = requestAnimationFrame(renderOverlay);
    };

    renderOverlay();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [results, x1Ratio, x2Ratio, y1Ratio, y2Ratio]);

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100 font-sans">

      {/* SIDEBAR CONTROL PANEL */}
      <aside className="w-88 bg-neutral-900 border-r border-neutral-800 flex flex-col justify-between p-6 overflow-y-auto">
        <div>
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center font-bold text-xl shadow-lg shadow-indigo-500/30">
              🎹
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-wide">PianoTracker Pro</h1>
              <p className="text-xs text-neutral-400">AI Computer Vision Suite</p>
            </div>
          </div>

          <div className="space-y-5">
            {/* Upload Section */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                Performance Video
              </label>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-neutral-700 hover:border-indigo-500 rounded-xl p-5 cursor-pointer bg-neutral-950/50 transition duration-200 group">
                <Upload className="w-5 h-5 text-neutral-400 group-hover:text-indigo-400 mb-1.5 transition" />
                <span className="text-xs text-neutral-300 font-medium text-center truncate max-w-[200px]">
                  {selectedFile ? selectedFile.name : "Click to upload .mp4 / .mov"}
                </span>
                <input type="file" accept="video/*" onChange={handleFileChange} className="hidden" />
              </label>
            </div>

            {/* KEY ZONE FINE-TUNING PANEL */}
            <div className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center space-x-2 text-indigo-400 font-semibold text-xs uppercase tracking-wider">
                <Sliders className="w-3.5 h-3.5" />
                <span>Key Zone Calibration</span>
              </div>

              <div>
                <div className="flex justify-between text-xs text-neutral-400 mb-1">
                  <span>Key Count:</span>
                  <span className="text-white font-medium">{numKeys} Keys</span>
                </div>
                <input
                  type="range" min="14" max="52" value={numKeys}
                  onChange={(e) => setNumKeys(parseInt(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-neutral-400 mb-1">
                  <span>Left Edge (X1):</span>
                  <span className="text-white font-medium">{Math.round(x1Ratio * 100)}%</span>
                </div>
                <input
                  type="range" min="0.0" max="0.4" step="0.01" value={x1Ratio}
                  onChange={(e) => setX1Ratio(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-neutral-400 mb-1">
                  <span>Right Edge (X2):</span>
                  <span className="text-white font-medium">{Math.round(x2Ratio * 100)}%</span>
                </div>
                <input
                  type="range" min="0.6" max="1.0" step="0.01" value={x2Ratio}
                  onChange={(e) => setX2Ratio(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-neutral-400 mb-1">
                  <span>Top Edge (Y1):</span>
                  <span className="text-white font-medium">{Math.round(y1Ratio * 100)}%</span>
                </div>
                <input
                  type="range" min="0.1" max="0.6" step="0.01" value={y1Ratio}
                  onChange={(e) => setY1Ratio(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-neutral-400 mb-1">
                  <span>Bottom Edge (Y2):</span>
                  <span className="text-white font-medium">{Math.round(y2Ratio * 100)}%</span>
                </div>
                <input
                  type="range" min="0.4" max="0.9" step="0.01" value={y2Ratio}
                  onChange={(e) => setY2Ratio(parseFloat(e.target.value))}
                  className="w-full accent-indigo-500 cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-4">
          <button
            onClick={handleStartAnalysis}
            disabled={!selectedFile || isAnalyzing}
            className={`w-full py-3 rounded-xl font-semibold flex items-center justify-center space-x-2 transition shadow-lg ${
              !selectedFile || isAnalyzing
                ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30 cursor-pointer"
            }`}
          >
            {isAnalyzing ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Analyzing (Fast Mode)...</span>
              </>
            ) : (
              <>
                <Play className="w-5 h-5 fill-current" />
                <span>Run Analysis</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT DASHBOARD */}
      <main className="flex-1 flex flex-col p-8 overflow-y-auto">

        <header className="flex justify-between items-center mb-8">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Performance Analytics</h2>
            <p className="text-sm text-neutral-400">Real-time computer vision posture & note accuracy telemetry</p>
          </div>
          <div className="flex items-center space-x-2 bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-full text-xs font-medium text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Engine Ready</span>
          </div>
        </header>

        {/* Metrics Grid */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl">
            <div className="flex items-center justify-between text-neutral-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Notes Played</span>
              <Activity className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-3xl font-extrabold text-white">
              {results ? results.total_notes : "—"}
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl">
            <div className="flex items-center justify-between text-neutral-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Posture Alerts</span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-3xl font-extrabold text-amber-400">
              {results ? results.posture_alerts : "—"}
            </div>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl">
            <div className="flex items-center justify-between text-neutral-400 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider">Technique Score</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-3xl font-extrabold text-emerald-400">
              {results ? results.accuracy_score : "—"}
            </div>
          </div>
        </div>

        {/* Video Preview with Real-time Canvas Tracking Overlay */}
        <div className="flex-1 bg-neutral-900 border border-neutral-800 rounded-2xl flex flex-col items-center justify-center p-6 relative overflow-hidden min-h-[350px]">
          {videoSrc ? (
            <div className="w-full h-full flex flex-col items-center justify-center space-y-3">
              <div className="relative inline-block">
                <video
                  ref={videoRef}
                  src={videoSrc}
                  controls
                  className="max-h-[350px] w-auto rounded-xl shadow-lg border border-neutral-800 object-contain"
                />
                {/* HTML5 Canvas synced over video for smooth 60fps tracking dots & boxes */}
                <canvas
                  ref={canvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none rounded-xl object-contain"
                />
              </div>
              <p className="text-xs text-neutral-400">
                Playing: <span className="text-indigo-400 font-medium">{selectedFile?.name}</span> (⚡ Lightning Fast Analysis + Real-time Tracking Active)
              </p>
            </div>
          ) : (
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-neutral-800/50 rounded-full flex items-center justify-center mx-auto text-neutral-500">
                <Upload className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium text-neutral-400">No video selected yet</p>
              <p className="text-xs text-neutral-600">Upload a video file from the sidebar to begin session analysis</p>
            </div>
          )}
        </div>

      </main>
    </div>
  );
}