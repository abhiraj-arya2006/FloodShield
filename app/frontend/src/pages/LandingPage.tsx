import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import LocomotiveScroll from 'locomotive-scroll';
import 'locomotive-scroll/dist/locomotive-scroll.css';
import { geoEquirectangular, geoOrthographic, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import land110 from 'world-atlas/land-110m.json';
import { fetchEdges, fetchGauges } from '../services/api';
import { EdgeItem, GaugeItem } from '../types';
import { LivingRiverPage, buildLayout, VIEW_W, VIEW_H } from './LivingRiverPage';
import { createShoal } from './fishShoal';
import './landing.css';

gsap.registerPlugin(ScrollTrigger);

const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const band = (p: number, a: number, b: number, c: number, d: number) => sm(a, b, p) * (1 - sm(c, d, p));

/* Scroll ranges of the four slides: [fade in start, in end, out start, out end]. */
const SLIDES: [number, number, number, number][] = [
  [-1, -0.5, 0.11, 0.17],
  [0.25, 0.29, 0.37, 0.41],
  [0.52, 0.56, 0.63, 0.67],
  [0.88, 0.93, 2, 3],
];
const SLIDE_STARTS = [0, 0.33, 0.64, 1];

const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
const FRAG = `precision highp float;
uniform vec2 R,L;uniform float T,P,D;uniform vec4 G;uniform sampler2D uLand,uDay,uNight,uCloud;uniform float Y;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=mat2(.8,.6,-.6,.8)*p*2.03+vec2(7.1,3.3);a*=.5;}return v;}
/* the bright web sunlight makes as it passes through waves */
float caus(vec2 p,float t){vec2 i=p;float k=1.;
 for(int m=0;m<4;m++){float s=t*(1.-3.5/float(m+1));i=p+vec2(cos(s-i.x)+sin(s+i.y),sin(s-i.y)+cos(s+i.x));
 k+=1./length(vec2(p.x/(sin(i.x+s)/.005),p.y/(cos(i.y+s)/.005)));}
 k=1.17-pow(k/4.,1.4);return clamp(pow(abs(k),8.),0.,2.);}
void main(){
 vec2 uv=gl_FragCoord.xy/R,c=(gl_FragCoord.xy-.5*R)/min(R.x,R.y);
 /* deep water with light shafts */
 vec3 d=mix(vec3(.015,.07,.16),vec3(.06,.36,.52),pow(uv.y,1.5));
 float x=c.x+(1.-uv.y)*.35;
 d+=vec3(.25,.5,.55)*n(vec2(x*5.+T*.05,T*.04))*n(vec2(x*13.-T*.07,3.))*pow(uv.y,2.)*1.1;
 /* scene A: looking up from under the flood at a monsoon sky */
 float wA=1.-smoothstep(.12,.22,P);
 /* the surface moves, so the sky seen through it bends and wobbles */
 vec2 wv=vec2(n(c*6.+vec2(T*.55,T*.3)),n(c*6.+vec2(-T*.45,T*.4)+9.))-.5;
 vec2 cs=c+wv*.045*wA;
 float cl=smoothstep(.36,.62,fbm(cs*3.4+vec2(T*.02,-T*.012)));
 vec3 s=mix(vec3(.10,.38,.78),vec3(.97,.98,1.),cl);
 s*=1.-.28*exp(-c.y*c.y*16.)*(1.-smoothstep(.1,.2,P));
 float rad=length(cs)+(fbm(c*3.+T*.05)-.5)*.2;
 float R0=mix(.66,1.7,smoothstep(.03,.22,P));
 float inside=1.-smoothstep(R0-.14,R0+.08,rad);
 vec3 A=mix(d*.55,s,inside);
 /* light dancing on the underside of the waves, strongest in the window */
 float k=caus(mod(cs*5.2+vec2(T*.04,-T*.03),6.28318)-250.,T*.32+23.);
 A+=vec3(.55,.86,.95)*k*(.05+.2*inside)*wA;
 /* the window's edge, where the surface bends light hardest, glints as it moves */
 A+=vec3(.62,.9,1.)*exp(-pow((rad-R0+.04)/.045,2.))*(.18+.3*n(vec2(atan(c.y,c.x)*6.,T*.8)))*wA;
 /* scene B: storm dusk over the river, then the plunge under the surface */
 float hz=mix(.42,1.3,smoothstep(.37,.47,P));
 float y=uv.y-hz;
 vec3 g=mix(vec3(1.,.56,.34),vec3(.27,.26,.50),smoothstep(0.,.55,y));
 float ncl=fbm(vec2(c.x*1.5+T*.008,y*4.8));
 g=mix(g,vec3(.96,.45,.48),smoothstep(.38,.55,ncl)*.7);
 g=mix(g,vec3(.15,.14,.28),smoothstep(.52,.74,ncl)*.9);
 g+=vec3(1.,.74,.45)*exp(-length(vec2(c.x,y*1.4))*8.);
 float yy=max(-y,0.);
 vec3 w=mix(vec3(.74,.40,.34),d,smoothstep(0.,.36,yy));
 w+=vec3(1.,.66,.42)*exp(-abs(c.x)*5.)*n(vec2(c.x*11.,18./(yy+.08)-T*.5))*exp(-yy*5.)*.9;
 vec3 B=mix(w,g,smoothstep(-.002,.002,y));
 vec3 col=mix(A,B,smoothstep(.17,.25,P));
 col=mix(col,d,smoothstep(.44,.5,P));
 /* settle into the dashboard's slate */
 col=mix(col,vec3(.059,.165,.227),smoothstep(.64,.86,P));
 /* the Earth: NASA imagery on a lit sphere, drawn per pixel so it stays sharp at any zoom */
 if(G.w>.001){
  vec2 q=(gl_FragCoord.xy-G.xy)/G.z;float l=length(q);
  vec3 sun=normalize(vec3(-.42,.5,.76));
  float sunSide=.55+.45*dot(normalize(q+1e-4),normalize(sun.xy));
  vec3 glow=vec3(.30,.62,1.)*exp(-max(l-1.,0.)*20.)*.95*sunSide;
  if(l<1.){
   vec3 v=vec3(q,sqrt(1.-l*l));
   float cy=cos(L.y),sy=sin(L.y);
   float gy=v.y*cy+v.z*sy,gz=-v.y*sy+v.z*cy;
   float lat=asin(clamp(gy,-1.,1.)),lon=L.x+atan(v.x,gz);
   vec2 tuv=vec2(fract(lon/6.28318+.5),.5-lat/3.14159);
   float m=smoothstep(.42,.58,texture2D(uLand,tuv).r);
   vec3 day=mix(mix(vec3(.02,.09,.24),vec3(.13,.28,.15),m),pow(texture2D(uDay,tuv).rgb,vec3(1.15))*1.25,Y);
   /* shallow seas catch the light, as they do from orbit */
   day+=vec3(0.,.09,.11)*smoothstep(.03,.5,texture2D(uLand,tuv,4.).r)*(1.-m);
   float dl=dot(v,sun);
   float lit=smoothstep(-.12,.55,dl);
   vec3 g=day*(.035+1.25*lit);
   /* sun glint on open water, city lights on the night side */
   g+=(1.-m)*vec3(.9,.95,1.)*pow(max(reflect(-sun,v).z,0.),60.)*.55;
   g+=texture2D(uNight,tuv).rgb*vec3(1.,.82,.55)*(1.-smoothstep(-.18,.12,dl))*1.5;
   /* real cloud cover, slowly drifting, thinning as we fall toward the rivers */
   vec2 cuv=vec2(tuv.x+T*.0011,tuv.y);
   float cl=texture2D(uCloud,cuv).r;
   g*=1.-.38*texture2D(uCloud,cuv+vec2(.0025,-.002)).r*(1.-D);
   g=mix(g,vec3(.97,.98,1.)*(.05+1.15*lit),cl*(1.-D*.9));
   /* air: the blue limb, then a little dimming so the rivers read */
   g=mix(g,vec3(.34,.62,1.)*(.1+lit),pow(1.-v.z,3.2)*.85);
   g*=1.-D*.3;
   col=mix(col,g,G.w*(1.-smoothstep(1.-2./G.z,1.,l)));
  }
  col+=glow*G.w*step(1.,l);
 }
 col*=1.-.28*dot(c,c)*(1.-smoothstep(.7,.9,P));
 gl_FragColor=vec4(col,1.);}`;

function startShader(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false });
  if (!gl) return null;
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uR = gl.getUniformLocation(prog, 'R');
  const uT = gl.getUniformLocation(prog, 'T');
  const uP = gl.getUniformLocation(prog, 'P');
  const uG = gl.getUniformLocation(prog, 'G');
  const uL = gl.getUniformLocation(prog, 'L');
  const uD = gl.getUniformLocation(prog, 'D');
  const uY = gl.getUniformLocation(prog, 'Y');
  const units: Record<string, number> = { uLand: 0, uDay: 1, uNight: 2, uCloud: 3 };
  for (const [name, unit] of Object.entries(units)) {
    gl.uniform1i(gl.getUniformLocation(prog, name), unit);
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
  }
  gl.uniform1f(uY, 0);
  return {
    /* globe is [x, y, radius, alpha] in canvas pixels; centre is [lon, lat] in radians. */
    draw(t: number, p: number, globe: number[], centre: number[], dim: number) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uR, canvas.width, canvas.height);
      gl.uniform1f(uT, t);
      gl.uniform1f(uP, p);
      gl.uniform4f(uG, globe[0], globe[1], globe[2], globe[3]);
      gl.uniform2f(uL, centre[0], centre[1]);
      gl.uniform1f(uD, dim);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    /* Unit 0 is the land map, 1 daylight, 2 night lights, 3 clouds. */
    setTexture(unit: number, image: HTMLCanvasElement) {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (unit === 1) gl.uniform1f(uY, 1);
    },
  };
}

/* Older graphics hardware needs power-of-two textures, so each image is redrawn to that size first. */
function loadTexture(url: string, width: number, onReady: (image: HTMLCanvasElement) => void) {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = width / 2;
    const g = c.getContext('2d')!;
    g.fillStyle = '#000';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    onReady(c);
  };
  img.src = url;
}

/* Real coastlines painted once into a world map the shader reads from. */
function paintLand(land: never): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 4096;
  c.height = 2048;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#fff';
  const map = geoEquirectangular().scale(c.width / (2 * Math.PI)).translate([c.width / 2, c.height / 2]);
  g.beginPath();
  geoPath(map, g)(land);
  g.fill();
  return c;
}

const seeded = (count: number) => Array.from({ length: count }, () => [Math.random(), Math.random(), Math.random(), Math.random()]);
const RAIN = seeded(420);
const BUBBLES = seeded(46);
/* Specks and small bubbles in the water around the shoal. */
const SPECKS = seeded(150);
const RISING = seeded(22);
const toLand = (topo: unknown) => feature(topo as never, (topo as { objects: { land: never } }).objects.land) as never;

export const LandingPage: React.FC = () => {
  const trackRef = useRef<HTMLDivElement>(null);
  const skyRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLCanvasElement>(null);
  const shoalRef = useRef<HTMLCanvasElement>(null);
  const scroller = useRef<LocomotiveScroll | null>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  const stepsRef = useRef<HTMLElement>(null);
  const slideRefs = useRef<(HTMLElement | null)[]>([]);
  const forecastRef = useRef<HTMLDivElement>(null);
  const river = useRef<{ gauges: GaugeItem[]; edges: EdgeItem[] }>({ gauges: [], edges: [] });
  const [forecastInView, setForecastInView] = useState(false);

  useEffect(() => {
    Promise.all([fetchGauges(), fetchEdges()])
      .then(([g, e]) => { river.current = { gauges: g.gauges, edges: e.edges }; })
      .catch(() => { /* The film still plays; the forecast below shows the load error and a retry. */ });
  }, []);

  useEffect(() => {
    const el = forecastRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setForecastInView(true), { threshold: 0.45 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const sky = skyRef.current!;
    const fx = fxRef.current!;
    const ctx = fx.getContext('2d')!;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const skyScene = startShader(sky);
    skyScene?.setTexture(0, paintLand(toLand(land110)));
    void import('world-atlas/land-50m.json').then((m) => skyScene?.setTexture(0, paintLand(toLand(m.default))));
    loadTexture('/textures/earth-day.jpg', 4096, (c) => skyScene?.setTexture(1, c));
    loadTexture('/textures/earth-night.jpg', 2048, (c) => skyScene?.setTexture(2, c));
    loadTexture('/textures/earth-clouds.jpg', 2048, (c) => skyScene?.setTexture(3, c));
    const shoalCanvas = shoalRef.current!;
    const shoal = createShoal(shoalCanvas, window.innerWidth < 800 ? 1800 : 5200);
    /* The scrubbed timeline: GSAP eases scroll position into one 0 to 1 story value. */
    const scrub = { p: 0 };
    const scrubTween = gsap.to(scrub, {
      p: 1,
      ease: 'none',
      scrollTrigger: { trigger: trackRef.current, start: 'top top', end: 'bottom bottom', scrub: still ? true : 0.9 },
    });
    /* The one load moment: the shoal sweeps in from below while the headline's words rise through the water. */
    const intro = { drop: still ? -6 : -15 };
    gsap.ticker.lagSmoothing(0); // Keep timing true on slower machines.
    const introTl = gsap.timeline();
    if (!still) {
      introTl
        .to(intro, { drop: -6, duration: 3.2, ease: 'power3.out' }, 0)
        .from('.ld-s1 .ld-word', { yPercent: 70, opacity: 0, filter: 'blur(10px)', duration: 1.3, stagger: 0.075, ease: 'power3.out' }, 0.5)
        .from('.ld-s1 p', { opacity: 0, y: 12, duration: 1, ease: 'power2.out' }, 1.3);
    }
    let w = 0, h = 0, raf = 0, p = 0, layoutKey = 0, activeStep = -1;
    let layout = new Map<string, { x: number; y: number; km: number }>();
    let longestKm = 1;

    let skyScale = 1;
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      fx.width = w * dpr;
      fx.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sky.width = Math.round(w * skyScale);
      sky.height = Math.round(h * skyScale);
      shoal?.resize(w, h);
    };
    resize();
    window.addEventListener('resize', resize);

    const projection = geoOrthographic().clipAngle(90).precision(1.5);
    const path = geoPath(projection, ctx);

    /* If this machine can't hold a smooth frame rate, trade detail for motion. */
    let frames = 0, windowStart = 0;
    const watchSpeed = (ms: number) => {
      if (!windowStart) windowStart = ms;
      if (++frames < 45) return;
      const average = (ms - windowStart) / frames;
      frames = 0;
      windowStart = ms;
      if (average > 28 && document.visibilityState === 'visible') {
        const lighter = shoal?.lighten();
        if (skyScale > 0.7) skyScale = 0.7;
        if (lighter !== undefined || skyScale === 0.7) resize();
      }
    };

    const frame = (ms: number) => {
      raf = requestAnimationFrame(frame);
      watchSpeed(ms);
      const track = trackRef.current!;
      const span = track.offsetHeight - h;
      if (window.scrollY > span + h) return; // Stage is off screen.
      p = scrub.p;
      const t = still ? 12 : ms / 1000;

      /* Slide 3: the Earth turns to India and we fall toward the two rivers. */
      const m = Math.min(w, h);
      const earthA = sm(0.46, 0.53, p) * (1 - sm(0.82, 0.9, p));
      const turn = sm(0.47, 0.66, p);
      const fall = sm(0.6, 0.8, p);
      const scale = m * 0.34 * Math.pow((Math.max(w, h * 1.4) * 4.4) / (m * 0.34), fall);
      const cxE = mix(w * (w > 800 ? 0.68 : 0.5), w * 0.5, fall);
      const cyE = mix(h * (w > 800 ? 0.52 : 0.66), h * 0.52, fall);
      const lonE = mix(20, 80.9, turn), latE = mix(4, 20.2, turn);
      projection.scale(scale).translate([cxE, cyE]).rotate([-lonE, -latE, 0]);
      skyScene?.draw(
        t, p,
        [cxE * skyScale, (h - cyE) * skyScale, scale * skyScale, earthA],
        [(lonE * Math.PI) / 180, (latE * Math.PI) / 180],
        fall
      );
      ctx.clearRect(0, 0, w, h);

      /* Slide 1: the 3D shoal. Scrolling lifts the viewer up through it into the open sky. */
      const shoalOn = p < 0.26;
      shoalCanvas.style.visibility = shoalOn ? 'visible' : 'hidden';
      if (shoalOn) {
        shoalCanvas.style.opacity = String(1 - sm(0.19, 0.25, p));
        shoal?.render(t, intro.drop + sm(0.04, 0.23, p) * p * 190);
      }

      /* Slide 1: the water itself. Specks drift and sway, small bubbles rise toward the light. */
      const waterA = 1 - sm(0.12, 0.22, p);
      if (waterA > 0) {
        const lift = p * h * 1.6;
        for (const [a, b, c, d] of SPECKS) {
          const y = (((b * h * 1.2 - t * (4 + c * 10) + lift * (0.5 + c)) % (h * 1.2)) + h * 1.2) % (h * 1.2) - h * 0.1;
          const x = a * w + Math.sin(t * (0.3 + d * 0.5) + a * 40) * (8 + c * 16);
          const r = 0.6 + c * c * 1.8;
          ctx.fillStyle = `rgba(200,232,240,${(0.12 + d * 0.28) * waterA})`;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
        for (const [a, b, c, d] of RISING) {
          const y = h * 1.05 - ((((b + t * (0.035 + c * 0.05)) % 1) + 1) % 1) * h * 1.15 + lift * 0.4;
          const x = a * w + Math.sin(t * 2.2 + d * 30) * (3 + c * 5);
          const r = 1.5 + c * 4.5;
          ctx.strokeStyle = `rgba(220,244,248,${0.38 * waterA})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = `rgba(240,252,255,${0.45 * waterA})`;
          ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, Math.max(0.6, r * 0.2), 0, Math.PI * 2); ctx.fill();
        }
      }

      /* Slide 2: rain over the river at dusk. */
      const rainA = band(p, 0.2, 0.27, 0.4, 0.46);
      if (rainA > 0) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(232,238,244,${0.3 * rainA})`;
        ctx.beginPath();
        for (const [a, b, c] of RAIN) {
          const y = ((b + t * (0.8 + c * 0.8)) % 1) * h * 1.1 - 20;
          const x = ((a + (y / h) * -0.05) % 1) * w;
          const l = 10 + c * 22;
          ctx.moveTo(x, y); ctx.lineTo(x - l * 0.14, y + l);
        }
        ctx.stroke();
      }

      /* The plunge: bubbles streaming past. */
      const bubA = band(p, 0.4, 0.46, 0.6, 0.68);
      if (bubA > 0) {
        for (const [a, b, c] of BUBBLES) {
          const y = h * 1.1 - (((b + t * 0.04 * (1 + c) + p * 2.4) % 1) * h * 1.25);
          const x = a * w + Math.sin(t + a * 20) * 12;
          const r = 2 + c * c * 24;
          ctx.strokeStyle = `rgba(214,240,245,${0.42 * bubA})`;
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = `rgba(214,240,245,${0.3 * bubA})`;
          ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.14, 0, Math.PI * 2); ctx.fill();
        }
      }

      /* Slides 3 and 4: the gauges light up from upstream, then straighten into the forecast diagram. */
      const { gauges, edges } = river.current;
      if (gauges.length && layoutKey !== gauges.length) {
        layout = buildLayout(gauges, edges);
        layoutKey = gauges.length;
        longestKm = Math.max(1, ...[...layout.values()].map((pt) => pt.km));
      }
      const riverA = sm(0.6, 0.68, p);
      if (riverA > 0 && layout.size) {
        const reveal = sm(0.64, 0.8, p);
        const morph = sm(0.8, 0.95, p);
        const eased = morph * morph * (3 - 2 * morph);
        const k = w / VIEW_W;
        const top = Math.max(0, h - VIEW_H * k - 24);
        const byId = new Map(gauges.map((g) => [g.gauge_id, g]));
        const pos = (g: GaugeItem) => {
          const [gx, gy] = projection([g.ghi_lon, g.ghi_lat]) ?? [0, 0];
          const s = layout.get(g.gauge_id)!;
          return [mix(gx, s.x * k, eased), mix(gy, top + s.y * k, eased)];
        };
        const baseW = (g: GaugeItem) => (2.5 + Math.sqrt(g.q95_m3s) / 7) * mix(0.75, 0.5 * Math.max(k, 0.5), eased);
        ctx.lineCap = 'round';
        edges.forEach((e, i) => {
          const a = byId.get(e.from_gauge_id), b = byId.get(e.to_gauge_id);
          if (!a || !b) return;
          const kmA = layout.get(a.gauge_id)!.km;
          const shown = Math.min(1, Math.max(0, (reveal * 1.15 - (1 - kmA / longestKm)) * 7));
          if (shown <= 0) return;
          const [x1, y1] = pos(a), [x2, y2] = pos(b);
          const mx = (x1 + x2) / 2;
          const c1y = mix(y1 + (y2 - y1) / 3, y1, eased), c2y = mix(y2 - (y2 - y1) / 3, y2, eased);
          ctx.strokeStyle = `rgba(226,178,92,${riverA * shown})`;
          ctx.lineWidth = baseW(a);
          ctx.shadowColor = 'rgba(240,190,100,.75)';
          ctx.shadowBlur = 10 * (1 - eased);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.bezierCurveTo(mx, c1y, mx, c2y, x2, y2);
          ctx.stroke();
          ctx.shadowBlur = 0;
          /* A pulse of water travelling downstream along the link. */
          if (shown === 1) {
            const u = (t * 0.35 + i * 0.37) % 1;
            const v = 1 - u;
            const px = v * v * v * x1 + 3 * v * v * u * mx + 3 * v * u * u * mx + u * u * u * x2;
            const py = v * v * v * y1 + 3 * v * v * u * c1y + 3 * v * u * u * c2y + u * u * u * y2;
            ctx.fillStyle = `rgba(255,244,214,${riverA * 0.95})`;
            ctx.beginPath(); ctx.arc(px, py, 1.5 + baseW(a) * 0.3, 0, Math.PI * 2); ctx.fill();
          }
        });
        for (const g of gauges) {
          const kmA = layout.get(g.gauge_id)!.km;
          if ((reveal * 1.15 - (1 - kmA / longestKm)) <= 0) continue;
          const [x, y] = pos(g);
          ctx.fillStyle = '#0f2a3a';
          ctx.strokeStyle = `rgba(240,216,160,${riverA})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(x, y, Math.max(3, baseW(g) * 0.62), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        }
      }

      const nameA = riverA * (1 - sm(0.8, 0.86, p)) * sm(0.68, 0.74, p);
      if (nameA > 0 && layout.size) {
        ctx.fillStyle = `rgba(244,248,246,${nameA})`;
        ctx.font = `500 ${Math.round(m * 0.05)}px Fraunces, serif`;
        ctx.textAlign = 'center';
        const god = projection([78.6, 17.7]), mah = projection([85.3, 21.4]);
        if (god) ctx.fillText('Godavari', god[0], god[1]);
        if (mah) ctx.fillText('Mahanadi', mah[0], mah[1]);
        ctx.textAlign = 'start';
      }

      /* Words. */
      SLIDES.forEach(([a, b, c, d], i) => {
        const el = slideRefs.current[i];
        if (!el) return;
        const o = band(p, a, b, c, d);
        el.style.opacity = String(o);
        el.style.visibility = o < 0.02 ? 'hidden' : 'visible';
        el.style.transform = `translate3d(0,${(1 - sm(a, b, p)) * 28 - sm(c, d, p) * 28}px,0)`;
      });
      const part = p < 0.25 ? 0 : p < 0.5 ? 1 : p < 0.8 ? 2 : 3;
      if (part !== activeStep) {
        activeStep = part;
        stepsRef.current?.querySelectorAll('button').forEach((b, i) => {
          if (i === part) b.setAttribute('aria-current', 'step');
          else b.removeAttribute('aria-current');
        });
      }
      if (hintRef.current) hintRef.current.style.opacity = String(1 - sm(0.01, 0.05, p));
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      scrubTween.scrollTrigger?.kill();
      scrubTween.kill();
      introTl.revert();
      shoal?.dispose();
    };
  }, []);

  /* Locomotive's smooth scrolling. It keeps native scroll, so the sticky stage and ScrollTrigger stay in step. */
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const loco = new LocomotiveScroll({ lenisOptions: { lerp: 0.075, wheelMultiplier: 0.85, smoothWheel: true } });
    scroller.current = loco;
    return () => {
      loco.destroy();
      scroller.current = null;
    };
  }, []);

  const scrollToTop = (top: number) => {
    if (scroller.current) scroller.current.scrollTo(top, { duration: 2.4 });
    else window.scrollTo({ top, behavior: 'auto' });
  };

  const goTo = (fraction: number) => {
    const track = trackRef.current!;
    scrollToTop(fraction * (track.offsetHeight - window.innerHeight));
  };
  const openForecast = () => scrollToTop(trackRef.current!.offsetHeight);

  return (
    <div className="ld">
      <div className="ld-track" ref={trackRef}>
        <div className="ld-stage">
          <canvas ref={skyRef} className="ld-canvas" aria-hidden="true" />
          <canvas ref={shoalRef} className="ld-canvas" aria-hidden="true" />
          <canvas ref={fxRef} className="ld-canvas" aria-hidden="true" />

          <header className="ld-top">
            <span className="ld-brand">FloodShield</span>
            <button type="button" onClick={openForecast}>Skip to the forecast</button>
          </header>

          <section className="ld-slide ld-s1" ref={(el) => { slideRefs.current[0] = el; }}>
            <h1>
              {'A flood starts days before the water arrives'.split(' ').map((word, i) => (
                <span className="ld-word" key={i}>{word} </span>
              ))}
            </h1>
            <p>FloodShield reads the weather and forecasts river flow four days ahead.</p>
          </section>
          <section className="ld-slide ld-s2" ref={(el) => { slideRefs.current[1] = el; }}>
            <h2>It begins as weather</h2>
            <p>The model reads rain, temperature and the shape of each catchment. It never needs a river gauge reading.</p>
          </section>
          <section className="ld-slide ld-s3" ref={(el) => { slideRefs.current[2] = el; }}>
            <h2>Two rivers, 46 gauges</h2>
            <p>The Godavari and Mahanadi, joined by 44 river links. STG-Mamba follows each day's rain downstream, gauge by gauge.</p>
          </section>
          <section className="ld-slide ld-s4" ref={(el) => { slideRefs.current[3] = el; }}>
            <h2>Four days of warning at every gauge</h2>
            <p>
              In held-back test years 2013 to 2018, using recorded rain, it caught about 74% of flood days at lead days 2 to 4.
              About 38% of its alerts were false. A research prototype, not an official warning.
            </p>
            <button type="button" className="ld-enter" onClick={openForecast}>Open the river forecast</button>
          </section>

          <nav className="ld-steps" aria-label="Story progress" ref={stepsRef}>
            {SLIDE_STARTS.map((f, i) => (
              <button key={f} type="button" aria-label={`Go to part ${i + 1} of 4`} onClick={() => goTo(f)} />
            ))}
          </nav>

          <div className="ld-hint" ref={hintRef} aria-hidden="true">Scroll to follow the rain<span /></div>
        </div>
      </div>

      <div ref={forecastRef}>
        <LivingRiverPage hold={!forecastInView} embedded />
      </div>
    </div>
  );
};

export default LandingPage;
