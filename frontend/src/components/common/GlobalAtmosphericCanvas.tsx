import React, { useEffect, useRef } from 'react';

interface PulseRipple {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
  color: string;
}

interface Particle {
  x: number;
  y: number;
  history: { x: number; y: number }[];
  maxHistory: number;
  speed: number;
  color: string;
  size: number;
  lineIndex: number;
  t: number; // progress along streamline (0 to 1)
}

interface RiverBasinNode {
  name: string;
  xRatio: number;
  yRatio: number;
  risk: 'critical' | 'high' | 'moderate' | 'nominal';
  label: string;
}

export const GlobalAtmosphericCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({ x: -1000, y: -1000, active: false });
  const ripplesRef = useRef<PulseRipple[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.offsetHeight || 800);

    const handleResize = () => {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      width = canvas.parentElement?.offsetWidth || window.innerWidth;
      height = canvas.parentElement?.offsetHeight || 800;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // River basin key stations & atmospheric monsoon convergence points
    const basinNodes: RiverBasinNode[] = [
      { name: 'GODAVARI DELTA', xRatio: 0.65, yRatio: 0.62, risk: 'high', label: 'Dowleswaram Barrage • 16.94°N, 81.75°E' },
      { name: 'MAHANADI DELTA', xRatio: 0.76, yRatio: 0.44, risk: 'critical', label: 'Cuttack/Mundali • 20.46°N, 85.88°E' },
      { name: 'SRIRAM SAGAR', xRatio: 0.52, yRatio: 0.58, risk: 'moderate', label: 'Godavari Reservoir • 18.96°N, 78.33°E' },
      { name: 'HIRAKUD DAM', xRatio: 0.68, yRatio: 0.40, risk: 'high', label: 'Mahanadi Mainstem • 21.52°N, 83.87°E' },
      { name: 'WESTERN GHATS ORIGIN', xRatio: 0.40, yRatio: 0.64, risk: 'nominal', label: 'Trimbakeshwar Inflow' },
      { name: 'BAY OF BENGAL CORE', xRatio: 0.84, yRatio: 0.60, risk: 'critical', label: 'Monsoon Depression Core' },
      { name: 'ARABIAN SEA JET', xRatio: 0.28, yRatio: 0.74, risk: 'moderate', label: 'Low-Level Moisture Vector' },
    ];

    // Fluvial and atmospheric streamline splines
    const streamlines: { p0: [number, number]; p1: [number, number]; p2: [number, number]; p3: [number, number] }[] = [
      // Track 1: Arabian Sea moisture over Western Ghats into Godavari
      { p0: [0.25, 0.78], p1: [0.38, 0.68], p2: [0.48, 0.60], p3: [0.65, 0.62] },
      // Track 2: Bay of Bengal depression circulating into Mahanadi Basin
      { p0: [0.88, 0.68], p1: [0.82, 0.52], p2: [0.74, 0.45], p3: [0.68, 0.40] },
      // Track 3: Godavari fluvial corridor (Upstream to Bay of Bengal)
      { p0: [0.38, 0.62], p1: [0.50, 0.57], p2: [0.58, 0.60], p3: [0.72, 0.66] },
      // Track 4: Mahanadi fluvial corridor (Amarkantak to Bay of Bengal)
      { p0: [0.58, 0.36], p1: [0.66, 0.39], p2: [0.75, 0.44], p3: [0.84, 0.48] },
      // Track 5: Pranhita & Indravati southern tributaries confluence
      { p0: [0.52, 0.48], p1: [0.56, 0.54], p2: [0.60, 0.59], p3: [0.65, 0.62] },
    ];

    const getBezierPoint = (
      t: number,
      p0: [number, number],
      p1: [number, number],
      p2: [number, number],
      p3: [number, number]
    ): [number, number] => {
      const u = 1 - t;
      const tt = t * t;
      const uu = u * u;
      const uuu = uu * u;
      const ttt = tt * t;

      const x = uuu * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + ttt * p3[0];
      const y = uuu * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + ttt * p3[1];
      return [x, y];
    };

    // Initialize particles along streamlines
    const particleCount = 42;
    const particles: Particle[] = [];
    const colors = ['#5CB8C4', '#7CC4A4', '#38BDF8', '#818CF8'];

    for (let i = 0; i < particleCount; i++) {
      const lineIdx = i % streamlines.length;
      const tInit = Math.random();
      particles.push({
        x: 0,
        y: 0,
        history: [],
        maxHistory: 8 + Math.floor(Math.random() * 6),
        speed: 0.0018 + Math.random() * 0.0022,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 1.5 + Math.random() * 1.5,
        lineIndex: lineIdx,
        t: tInit,
      });
    }

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        active: true,
      };
    };

    const onMouseLeave = () => {
      mouseRef.current.active = false;
    };

    const onInteraction = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      ripplesRef.current.push({
        x: clickX,
        y: clickY,
        radius: 4,
        maxRadius: 180,
        opacity: 0.8,
        color: '#5CB8C4',
      });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseleave', onMouseLeave);
    window.addEventListener('click', onInteraction);

    let time = 0;

    const render = () => {
      time += 0.015;
      ctx.clearRect(0, 0, width, height);

      // 1. Draw subtle background coordinate grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.lineWidth = 1;
      const step = 60;
      for (let x = 0; x < width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // 2. Draw Streamlines (flow traces)
      streamlines.forEach((line, idx) => {
        ctx.beginPath();
        const p0: [number, number] = [line.p0[0] * width, line.p0[1] * height];
        const p1: [number, number] = [line.p1[0] * width, line.p1[1] * height];
        const p2: [number, number] = [line.p2[0] * width, line.p2[1] * height];
        const p3: [number, number] = [line.p3[0] * width, line.p3[1] * height];

        ctx.moveTo(p0[0], p0[1]);
        ctx.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);

        ctx.strokeStyle = idx % 2 === 0 ? 'rgba(92, 184, 196, 0.07)' : 'rgba(124, 196, 164, 0.05)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // 3. Update & Draw Flow Particles
      particles.forEach((pt) => {
        pt.t += pt.speed;
        if (pt.t > 1) {
          pt.t = 0;
          pt.history = [];
        }

        const line = streamlines[pt.lineIndex];
        const [nx, ny] = getBezierPoint(pt.t, line.p0, line.p1, line.p2, line.p3);
        pt.x = nx * width;
        pt.y = ny * height;

        pt.history.push({ x: pt.x, y: pt.y });
        if (pt.history.length > pt.maxHistory) {
          pt.history.shift();
        }

        // Draw particle tail
        if (pt.history.length > 1) {
          ctx.beginPath();
          ctx.moveTo(pt.history[0].x, pt.history[0].y);
          for (let h = 1; h < pt.history.length; h++) {
            ctx.lineTo(pt.history[h].x, pt.history[h].y);
          }
          ctx.strokeStyle = pt.color;
          ctx.globalAlpha = 0.25;
          ctx.lineWidth = pt.size * 0.8;
          ctx.stroke();
          ctx.globalAlpha = 1.0;
        }

        // Draw head
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fillStyle = pt.color;
        ctx.shadowColor = '#5CB8C4';
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0;
      });

      // 4. Draw Basin Hub Nodes (Pulsing telemetry points)
      basinNodes.forEach((node) => {
        const nx = node.xRatio * width;
        const ny = node.yRatio * height;

        const pulse = 1 + Math.sin(time * 2.5) * 0.25;
        const color =
          node.risk === 'critical'
            ? '#FF6A3D'
            : node.risk === 'high'
            ? '#E8B94A'
            : node.risk === 'moderate'
            ? '#5CB8C4'
            : '#7CC4A4';

        // Outer pulse ring
        ctx.beginPath();
        ctx.arc(nx, ny, 8 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.4 / pulse;
        ctx.stroke();
        ctx.globalAlpha = 1.0;

        // Core dot
        ctx.beginPath();
        ctx.arc(nx, ny, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // Label
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillStyle = '#8FA9AB';
        ctx.fillText(node.name, nx + 10, ny - 4);

        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.fillStyle = '#64748B';
        ctx.fillText(node.label, nx + 10, ny + 7);
      });

      // 5. Draw Interactive Click Shockwave Ripples
      for (let r = ripplesRef.current.length - 1; r >= 0; r--) {
        const rip = ripplesRef.current[r];
        rip.radius += 10;
        rip.opacity *= 0.94;

        ctx.beginPath();
        ctx.arc(rip.x, rip.y, rip.radius, 0, Math.PI * 2);
        ctx.strokeStyle = rip.color;
        ctx.lineWidth = Math.max(1, 2 * rip.opacity);
        ctx.globalAlpha = rip.opacity;
        ctx.shadowColor = rip.color;
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1.0;

        if (rip.opacity <= 0.02 || rip.radius >= rip.maxRadius) {
          ripplesRef.current.splice(r, 1);
        }
      }

      // 6. Ambient Cursor Glow
      if (mouseRef.current.active) {
        const rad = 120;
        const grad = ctx.createRadialGradient(
          mouseRef.current.x,
          mouseRef.current.y,
          0,
          mouseRef.current.x,
          mouseRef.current.y,
          rad
        );
        grad.addColorStop(0, 'rgba(92, 184, 196, 0.08)');
        grad.addColorStop(1, 'transparent');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(mouseRef.current.x, mouseRef.current.y, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseleave', onMouseLeave);
      window.removeEventListener('click', onInteraction);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none select-none z-0"
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
};

