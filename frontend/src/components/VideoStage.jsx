import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { drawOverlay } from '../lib/overlay';
import { togglePlay } from '../lib/session';

/**
 * Video with a canvas overlay that redraws on every presented frame.
 * Children are rendered as absolutely-positioned HUD layers on top.
 */
export default function VideoStage({
  src,
  videoRef,
  session,
  cal,
  calibrating,
  onCalChange,
  showSkeleton,
  showKeys,
  onTick,
  onVideoError,
  children,
}) {
  const wrap = useRef(null);
  const canvas = useRef(null);
  const [aspect, setAspect] = useState(session ? session.video.width / session.video.height : 16 / 9);
  const [activeCorner, setActiveCorner] = useState(null);
  const drag = useRef(null);
  // Latest props for the render loop without restarting it.
  const live = useRef({});
  const dirty = useRef(true);
  useLayoutEffect(() => {
    live.current = { session, cal, calibrating, showSkeleton, showKeys, activeCorner, onTick };
    dirty.current = true;
  });

  // Keep the canvas backing store matched to its CSS size (crisp on retina).
  useEffect(() => {
    const ro = new ResizeObserver(() => {
      const c = canvas.current;
      const w = wrap.current;
      if (!c || !w) return;
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(w.clientWidth * dpr);
      c.height = Math.round(w.clientHeight * dpr);
      dirty.current = true;
    });
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let raf;
    let lastT = -1;
    let lastTick = 0;
    const loop = (now) => {
      const v = videoRef.current;
      const c = canvas.current;
      if (v && c) {
        const t = v.currentTime;
        if (t !== lastT || dirty.current) {
          const ctx = c.getContext('2d');
          const L = live.current;
          drawOverlay(ctx, c.width, c.height, {
            session: L.session,
            t,
            cal: L.cal,
            calibrating: L.calibrating,
            showSkeleton: L.showSkeleton,
            showKeys: L.showKeys,
            activeCorner: L.activeCorner,
          });
          lastT = t;
          dirty.current = false;
        }
        // React HUD updates at ~20 Hz; the canvas runs at display rate.
        if (now - lastTick > 50) {
          lastTick = now;
          live.current.onTick?.(t);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [videoRef]);

  // ---- calibration corner dragging
  const toNorm = (e) => {
    const r = wrap.current.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height];
  };
  const onPointerDown = (e) => {
    if (!calibrating || !cal) return;
    const [x, y] = toNorm(e);
    const r = wrap.current.getBoundingClientRect();
    let best = null;
    cal.quad.forEach(([qx, qy], i) => {
      const d = Math.hypot((qx - x) * r.width, (qy - y) * r.height);
      if (d < 28 && (!best || d < best.d)) best = { i, d };
    });
    if (best) {
      drag.current = best.i;
      setActiveCorner(best.i);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  };
  const onPointerMove = (e) => {
    if (drag.current == null) return;
    const [x, y] = toNorm(e);
    const quad = cal.quad.map((p, i) =>
      i === drag.current ? [Math.round(x * 10000) / 10000, Math.round(y * 10000) / 10000] : p,
    );
    onCalChange({ ...cal, quad });
  };
  const onPointerUp = () => {
    drag.current = null;
    setActiveCorner(null);
  };

  return (
    <div
      ref={wrap}
      className="relative mx-auto w-full overflow-hidden rounded-xl border hairline bg-black"
      style={{ aspectRatio: aspect, maxWidth: `calc(64vh * ${aspect})` }}
    >
      <video
        ref={videoRef}
        src={src}
        playsInline
        preload="auto"
        className="absolute inset-0 h-full w-full object-fill"
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (v.videoWidth && v.videoHeight) setAspect(v.videoWidth / v.videoHeight);
        }}
        onError={() => onVideoError?.()}
        onClick={() => {
          if (!calibrating) togglePlay(videoRef.current);
        }}
      />
      <canvas
        ref={canvas}
        className={`absolute inset-0 h-full w-full ${calibrating ? 'cursor-crosshair' : 'pointer-events-none'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      {children}
    </div>
  );
}
