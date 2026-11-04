import * as THREE from 'three';

/*
  A shoal of 3D sardines circling overhead. The viewer looks straight up through the
  shoal at the sky. All swimming happens in the vertex shader, so thousands of fish
  cost one draw call.
*/

const VERT = /* glsl */ `
attribute vec4 aSeed;   // angle, height, radius share, per-fish random
attribute float aPart;  // 0 body, 1 fin
uniform float uTime, uStretch, uRise;
varying vec3 vN, vView, vLocal;
varying float vPart, vRand, vDepth;

void main() {
  float y0 = aSeed.y;
  float ratio = aSeed.z;
  float rand = aSeed.w;

  /* Circling path: a cone that keeps the sky open in the middle. */
  float theta = aSeed.x + uTime * (0.2 + rand * 0.035) + sin(uTime * 0.25 + rand * 40.0) * 0.03;
  float radius = y0 * ratio + sin(uTime * 0.4 + rand * 70.0) * 0.35;
  vec3 center = vec3(cos(theta) * radius * uStretch, y0 + sin(uTime * 0.6 + rand * 50.0) * 0.3 - uRise, sin(theta) * radius);

  vec3 forward = normalize(vec3(-sin(theta) * uStretch, 0.05 * sin(uTime + rand * 30.0), cos(theta)));
  /* Fish bank into the turn, so their silver sides catch the light from above. */
  vec3 inward = normalize(vec3(-cos(theta), 0.0, -sin(theta)));
  vec3 up = normalize(vec3(0.0, 1.0, 0.0) + inward * 0.55);
  vec3 side = normalize(cross(forward, up));
  up = cross(side, forward);

  /* Swimming: a wave runs down the body and grows toward the tail. */
  float u = 0.5 - position.x;
  float beat = uTime * (9.0 + rand * 5.0) + rand * 80.0;
  float wave = sin(u * 6.5 - beat);
  float reach = 0.012 + u * u * 0.11;
  vec3 p = position;
  p.z += wave * reach;

  float bendSlope = cos(u * 6.5 - beat) * reach * 6.5;
  vec3 n = normalize(vec3(normal.x + normal.z * bendSlope, normal.y, normal.z));

  float size = 0.55 + rand * rand * 0.75;
  vec3 world = center + (forward * p.x + up * p.y + side * p.z) * size;

  vN = normalize(forward * n.x + up * n.y + side * n.z);
  vLocal = position;
  vPart = aPart;
  vRand = rand;
  vec4 view = viewMatrix * vec4(world, 1.0);
  vView = normalize(cameraPosition - world);
  vDepth = -view.z;
  gl_Position = projectionMatrix * view;
}`;

const FRAG = /* glsl */ `
precision highp float;
varying vec3 vN, vView, vLocal;
varying float vPart, vRand, vDepth;

void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(vView);
  vec3 sun = normalize(vec3(0.15, 1.0, 0.1));

  /* Counter-shading: blue-black back, silver flank, pale belly. */
  float h = vLocal.y;
  vec3 back = vec3(0.012, 0.075, 0.13);
  vec3 flank = vec3(0.34, 0.45, 0.52);
  vec3 belly = vec3(0.70, 0.78, 0.82);
  vec3 col = mix(belly, flank, smoothstep(-0.07, -0.005, h));
  col = mix(col, back, smoothstep(0.012, 0.05, h));

  /* Scales: a fine diamond lattice that breaks up the reflection. */
  float scale = sin((vLocal.x + vLocal.y) * 170.0) * sin((vLocal.x - vLocal.y) * 170.0);

  /* A sardine's sides act like a mirror: they reflect bright sky, then flash as the fish turns. */
  vec3 r = reflect(-v, n);
  float skyward = smoothstep(-0.25, 0.85, r.y);
  vec3 mirror = mix(vec3(0.02, 0.10, 0.18), vec3(0.72, 0.87, 1.0), skyward);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  float flash = pow(max(dot(r, sun), 0.0), 18.0);
  float sparkle = sin(vRand * 90.0 + vLocal.x * 3.0) * 0.5 + 0.5;

  vec3 lit = col * (0.24 + 0.5 * max(dot(n, sun), 0.0));
  lit = mix(lit, mirror, (0.34 + 0.34 * fres) * smoothstep(0.05, -0.02, h));
  lit += vec3(0.95, 1.0, 1.0) * flash * (0.55 + 1.2 * sparkle) * (0.8 + 0.2 * scale);
  lit *= 0.94 + 0.1 * scale;

  /* Dark gill line, eye and semi-dark fins. */
  lit *= 1.0 - 0.45 * smoothstep(0.012, 0.0, abs(vLocal.x - 0.33)) * step(vLocal.y, 0.05);
  float eye = length(vec2(vLocal.x - 0.41, vLocal.y - 0.012));
  lit = mix(lit, vec3(0.86, 0.9, 0.86), smoothstep(0.024, 0.02, eye));
  lit = mix(lit, vec3(0.0, 0.01, 0.02), smoothstep(0.015, 0.011, eye));
  if (vPart > 0.5) lit = mix(vec3(0.03, 0.09, 0.14), lit, 0.2);

  /* Water haze: far fish melt into blue, as in real underwater light. */
  float haze = 1.0 - exp(-vDepth * 0.034);
  lit = mix(lit, vec3(0.07, 0.25, 0.46), haze * 0.85);
  gl_FragColor = vec4(lit, 1.0);
}`;

function buildFish(): THREE.BufferGeometry {
  const positions: number[] = [];
  const parts: number[] = [];
  const index: number[] = [];
  const RINGS = 14;
  const SIDES = 8;
  const TAIL_X = -0.36;
  const NOSE_X = 0.5;

  /* Slender body: an ellipse at each ring, deepest just behind the head. */
  const halfHeight = (u: number) => 0.012 + 0.092 * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.72)), 0.82);
  for (let i = 0; i <= RINGS; i++) {
    const u = i / RINGS;
    const x = TAIL_X + (NOSE_X - TAIL_X) * u;
    const hh = i === RINGS ? 0.001 : halfHeight(u);
    const hw = hh * 0.52;
    for (let j = 0; j < SIDES; j++) {
      const a = (j / SIDES) * Math.PI * 2;
      positions.push(x, Math.sin(a) * hh - 0.004, Math.cos(a) * hw);
      parts.push(0);
    }
  }
  for (let i = 0; i < RINGS; i++) {
    for (let j = 0; j < SIDES; j++) {
      const a = i * SIDES + j;
      const b = i * SIDES + ((j + 1) % SIDES);
      const c = a + SIDES;
      const d = b + SIDES;
      index.push(a, c, b, b, c, d);
    }
  }

  /* Flat fins, split into strips so the swimming wave bends them too. */
  const fin = (pts: [number, number][], tris: number[]) => {
    const base = positions.length / 3;
    pts.forEach(([x, y]) => { positions.push(x, y, 0); parts.push(1); });
    tris.forEach((t) => index.push(base + t));
  };
  // Forked tail.
  fin(
    [[-0.34, 0.014], [-0.34, -0.014], [-0.42, 0.05], [-0.42, -0.05], [-0.405, 0], [-0.52, 0.098], [-0.52, -0.098], [-0.45, 0.0]],
    [0, 1, 4, 0, 4, 2, 1, 3, 4, 2, 4, 7, 4, 3, 7, 2, 7, 5, 3, 6, 7]
  );
  // Dorsal, belly and pectoral fins.
  fin([[0.02, 0.09], [-0.1, 0.075], [-0.07, 0.135]], [0, 1, 2]);
  fin([[-0.08, -0.07], [-0.18, -0.05], [-0.17, -0.105]], [0, 1, 2]);
  fin([[0.28, -0.06], [0.2, -0.07], [0.18, -0.11]], [0, 1, 2]);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(parts, 1));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

export interface Shoal {
  resize: (w: number, h: number) => void;
  render: (time: number, rise: number) => void;
  /* Lower the fish count and resolution on slower graphics hardware. */
  lighten: () => boolean;
  dispose: () => void;
}

export function createShoal(canvas: HTMLCanvasElement, count: number): Shoal | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch {
    return null; // The sky and words still work without the shoal.
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 120);
  camera.up.set(0, 0, 1);
  camera.lookAt(0, 1, 0);

  const base = buildFish();
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.setAttribute('position', base.getAttribute('position'));
  geometry.setAttribute('normal', base.getAttribute('normal'));
  geometry.setAttribute('aPart', base.getAttribute('aPart'));
  geometry.instanceCount = count;

  /* Fish gather in spiral arms, the sweeping bands of a real bait ball. */
  const ARMS = 5;
  const seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const y = 7 + Math.pow(Math.random(), 1.45) * 32;
    const spreadInArm = (Math.random() + Math.random() + Math.random() - 1.5) * 0.52;
    const arm = (Math.floor(Math.random() * ARMS) / ARMS) * Math.PI * 2;
    seeds[i * 4] = arm + spreadInArm + y * 0.075;
    seeds[i * 4 + 1] = y;
    seeds[i * 4 + 2] = 0.52 + Math.pow(Math.random(), 1.2) * 1.45;
    seeds[i * 4 + 3] = Math.random();
  }
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));

  const uniforms = { uTime: { value: 0 }, uStretch: { value: 1 }, uRise: { value: 0 } };
  const material = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  return {
    resize(w, h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      /* Widen the circle on wide screens so the headline sits inside the opening. */
      uniforms.uStretch.value = Math.max(1, (w / h) * 0.95);
    },
    render(time, rise) {
      uniforms.uTime.value = time;
      uniforms.uRise.value = rise;
      renderer.render(scene, camera);
    },
    lighten() {
      if (geometry.instanceCount <= 1400) return false;
      geometry.instanceCount = Math.round(geometry.instanceCount * 0.6);
      renderer.setPixelRatio(1);
      return true;
    },
    dispose() {
      geometry.dispose();
      base.dispose();
      material.dispose();
      renderer.dispose();
    },
  };
}
