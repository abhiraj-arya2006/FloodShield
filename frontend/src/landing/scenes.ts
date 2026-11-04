import net from './network.json';

/* ------------------------------------------------------------------ */
/* Palette                                                             */
/* ------------------------------------------------------------------ */
export const INK = '#07141C';
const BASALT = '#10303A';
const MIST = '216,230,228';
const SILT = '210,168,103';
const AMBER = '255,122,61';
const WATER = '92,184,196';

/* ------------------------------------------------------------------ */
/* Math helpers                                                        */
/* ------------------------------------------------------------------ */
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
export const smooth = (x: number) => x * x * (3 - 2 * x);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/* ------------------------------------------------------------------ */
/* Scroll timeline (progress 0..1)                                     */
/* ------------------------------------------------------------------ */
export const TIMELINE = {
  rain: [0, 0.24],
  rivers: [0.24, 0.48],
  network: [0.48, 0.72],
  forecast: [0.72, 0.92],
  rise: [0.93, 1],
} as const;

export interface FrameState {
  c: CanvasRenderingContext2D;
  w: number;
  h: number;
  t: number; // seconds
  dt: number;
  p: number; // eased scroll progress
  mx: number; // 0..1 pointer
  my: number;
  reduced: boolean;
}

/* ------------------------------------------------------------------ */
/* Network (real gauges + links from configs/)                         */
/* ------------------------------------------------------------------ */
interface Node {
  id: string;
  b: 'g' | 'm';
  lat: number;
  lon: number;
  area: number;
  level: number; // 0 = headwater
  big: boolean;
  x: number;
  y: number;
}
interface Edge {
  a: Node;
  b: Node;
  bend: number;
  level: number;
}

const byId = new Map<string, Node>();
const nodes: Node[] = net.nodes.map((n) => {
  const node: Node = { id: n.id, b: n.b as 'g' | 'm', lat: n.lat, lon: n.lon, area: n.a, level: 0, big: false, x: 0, y: 0 };
  byId.set(n.id, node);
  return node;
});
const ups = new Map<string, string[]>();
net.edges.forEach(([s, t]) => {
  if (!ups.has(t)) ups.set(t, []);
  ups.get(t)!.push(s);
});
const memo = new Map<string, number>();
function levelOf(id: string): number {
  if (memo.has(id)) return memo.get(id)!;
  const u = ups.get(id) ?? [];
  const l = u.length ? 1 + Math.max(...u.map(levelOf)) : 0;
  memo.set(id, l);
  return l;
}
nodes.forEach((n) => (n.level = levelOf(n.id)));
const MAXLEVEL = Math.max(...nodes.map((n) => n.level));
[...nodes].sort((a, b) => b.area - a.area).slice(0, 7).forEach((n) => (n.big = true));
const edges: Edge[] = net.edges.map(([s, t], i) => {
  const a = byId.get(s)!;
  const b = byId.get(t)!;
  return { a, b, bend: (hash(i + 1) - 0.5) * 0.42, level: a.level };
});

const LON0 = Math.min(...nodes.map((n) => n.lon));
const LON1 = Math.max(...nodes.map((n) => n.lon));
const LAT0 = Math.min(...nodes.map((n) => n.lat));
const LAT1 = Math.max(...nodes.map((n) => n.lat));
const COS = Math.cos((((LAT0 + LAT1) / 2) * Math.PI) / 180);
const MAP_W = (LON1 - LON0) * COS;
const MAP_H = LAT1 - LAT0;

function layoutNetwork(w: number, h: number, zoom: number, shiftX = 0) {
  const mobile = w < 760;
  const boxW = mobile ? w * 0.86 : w * 0.4;
  const boxH = mobile ? h * 0.5 : h * 0.74;
  const s = Math.min(boxW / MAP_W, boxH / MAP_H) * zoom;
  const cx = (mobile ? w * 0.5 : w * 0.7) + shiftX;
  const cy = mobile ? h * 0.56 : h * 0.52;
  nodes.forEach((n) => {
    n.x = cx + ((n.lon - LON0) * COS - MAP_W / 2) * s;
    n.y = cy + (MAP_H / 2 - (n.lat - LAT0)) * s;
  });
  return s;
}

function edgePoint(e: Edge, u: number) {
  const mx = (e.a.x + e.b.x) / 2;
  const my = (e.a.y + e.b.y) / 2;
  const dx = e.b.x - e.a.x;
  const dy = e.b.y - e.a.y;
  const cx = mx - dy * e.bend;
  const cy = my + dx * e.bend;
  const k = 1 - u;
  return {
    x: k * k * e.a.x + 2 * k * u * cx + u * u * e.b.x,
    y: k * k * e.a.y + 2 * k * u * cy + u * u * e.b.y,
  };
}

function strokeEdge(c: CanvasRenderingContext2D, e: Edge, from: number, to: number) {
  if (to <= from) return;
  const steps = Math.max(4, Math.ceil((to - from) * 18));
  c.beginPath();
  for (let i = 0; i <= steps; i++) {
    const pt = edgePoint(e, lerp(from, to, i / steps));
    if (i === 0) c.moveTo(pt.x, pt.y);
    else c.lineTo(pt.x, pt.y);
  }
  c.stroke();
}

/* ------------------------------------------------------------------ */
/* Scene 1: monsoon rain over the Ghats                                */
/* ------------------------------------------------------------------ */
interface Drop {
  x: number;
  y: number;
  z: number;
}
let drops: Drop[] = [];
let dropsFor = '';

function ensureDrops(w: number, h: number) {
  const key = `${w}x${h}`;
  if (key === dropsFor) return;
  dropsFor = key;
  const n = Math.min(760, Math.floor((w * h) / 2600));
  drops = Array.from({ length: n }, () => ({ x: Math.random() * w * 1.4 - w * 0.2, y: Math.random() * h, z: 0.25 + Math.random() * 0.75 }));
}

function ridge(c: CanvasRenderingContext2D, w: number, h: number, base: number, amp: number, seed: number, color: string, drift: number) {
  c.beginPath();
  c.moveTo(0, h);
  for (let x = 0; x <= w; x += 10) {
    const u = x / w;
    const y =
      base -
      amp *
        (0.55 * Math.sin(u * 5.1 + seed + drift) +
          0.3 * Math.sin(u * 11.7 + seed * 2.3) +
          0.15 * Math.sin(u * 27.3 + seed * 4.1)) -
      amp * 0.8 * Math.exp(-Math.pow((u - 0.28 - seed * 0.05) / 0.16, 2));
    c.lineTo(x, y);
  }
  c.lineTo(w, h);
  c.closePath();
  c.fillStyle = color;
  c.fill();
}

function stepDrops(f: FrameState) {
  const { w, h, dt, mx, reduced } = f;
  ensureDrops(w, h);
  const wind = 0.22 + (mx - 0.5) * 0.55;
  const fall = reduced ? 0.25 : 1;
  for (const d of drops) {
    d.y += (620 + 980 * d.z) * dt * fall;
    d.x += wind * (620 + 980 * d.z) * dt * 0.35 * fall;
    if (d.y > h + 40) {
      d.y = -40 - Math.random() * 80;
      d.x = Math.random() * w * 1.4 - w * 0.2;
    }
    if (d.x > w * 1.2) d.x -= w * 1.4;
  }
}

function drawRain(f: FrameState, alpha: number, rainOnly: boolean) {
  const { c, w, h, t, p, mx, reduced } = f;
  if (alpha <= 0.001) return;
  c.save();
  c.globalAlpha = alpha;

  if (!rainOnly) {
    // sky
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#04090D');
    sky.addColorStop(0.55, '#0B1E26');
    sky.addColorStop(1, '#182A2B');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);

    // low sun bleeding through the storm
    const glow = c.createRadialGradient(w * 0.74, h * 0.7, 0, w * 0.74, h * 0.7, w * 0.55);
    glow.addColorStop(0, `rgba(${SILT},0.30)`);
    glow.addColorStop(0.5, `rgba(${SILT},0.07)`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, w, h);

    // one lightning flash early, then occasionally
    let flash = 0;
    if (!reduced) {
      const ph = (t - 2.6) % 13;
      if (t > 2.6 && ph < 0.55) flash = Math.max(0, 1 - ph / 0.55) * (ph < 0.12 ? ph / 0.12 : 1) * (0.55 + 0.45 * Math.sin(ph * 60));
    }

    // cloud banks
    for (let i = 0; i < 9; i++) {
      const sp = 6 + hash(i) * 10;
      const cx = ((hash(i + 9) * 1.6 - 0.3) * w + (reduced ? 0 : t * sp)) % (w * 1.6) - w * 0.3;
      const cy = h * (0.05 + hash(i + 3) * 0.3);
      const r = w * (0.22 + hash(i + 5) * 0.25);
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(${MIST},${0.11 + flash * 0.5})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    if (flash > 0.01) {
      c.fillStyle = `rgba(190,215,225,${flash * 0.24})`;
      c.fillRect(0, 0, w, h);
    }

    // hills sink away as the camera follows the water down
    const lift = smooth(seg(p, 0.05, 0.24)) * h * 0.75;
    const dr = reduced ? 0 : t * 0.03;
    c.save();
    c.translate(0, lift);
    ridge(c, w, h, h * 0.74, h * 0.07, 1.2, '#10282C', dr);
    ridge(c, w, h, h * 0.8, h * 0.06, 2.9, '#0B1D21', dr * 0.6);
    ridge(c, w, h, h * 0.88, h * 0.045, 4.4, '#071418', 0);
    const mist = c.createLinearGradient(0, h * 0.7, 0, h * 0.92);
    mist.addColorStop(0, 'rgba(120,150,150,0)');
    mist.addColorStop(1, 'rgba(120,150,150,0.12)');
    c.fillStyle = mist;
    c.fillRect(0, h * 0.7, w, h * 0.3);
    c.restore();
  }

  // drops: three depth buckets keep stroke changes cheap
  const wind = 0.22 + (mx - 0.5) * 0.55;
  const buckets: Drop[][] = [[], [], []];
  for (const d of drops) buckets[d.z < 0.5 ? 0 : d.z < 0.78 ? 1 : 2].push(d);
  c.lineCap = 'round';
  buckets.forEach((b, i) => {
    c.beginPath();
    c.strokeStyle = `rgba(${MIST},${[0.1, 0.2, 0.36][i]})`;
    c.lineWidth = [0.6, 0.9, 1.3][i];
    for (const d of b) {
      const len = 10 + d.z * 26;
      c.moveTo(d.x, d.y);
      c.lineTo(d.x - wind * len * 0.8, d.y - len);
    }
    c.stroke();
  });
  c.restore();
}

/* ------------------------------------------------------------------ */
/* Deep background for scenes 2-4                                      */
/* ------------------------------------------------------------------ */
function drawDeep(f: FrameState, alpha: number) {
  if (alpha <= 0.001) return;
  const { c, w, h } = f;
  c.save();
  c.globalAlpha = alpha;
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0B2029');
  g.addColorStop(1, INK);
  c.fillStyle = g;
  c.fillRect(0, 0, w, h);
  const v = c.createRadialGradient(w * 0.62, h * 0.5, 0, w * 0.62, h * 0.5, w * 0.7);
  v.addColorStop(0, 'rgba(92,184,196,0.07)');
  v.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = v;
  c.fillRect(0, 0, w, h);
  c.restore();
}

/* ------------------------------------------------------------------ */
/* Scene 2: rains gather into rivers (real gauge network)              */
/* ------------------------------------------------------------------ */
function drawRivers(f: FrameState, alpha: number) {
  if (alpha <= 0.001) return;
  const { c, p, t, w, h, reduced } = f;
  const q = smooth(seg(p, 0.25, 0.44));
  layoutNetwork(w, h, 1);
  c.save();
  c.globalAlpha = alpha;
  c.lineCap = 'round';
  c.lineJoin = 'round';

  edges.forEach((e) => {
    const r = clamp(q * (MAXLEVEL + 2) - e.level, 0, 1);
    if (r <= 0) return;
    c.strokeStyle = `rgba(${WATER},0.22)`;
    c.lineWidth = 3.2;
    strokeEdge(c, e, 0, r);
    c.strokeStyle = `rgba(${WATER},0.8)`;
    c.lineWidth = 1.1;
    strokeEdge(c, e, 0, r);
    // droplets carried downstream
    if (r >= 1) {
      for (let k = 0; k < 3; k++) {
        const u = reduced ? 0.5 : (t * 0.22 + k / 3 + hash(e.level * 7 + k)) % 1;
        const pt = edgePoint(e, u);
        c.fillStyle = `rgba(${MIST},0.9)`;
        c.beginPath();
        c.arc(pt.x, pt.y, 1.6, 0, 7);
        c.fill();
      }
    }
  });

  nodes.forEach((n) => {
    const appear = clamp(q * (MAXLEVEL + 2) - n.level + 0.4, 0, 1);
    if (appear <= 0) return;
    const rad = (n.big ? 4.6 : 3) * smooth(appear);
    c.fillStyle = n.b === 'g' ? `rgba(${SILT},1)` : `rgba(${MIST},1)`;
    c.beginPath();
    c.arc(n.x, n.y, rad, 0, 7);
    c.fill();
  });
  c.restore();
}

/* ------------------------------------------------------------------ */
/* Scene 3: the flood wave moves downstream, node by node              */
/* ------------------------------------------------------------------ */
function drawNetwork(f: FrameState, alpha: number) {
  if (alpha <= 0.001) return;
  const { c, p, t, w, h, reduced } = f;
  const zoom = 1 + 0.07 * seg(p, 0.48, 0.72);
  layoutNetwork(w, h, zoom, -seg(p, 0.48, 0.72) * w * 0.02);
  const wave = smooth(seg(p, 0.5, 0.7)) * (MAXLEVEL + 2.5);

  c.save();
  c.globalAlpha = alpha;
  c.lineCap = 'round';

  edges.forEach((e) => {
    const passed = clamp(wave - e.level, 0, 1);
    c.strokeStyle = `rgba(${WATER},0.3)`;
    c.lineWidth = 1;
    strokeEdge(c, e, 0, 1);
    if (passed > 0) {
      const hot = e.b.big || e.b.level >= MAXLEVEL - 1;
      c.strokeStyle = hot ? `rgba(${AMBER},${0.35 + 0.5 * passed})` : `rgba(${MIST},${0.4 * passed})`;
      c.lineWidth = hot ? 2.4 : 1.6;
      strokeEdge(c, e, 0, passed);
    }
  });

  c.globalCompositeOperation = 'lighter';
  nodes.forEach((n) => {
    const x = wave - n.level;
    const pulse = Math.exp(-Math.pow((x - 0.5) / 0.9, 2)); // bump as the wave passes
    const stay = smooth(clamp((x - 0.2) / 1.4)); // load that remains afterwards
    const hot = n.big || n.level >= MAXLEVEL - 1;
    const hotness = hot ? stay : 0;
    const base = n.b === 'g' ? SILT : MIST;
    const col = hotness > 0.3 ? AMBER : base;
    const r0 = n.big ? 4.6 : 3;
    // halo
    const hr = r0 * (3 + pulse * 5 + hotness * 5);
    const g = c.createRadialGradient(n.x, n.y, 0, n.x, n.y, hr);
    g.addColorStop(0, `rgba(${col},${0.22 + pulse * 0.5 + hotness * 0.3})`);
    g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g;
    c.fillRect(n.x - hr, n.y - hr, hr * 2, hr * 2);
    c.fillStyle = `rgba(${col},0.95)`;
    c.beginPath();
    c.arc(n.x, n.y, r0 + pulse * 1.6, 0, 7);
    c.fill();
    // rings on the gauges that will cross the flood line
    if (hotness > 0.5 && !reduced) {
      const ph = ((t * 0.5 + hash(n.level + n.area)) % 1);
      c.strokeStyle = `rgba(${AMBER},${(1 - ph) * 0.6})`;
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(n.x, n.y, r0 + ph * 22, 0, 7);
      c.stroke();
    }
  });
  c.restore();
}

/* ------------------------------------------------------------------ */
/* Scene 4: the forecast crosses the flood line before the river does   */
/* ------------------------------------------------------------------ */
const Q95 = 1.0;
function flow(x: number) {
  // illustrative hydrograph, x in days relative to today
  const peak = 1.28 * Math.exp(-Math.pow((x - 4.5) / 1.95, 2));
  const early = 0.22 + 0.04 * Math.sin(x * 0.9) + 0.03 * Math.sin(x * 2.3 + 1);
  return early + peak;
}
const X0 = -8;
const X1 = 7;
const FORECAST_END = 4;

function drawForecast(f: FrameState, alpha: number) {
  if (alpha <= 0.001) return;
  const { c, p, t, w, h, reduced } = f;
  const mobile = w < 760;
  const L = w * (mobile ? 0.07 : 0.09);
  const R = w * (mobile ? 0.9 : 0.87);
  const T = h * (mobile ? 0.5 : 0.4);
  const B = h * (mobile ? 0.8 : 0.75);
  const X = (x: number) => L + ((x - X0) / (X1 - X0)) * (R - L);
  const Y = (v: number) => B - (v / 1.6) * (B - T);
  const q = smooth(seg(p, 0.74, 0.9));
  const head = lerp(X0, FORECAST_END, q);
  const crossX = 3.05;

  c.save();
  c.globalAlpha = alpha;
  c.lineCap = 'round';
  c.lineJoin = 'round';

  // baseline
  c.strokeStyle = `rgba(${MIST},0.16)`;
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(L, B);
  c.lineTo(R, B);
  c.stroke();

  // flood line
  c.setLineDash([6, 7]);
  c.strokeStyle = `rgba(${AMBER},0.7)`;
  c.beginPath();
  c.moveTo(L, Y(Q95));
  c.lineTo(R, Y(Q95));
  c.stroke();
  c.setLineDash([]);
  c.fillStyle = `rgba(${AMBER},0.95)`;
  c.font = `500 ${mobile ? 11 : 13}px "Bricolage Grotesque Variable", system-ui, sans-serif`;
  c.textAlign = 'left';
  c.fillText('Flood line (q95)', L, Y(Q95) - 9);

  // today marker
  c.strokeStyle = `rgba(${MIST},0.25)`;
  c.beginPath();
  c.moveTo(X(0), T - 14);
  c.lineTo(X(0), B);
  c.stroke();
  c.fillStyle = `rgba(${MIST},0.75)`;
  c.textAlign = 'center';
  c.fillText('Today', X(0), T - 22);
  c.fillStyle = `rgba(${MIST},0.45)`;
  c.fillText('Forecast ends', X(FORECAST_END), T - 22);
  c.strokeStyle = `rgba(${MIST},0.12)`;
  c.beginPath();
  c.moveTo(X(FORECAST_END), T - 14);
  c.lineTo(X(FORECAST_END), B);
  c.stroke();

  const path = (x0: number, x1: number) => {
    c.beginPath();
    for (let x = x0; x <= x1 + 0.001; x += 0.08) {
      const px = X(x);
      const py = Y(flow(x));
      if (x === x0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
  };

  // what the river will really do (dim, drawn after head passes)
  if (q > 0.98) {
    c.setLineDash([2, 6]);
    c.strokeStyle = `rgba(${SILT},0.45)`;
    c.lineWidth = 1.4;
    path(FORECAST_END, X1);
    c.stroke();
    c.setLineDash([]);
  }

  // uncertainty band on the forecast side
  if (head > 0) {
    c.beginPath();
    const xs: number[] = [];
    for (let x = 0; x <= head + 0.001; x += 0.08) xs.push(x);
    xs.forEach((x, i) => {
      const spread = 0.02 + 0.045 * x;
      const px = X(x);
      const py = Y(flow(x) + spread);
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    });
    [...xs].reverse().forEach((x) => {
      const spread = 0.02 + 0.045 * x;
      c.lineTo(X(x), Y(flow(x) - spread));
    });
    c.closePath();
    c.fillStyle = `rgba(${WATER},0.16)`;
    c.fill();
  }

  // observed (past)
  c.strokeStyle = `rgba(${SILT},1)`;
  c.lineWidth = 2.4;
  path(X0, Math.min(head, 0));
  c.stroke();
  // forecast
  if (head > 0) {
    c.strokeStyle = `rgba(${WATER},1)`;
    c.lineWidth = 2.8;
    path(0, head);
    c.stroke();
  }

  // head dot
  const hx = X(head);
  const hy = Y(flow(head));
  const g = c.createRadialGradient(hx, hy, 0, hx, hy, 18);
  g.addColorStop(0, `rgba(${MIST},0.8)`);
  g.addColorStop(1, `rgba(${MIST},0)`);
  c.fillStyle = g;
  c.fillRect(hx - 18, hy - 18, 36, 36);
  c.fillStyle = '#fff';
  c.beginPath();
  c.arc(hx, hy, 3.4, 0, 7);
  c.fill();

  // crossing + alert
  if (head >= crossX) {
    const a = smooth(clamp((head - crossX) / 0.5));
    const cx = X(crossX);
    const cy = Y(Q95);
    const ph = reduced ? 0.3 : (t * 0.8) % 1;
    c.strokeStyle = `rgba(${AMBER},${(1 - ph) * 0.7 * a})`;
    c.lineWidth = 1.6;
    c.beginPath();
    c.arc(cx, cy, 8 + ph * 28, 0, 7);
    c.stroke();
    c.fillStyle = `rgba(${AMBER},${a})`;
    c.beginPath();
    c.arc(cx, cy, 6, 0, 7);
    c.fill();
    // callout
    c.globalAlpha = alpha * a;
    c.strokeStyle = `rgba(${AMBER},0.8)`;
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(cx, cy - 10);
    c.lineTo(cx, cy - (mobile ? 46 : 64));
    c.stroke();
    c.fillStyle = `rgba(${MIST},1)`;
    c.font = `500 ${mobile ? 13 : 17}px "Bricolage Grotesque Variable", system-ui, sans-serif`;
    c.textAlign = 'center';
    c.fillText('Alert goes out today', cx, cy - (mobile ? 54 : 74));
    c.fillStyle = `rgba(${MIST},0.6)`;
    c.font = `400 ${mobile ? 11 : 13}px "Bricolage Grotesque Variable", system-ui, sans-serif`;
    c.fillText('about 3 days before the water crosses the line', cx, cy - (mobile ? 38 : 54));
  }
  c.restore();
}

/* ------------------------------------------------------------------ */
/* Final: the water rises and becomes the dashboard                    */
/* ------------------------------------------------------------------ */
function drawRise(f: FrameState) {
  const { c, w, h, t, p, reduced } = f;
  const r = seg(p, TIMELINE.rise[0], TIMELINE.rise[1]);
  if (r <= 0) return;
  const e = smooth(r);
  const level = h * (1 - e) - 40 * (1 - e);
  const amp = 26 * Math.sin(Math.PI * clamp(r * 1.05)) + 2;
  c.save();
  const g = c.createLinearGradient(0, level - 20, 0, h);
  g.addColorStop(0, '#2C6B76');
  g.addColorStop(0.12, BASALT);
  g.addColorStop(0.6, '#0A1E26');
  g.addColorStop(1, INK);
  c.fillStyle = g;
  c.beginPath();
  c.moveTo(0, h + 2);
  for (let x = 0; x <= w + 8; x += 8) {
    const y = level + Math.sin(x * 0.012 + (reduced ? 0 : t * 1.6)) * amp + Math.sin(x * 0.031 - (reduced ? 0 : t * 1.1)) * amp * 0.45;
    c.lineTo(x, y);
  }
  c.lineTo(w, h + 2);
  c.closePath();
  c.fill();
  if (r >= 0.985) {
    c.fillStyle = INK;
    c.fillRect(0, 0, w, h);
  }
  c.restore();
}

/* ------------------------------------------------------------------ */
/* Frame                                                               */
/* ------------------------------------------------------------------ */
export function drawFrame(f: FrameState) {
  const { c, w, h, p } = f;
  c.clearRect(0, 0, w, h);
  c.fillStyle = INK;
  c.fillRect(0, 0, w, h);

  const a1 = 1 - smooth(seg(p, 0.2, 0.27));
  const a2 = smooth(seg(p, 0.2, 0.27)) * (1 - smooth(seg(p, 0.45, 0.52)));
  const a3 = smooth(seg(p, 0.45, 0.52)) * (1 - smooth(seg(p, 0.69, 0.76)));
  const a4 = smooth(seg(p, 0.69, 0.76));

  stepDrops(f);
  drawDeep(f, 1 - a1);
  drawRain(f, a1, false);
  // a thin veil of rain lingers while the water gathers
  drawRain(f, smooth(seg(p, 0.2, 0.27)) * 0.35 * (1 - smooth(seg(p, 0.3, 0.46))), true);
  drawRivers(f, a2);
  drawNetwork(f, a3);
  drawForecast(f, a4);
  drawRise(f);
}

export const SCENE_COUNT = 4;
