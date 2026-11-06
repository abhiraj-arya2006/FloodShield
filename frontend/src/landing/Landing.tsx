import React, { useCallback, useEffect, useRef } from 'react';
import { drawFrame, seg, smooth, TIMELINE, type FrameState } from './scenes';
import './landing.css';

interface LandingProps {
  onEnter: () => void;
}

/** Visible window of one block of copy, as a function of scroll progress. */
function win(p: number, a: number, b: number, fade = 0.035) {
  const fin = a < 0 ? 1 : smooth(seg(p, a, a + fade));
  const fout = 1 - smooth(seg(p, b - fade, b));
  return fin * fout;
}

const COPY_WINDOWS: Array<[number, number]> = [
  [-1, 0.2],
  [0.28, 0.45],
  [0.53, 0.7],
  [0.76, 0.92],
];

const SCENES = [
  { label: 'Rain', at: 0 },
  { label: 'Rivers', at: 0.3 },
  { label: 'Network', at: 0.55 },
  { label: 'Forecast', at: 0.78 },
];

export const Landing: React.FC<LandingProps> = ({ onEnter }) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const copyRefs = useRef<Array<HTMLDivElement | null>>([]);
  const ctaRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const dotRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const entered = useRef(false);

  const enter = useCallback(() => {
    if (entered.current) return;
    entered.current = true;
    onEnter();
  }, [onEnter]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const c = canvas.getContext('2d')!;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = performance.now();
    const t0 = last;
    let target = 0;
    let eased = 0;
    const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const readScroll = () => {
      const track = trackRef.current;
      if (!track) return;
      const max = track.offsetHeight - window.innerHeight;
      target = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    };

    const onMove = (e: PointerEvent) => {
      pointer.tx = e.clientX / window.innerWidth;
      pointer.ty = e.clientY / window.innerHeight;
    };

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      eased += (target - eased) * (1 - Math.pow(0.0009, dt)); // critically-damped feel
      if (Math.abs(target - eased) < 0.0002) eased = target;
      pointer.x += (pointer.tx - pointer.x) * 0.06;
      pointer.y += (pointer.ty - pointer.y) * 0.06;

      const state: FrameState = {
        c,
        w,
        h,
        t: (now - t0) / 1000,
        dt,
        p: eased,
        mx: pointer.x,
        my: pointer.y,
        reduced,
      };
      drawFrame(state);

      COPY_WINDOWS.forEach(([a, b], i) => {
        const el = copyRefs.current[i];
        if (!el) return;
        const v = win(eased, a, b);
        el.style.opacity = String(v);
        el.style.transform = `translate3d(0, ${(1 - v) * 18}px, 0)`;
        el.style.visibility = v < 0.01 ? 'hidden' : 'visible';
      });
      if (ctaRef.current) {
        const v = smooth(seg(eased, 0.88, 0.93)) * (1 - smooth(seg(eased, 0.96, 0.995)));
        ctaRef.current.style.opacity = String(v);
        ctaRef.current.style.pointerEvents = v > 0.5 ? 'auto' : 'none';
        ctaRef.current.style.visibility = v < 0.01 ? 'hidden' : 'visible';
      }
      if (hintRef.current) hintRef.current.style.opacity = String(1 - smooth(seg(eased, 0.0, 0.04)));
      dotRefs.current.forEach((d, i) => {
        if (!d) return;
        const [a] = [SCENES[i].at];
        const next = SCENES[i + 1]?.at ?? 1;
        d.dataset.active = eased >= a - 0.02 && eased < next - 0.02 ? 'true' : 'false';
      });

      if (eased >= 0.996) enter();
      else raf = requestAnimationFrame(frame);
    };

    resize();
    readScroll();
    eased = target;
    window.addEventListener('resize', resize);
    window.addEventListener('scroll', readScroll, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', readScroll);
      window.removeEventListener('pointermove', onMove);
    };
  }, [enter]);

  const goTo = (at: number) => {
    const track = trackRef.current;
    if (!track) return;
    const max = track.offsetHeight - window.innerHeight;
    window.scrollTo({ top: max * at, behavior: 'smooth' });
  };

  const openDashboard = () => {
    const track = trackRef.current;
    if (!track) return enter();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return enter();
    const max = track.offsetHeight - window.innerHeight;
    window.scrollTo({ top: max, behavior: 'smooth' });
  };

  return (
    <div className="fs-landing">
      <div ref={trackRef} className="fs-track">
        <div className="fs-stage">
          <canvas ref={canvasRef} className="fs-canvas" aria-hidden="true" />

          <header className="fs-top">
            <div className="fs-brand">
              <svg width="22" height="26" viewBox="0 0 22 26" aria-hidden="true">
                <path d="M11 1C11 1 2 11 2 17a9 9 0 0 0 18 0C20 11 11 1 11 1Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M6.5 17.5c1.6-1.6 3.2-1.6 4.5 0s2.9 1.6 4.5 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <span>FloodShield</span>
            </div>
            <button type="button" className="fs-skip" onClick={enter}>
              Skip intro
            </button>
          </header>

          {/* Scene copy */}
          <div ref={(el) => { copyRefs.current[0] = el; }} className="fs-copy fs-copy--center fs-hero">
            <h1>
              <span>The rain falls first.</span>
            </h1>
            <p>
              Across the Godavari and Mahanadi basins, a monsoon storm can push a river over its banks days after the clouds
              have passed.
            </p>
          </div>

          <div ref={(el) => { copyRefs.current[1] = el; }} className="fs-copy fs-copy--left">
            <h2>Then the rivers carry it.</h2>
            <p>
              46 river gauges, linked from upstream to downstream, report how much water is moving through each reach.
            </p>
          </div>

          <div ref={(el) => { copyRefs.current[2] = el; }} className="fs-copy fs-copy--left">
            <h2>FloodShield reads the whole river at once.</h2>
            <p>
              STG-Mamba, a graph neural network, passes each gauge&rsquo;s reading downstream to forecast the next four days.
            </p>
          </div>

          <div ref={(el) => { copyRefs.current[3] = el; }} className="fs-copy fs-copy--top">
            <h2>Warning, three days before the water.</h2>
            <p>
              On held-back 2013&ndash;2018 data it caught 74% of flood days at 2 to 4 days ahead. 38% of its alerts were false
              alarms.
            </p>
            <small>Chart is an illustration, not live data.</small>
          </div>

          <div ref={ctaRef} className="fs-cta">
            <button type="button" onClick={openDashboard}>
              Open the dashboard
            </button>
          </div>

          <div ref={hintRef} className="fs-hint" aria-hidden="true">
            <span className="fs-hint-drop" />
            Scroll
          </div>

          <nav className="fs-dots" aria-label="Intro scenes">
            {SCENES.map((s, i) => (
              <button
                key={s.label}
                type="button"
                ref={(el) => { dotRefs.current[i] = el; }}
                onClick={() => goTo(s.at)}
                aria-label={s.label}
              >
                <span>{s.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>
      <span hidden>{TIMELINE.rise[0]}</span>
    </div>
  );
};

export default Landing;
