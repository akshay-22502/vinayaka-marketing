// Shared helpers for the application renders: renderer, lights, procedural textures,
// instanced stones, unrolling sheets and HTML labels. Each scene module exports
// default async (stage) => ({ duration, render(t) }).
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export { THREE, RoundedBoxGeometry };

export const W = 1280;
export const H = 720;

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const ease = (x) => {
  x = clamp01(x);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 3);
/** Progress 0..1 of t through [a, b]. */
export const span = (t, a, b) => clamp01((t - a) / (b - a));

export function setup(stage, { fov = 28, target = [0, 0, 0] } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.localClippingEnabled = true;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, W / H, 0.1, 200);
  const look = new THREE.Vector3(...target);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  scene.add(new THREE.HemisphereLight(0xeef4ff, 0x7a6a55, 0.7));
  const sun = new THREE.DirectionalLight(0xfff4e5, 2.6);
  sun.position.set(-6, 12, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -9;
  sun.shadow.camera.right = 9;
  sun.shadow.camera.top = 9;
  sun.shadow.camera.bottom = -9;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 40;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdfe8ff, 0.9);
  fill.position.set(2, 4, 10);
  scene.add(fill);

  const catcher = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.22 }));
  catcher.rotation.x = -Math.PI / 2;
  catcher.receiveShadow = true;
  scene.add(catcher);

  return { renderer, scene, camera, look, catcher, sun };
}

/** Camera on a slow orbit: azimuth/elevation in degrees, distance, interpolated by u (0..1). */
export function orbit(camera, look, u, { az = [-28, -18], el = [24, 20], dist = [15, 14] } = {}) {
  const a = THREE.MathUtils.degToRad(az[0] + (az[1] - az[0]) * u);
  const e = THREE.MathUtils.degToRad(el[0] + (el[1] - el[0]) * u);
  const d = dist[0] + (dist[1] - dist[0]) * u;
  camera.position.set(look.x + d * Math.cos(e) * Math.sin(a), look.y + d * Math.sin(e), look.z + d * Math.cos(e) * Math.cos(a));
  camera.lookAt(look);
}

// ---------- procedural textures ----------

function valueNoise(size, rand, cells) {
  const grid = [];
  for (let i = 0; i < (cells + 1) * (cells + 1); i++) grid.push(rand());
  const g = (x, y) => grid[(y % cells) * (cells + 1) + (x % cells)];
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells,
        fy = (y / size) * cells;
      const ix = Math.floor(fx),
        iy = Math.floor(fy);
      const tx = fx - ix,
        ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx),
        sy = ty * ty * (3 - 2 * ty);
      const a = g(ix, iy),
        b = g(ix + 1, iy),
        c = g(ix, iy + 1),
        d = g(ix + 1, iy + 1);
      out[y * size + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  return out;
}

/** Fractal noise field 0..1, tileable. */
export function fbm(size, seed, octaves = [[4, 0.5], [8, 0.25], [16, 0.15], [32, 0.1]]) {
  const rand = rng(seed);
  const out = new Float32Array(size * size);
  for (const [cells, amp] of octaves) {
    const n = valueNoise(size, rand, cells);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
  }
  const total = octaves.reduce((s, o) => s + o[1], 0);
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

function hex(c) {
  const v = new THREE.Color(c);
  return [v.r * 255, v.g * 255, v.b * 255];
}

/**
 * A colour texture (and matching bump texture) from noise: colours mixed between `dark` and
 * `light` by fractal noise, plus `speckles` of random colours (grains, stones, fibres).
 */
export function noiseTexture({ size = 512, seed = 1, dark, light, speckles = [], contrast = 1, repeat = [1, 1], streaks = 0 }) {
  const n = fbm(size, seed);
  const rand = rng(seed * 7 + 3);
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  const img = ctx.createImageData(size, size);
  const bump = document.createElement("canvas");
  bump.width = bump.height = size;
  const bctx = bump.getContext("2d");
  const bimg = bctx.createImageData(size, size);
  const d = hex(dark),
    l = hex(light);
  for (let i = 0; i < size * size; i++) {
    let v = clamp01(0.5 + (n[i] - 0.5) * 2.2 * contrast + (rand() - 0.5) * 0.12);
    img.data[i * 4] = d[0] + (l[0] - d[0]) * v;
    img.data[i * 4 + 1] = d[1] + (l[1] - d[1]) * v;
    img.data[i * 4 + 2] = d[2] + (l[2] - d[2]) * v;
    img.data[i * 4 + 3] = 255;
    const b = 128 + (n[i] - 0.5) * 120;
    bimg.data[i * 4] = bimg.data[i * 4 + 1] = bimg.data[i * 4 + 2] = b;
    bimg.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  bctx.putImageData(bimg, 0, 0);
  for (const s of speckles) {
    for (let k = 0; k < s.count; k++) {
      const x = rand() * size,
        y = rand() * size;
      const r = s.min + rand() * (s.max - s.min);
      const col = s.colors[Math.floor(rand() * s.colors.length)];
      ctx.fillStyle = col;
      bctx.fillStyle = s.raise === false ? "#606060" : "#e0e0e0";
      for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
        ctx.beginPath();
        if (s.shape === "line") {
          const ang = rand() * Math.PI;
          ctx.save();
          ctx.translate(x + ox, y + oy);
          ctx.rotate(ang);
          ctx.fillRect(-r * 4, -0.6, r * 8, 1.2);
          ctx.restore();
        } else {
          ctx.ellipse(x + ox, y + oy, r, r * (0.6 + rand() * 0.4), rand() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
          bctx.beginPath();
          bctx.ellipse(x + ox, y + oy, r, r * 0.8, 0, 0, Math.PI * 2);
          bctx.fill();
        }
      }
    }
  }
  if (streaks) {
    ctx.globalAlpha = 0.08;
    for (let k = 0; k < streaks; k++) {
      ctx.fillStyle = rand() > 0.5 ? "#000" : "#fff";
      ctx.fillRect(0, rand() * size, size, 1 + rand() * 3);
    }
    ctx.globalAlpha = 1;
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(bump);
  for (const t of [map, bumpMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
    t.anisotropy = 8;
  }
  return { map, bumpMap };
}

export function material(tex, { roughness = 0.95, metalness = 0, bumpScale = 1.5, ...rest } = {}) {
  return new THREE.MeshStandardMaterial({ map: tex.map, bumpMap: tex.bumpMap, bumpScale, roughness, metalness, ...rest });
}

// Material presets.
export const MAT = {
  soil: () =>
    material(
      noiseTexture({
        seed: 11,
        dark: "#9c8164",
        light: "#d0b590",
        contrast: 0.55,
        repeat: [1, 1],
        speckles: [
          { count: 1400, min: 0.6, max: 1.8, colors: ["#6a5541", "#cdb594", "#93785a", "#a8a091"] },
          { count: 60, min: 2, max: 4, colors: ["#9a8f80", "#7d7468"] },
        ],
        streaks: 0,
      }),
      { bumpScale: 0.5 },
    ),
  asphalt: () =>
    material(
      noiseTexture({
        seed: 21,
        dark: "#5d6167",
        light: "#80848b",
        contrast: 0.6,
        repeat: [3, 2],
        speckles: [{ count: 2600, min: 0.5, max: 1.4, colors: ["#6b6f76", "#1d1f22", "#80848b"] }],
      }),
      { roughness: 0.85, bumpScale: 0.25 },
    ),
  aggregateFace: () =>
    material(
      noiseTexture({
        seed: 31,
        dark: "#7c7f84",
        light: "#b9bcc0",
        repeat: [3, 1],
        speckles: [{ count: 1400, min: 2, max: 6, colors: ["#d5d7da", "#8e9298", "#6d7177", "#a9adb2", "#c4b8a6"] }],
      }),
      { bumpScale: 0.8 },
    ),
  geotextile: () =>
    material(
      noiseTexture({
        seed: 41,
        dark: "#d9dbd9",
        light: "#f7f7f4",
        contrast: 0.5,
        repeat: [4, 4],
        speckles: [{ count: 1800, min: 1, max: 2.5, colors: ["#cfd2cf", "#ffffff", "#e3e4e0"], shape: "line" }],
      }),
      { roughness: 1, bumpScale: 0.3, side: THREE.DoubleSide },
    ),
  membrane: () =>
    material(noiseTexture({ seed: 51, dark: "#24272b", light: "#33373c", contrast: 0.3 }), {
      roughness: 0.38,
      bumpScale: 0.2,
      side: THREE.DoubleSide,
    }),
  grass: () =>
    material(
      noiseTexture({
        seed: 61,
        dark: "#4d6e33",
        light: "#86a35c",
        repeat: [4, 4],
        speckles: [{ count: 2500, min: 1, max: 2.2, colors: ["#5c8c35", "#94bf5e", "#3a6024"], shape: "line" }],
      }),
      { bumpScale: 0.6 },
    ),
  concrete: () =>
    material(
      noiseTexture({ seed: 71, dark: "#a9a9a4", light: "#cfcfca", contrast: 0.5, speckles: [{ count: 500, min: 0.6, max: 1.4, colors: ["#8f8f8a", "#e2e2dd"] }] }),
      { roughness: 0.9, bumpScale: 0.8 },
    ),
};

// ---------- stones ----------

/**
 * Instanced stones scattered in a box, each with a drop-in animation. `region` is
 * [x0, x1, y0, y1, z0, z1]. Call update(t) with each stone's arrival given by start + order.
 */
export function stones(scene, { count, region, size = [0.05, 0.12], colors, seed = 5, start = 0, spread = 1, fall = 2.5, dur = 0.5, order = "x", place }) {
  const rand = rng(seed);
  const geo = new THREE.IcosahedronGeometry(1, 1);
  // Roughen the icosahedron so each stone is angular.
  const pos = geo.attributes.position;
  const jitter = new Map();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!jitter.has(key)) jitter.set(key, 0.75 + rand() * 0.4);
    const s = jitter.get(key);
    pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s, pos.getZ(i) * s);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.92, flatShading: true });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const [x0, x1, y0, y1, z0, z1] = region;
  const items = [];
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const p = place ? place(rand) : new THREE.Vector3(x0 + rand() * (x1 - x0), y0 + rand() * (y1 - y0), z0 + rand() * (z1 - z0));
    const s = size[0] + rand() * (size[1] - size[0]);
    const scale = new THREE.Vector3(s * (0.8 + rand() * 0.5), s * (0.55 + rand() * 0.3), s * (0.8 + rand() * 0.5));
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 6, rand() * 6, rand() * 6));
    const k = order === "x" ? (p.x - x0) / (x1 - x0) : rand();
    items.push({ p, scale, q, at: start + k * spread + rand() * 0.25 });
    color.set(colors[Math.floor(rand() * colors.length)]).offsetHSL(0, 0, (rand() - 0.5) * 0.08);
    mesh.setColorAt(i, color);
  }
  scene.add(mesh);
  const m = new THREE.Matrix4();
  const tmp = new THREE.Vector3();
  const zero = new THREE.Vector3(0, 0, 0);
  function update(t) {
    for (let i = 0; i < count; i++) {
      const it = items[i];
      const u = span(t, it.at, it.at + dur);
      if (u <= 0) {
        m.compose(it.p, it.q, zero);
      } else {
        const fallU = 1 - (1 - u) * (1 - u);
        tmp.copy(it.p);
        tmp.y += (1 - fallU) * fall;
        m.compose(tmp, it.q, it.scale);
      }
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  update(-1);
  return { mesh, update };
}

// ---------- boxes, sheets and rolls ----------

/** A box whose faces use `mat`; with UVs scaled to its size so textures keep their scale. */
export function slab(scene, { size, pos, mat, texScale = 1 }) {
  const geo = new THREE.BoxGeometry(...size);
  const uv = geo.attributes.uv;
  const [sx, sy, sz] = size;
  // Box faces in order +x,-x,+y,-y,+z,-z, 4 verts each.
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++)
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / texScale, (uv.getY(i) * dims[f][1]) / texScale);
    }
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(...pos);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

/**
 * A sheet that unrolls along +x from x0 to x1 at height y, width along z, with its roll.
 * update(u) sets progress 0..1.
 */
export function unrollSheet(scene, { x0, x1, y, z0, z1, mat, thickness = 0.015, rollColor = 0xffffff, rollMat, radius = 0.16, texScale = 1 }) {
  const len = x1 - x0;
  const width = z1 - z0;
  const geo = new THREE.BoxGeometry(1, thickness, width);
  geo.translate(0.5, 0, 0);
  const sheet = new THREE.Mesh(geo, mat);
  sheet.position.set(x0, y + thickness / 2, (z0 + z1) / 2);
  sheet.receiveShadow = true;
  sheet.castShadow = true;
  scene.add(sheet);
  const rollGeo = new THREE.CylinderGeometry(1, 1, width * 1.02, 40);
  rollGeo.rotateX(Math.PI / 2);
  const roll = new THREE.Mesh(rollGeo, rollMat ?? mat);
  roll.castShadow = true;
  scene.add(roll);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, width * 1.04, 16).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.8 }));
  roll.add(core);
  function update(u) {
    u = clamp01(u);
    sheet.visible = u > 0.001;
    sheet.scale.x = Math.max(0.0001, u * len);
    if (mat.map) {
      mat.map.repeat.x = (u * len) / texScale;
    }
    const r = radius * Math.sqrt(1 - 0.75 * u) ;
    roll.visible = u > 0.001 && u < 0.999;
    roll.scale.set(r, r, 1);
    core.scale.set(1 / r, 1 / r, 1);
    roll.position.set(x0 + u * len, y + r, (z0 + z1) / 2);
    roll.rotation.z = -(u * len) / radius;
  }
  update(0);
  return { sheet, roll, update };
}

/** A geogrid: a mesh of thin ribs, revealed along +x by update(u). */
export function geogrid(scene, { x0, x1, y, z0, z1, pitch = 0.16, rib = 0.025, color = 0x1d1f22, thickness = 0.012 }) {
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
  const len = x1 - x0,
    width = z1 - z0;
  const nx = Math.round(len / pitch),
    nz = Math.round(width / pitch);
  const along = new THREE.InstancedMesh(new THREE.BoxGeometry(1, thickness, rib), mat, nz + 1);
  const across = new THREE.InstancedMesh(new THREE.BoxGeometry(rib * 1.4, thickness * 1.6, width), mat, nx + 1);
  const m = new THREE.Matrix4();
  for (let j = 0; j <= nz; j++) {
    m.makeTranslation(0.5, 0, z0 + j * (width / nz));
    along.setMatrixAt(j, m);
  }
  along.geometry.translate(0, 0, 0);
  group.add(along, across);
  along.castShadow = across.castShadow = true;
  scene.add(group);
  group.position.y = y + thickness;
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, width * 1.02, 32).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
  roll.castShadow = true;
  scene.add(roll);
  function update(u) {
    u = clamp01(u);
    const x = u * len;
    group.visible = u > 0.001;
    // Ribs along x stretch to the unrolled length.
    for (let j = 0; j <= nz; j++) {
      m.makeScale(Math.max(0.0001, x), 1, 1).premultiply(new THREE.Matrix4().makeTranslation(x0, 0, z0 + j * (width / nz)));
      along.setMatrixAt(j, m);
    }
    along.geometry.boundingSphere = null;
    along.instanceMatrix.needsUpdate = true;
    let shown = 0;
    for (let i = 0; i <= nx; i++) {
      const px = i * (len / nx);
      if (px <= x) {
        m.makeTranslation(x0 + px, 0, (z0 + z1) / 2);
        across.setMatrixAt(shown++, m);
      }
    }
    across.count = shown;
    across.instanceMatrix.needsUpdate = true;
    const r = 0.14 * Math.sqrt(1 - 0.75 * u);
    roll.visible = u > 0.001 && u < 0.999;
    roll.scale.set(r, r, 1);
    roll.position.set(x0 + x, y + r, (z0 + z1) / 2);
    roll.rotation.z = -x / 0.14;
  }
  // Base geometry for "along" ribs spans 0..1 in x.
  along.geometry.dispose();
  along.geometry = new THREE.BoxGeometry(1, thickness, rib).translate(0.5, 0, 0);
  update(0);
  return { group, update };
}

// ---------- labels ----------

/**
 * HTML labels pinned at screen positions with a leader line to a 3D point.
 * Each: { text, sub, anchor:[x,y,z], at, pos:[px,py], side:"left"|"right", ours }.
 * pos is the pill's attach point: its right edge for side "left", its left edge for "right".
 */
export function labels(stage, camera, list) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", W);
  svg.setAttribute("height", H);
  svg.style.cssText = "position:absolute;inset:0;pointer-events:none";
  stage.appendChild(svg);
  const els = list.map((l) => {
    const el = document.createElement("div");
    el.className = "lab" + (l.ours ? " ours" : "");
    el.innerHTML = `<div class="pill">${l.text}${l.sub ? `<small>${l.sub}</small>` : ""}</div>`;
    el.style.opacity = 0;
    stage.appendChild(el);
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("stroke", "#0f172a");
    line.setAttribute("stroke-opacity", "0.8");
    line.setAttribute("stroke-width", "2");
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("r", "6");
    dot.setAttribute("fill", "#ffffff");
    dot.setAttribute("stroke", "#0f172a");
    dot.setAttribute("stroke-width", "2.5");
    svg.append(line, dot);
    return { el, l, line, dot, anchor: new THREE.Vector3(...l.anchor) };
  });
  const v = new THREE.Vector3();
  return function update(t) {
    for (const { el, l, line, dot, anchor } of els) {
      const u = easeOut(span(t, l.at, l.at + 0.5));
      el.style.opacity = u;
      line.setAttribute("opacity", u);
      dot.setAttribute("opacity", u);
      v.copy(anchor).project(camera);
      const ax = (v.x * 0.5 + 0.5) * W;
      const ay = (-v.y * 0.5 + 0.5) * H;
      const [px, py] = l.pos;
      const left = l.side === "left";
      el.style.left = px + "px";
      el.style.top = py + "px";
      el.style.transform = `translate(${left ? "-100%" : "0"}, -50%) translateX(${(1 - u) * (left ? -12 : 12)}px)`;
      line.setAttribute("x1", px);
      line.setAttribute("y1", py);
      line.setAttribute("x2", ax);
      line.setAttribute("y2", ay);
      dot.setAttribute("cx", ax);
      dot.setAttribute("cy", ay);
    }
  };
}


// ---------- profiles ----------

/**
 * A solid from a 2D profile in the XY plane (points [[x, y], ...], counter-clockwise),
 * extruded along Z from z0 to z1. Texture coordinates are in world units / texScale.
 */
export function profile(scene, { points, z0, z1, mat, texScale = 1.5 }) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false, steps: 1 });
  geo.translate(0, 0, z0);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / texScale, uv.getY(i) / texScale);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

/** A thin band following a polyline in XY (a liner), extruded along Z. */
export function band(scene, { line, thickness = 0.03, z0, z1, mat }) {
  // Offset the polyline upward-inward by thickness to make a closed thin shape.
  const top = line.map(([x, y]) => [x, y + thickness]);
  const pts = [...line, ...top.reverse()];
  return profile(scene, { points: pts, z0, z1, mat, texScale: 1 });
}

/** A clipping plane keeping points where normal·p <= c... (three keeps the positive side). */
export function clipPlane(nx, ny, nz, c) {
  return new THREE.Plane(new THREE.Vector3(nx, ny, nz), c);
}

/** [xmin, xmax] where the horizontal line at y crosses a closed polygon, or null. */
export function widthAt(poly, y) {
  const xs = [];
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
  }
  if (xs.length < 2) return null;
  return [Math.min(...xs), Math.max(...xs)];
}

/** Grass blades scattered by place(rand) -> Vector3, growing with update(u per blade). */
export function grassBlades(scene, { count, place, seed = 9, height = [0.06, 0.12], start = 0, spread = 1, order }) {
  const rand = rng(seed);
  const geo = new THREE.ConeGeometry(0.012, 1, 3).translate(0, 0.5, 0);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.8 });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.castShadow = true;
  const items = [];
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const p = place(rand);
    const h = height[0] + rand() * (height[1] - height[0]);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - 0.5) * 0.5, rand() * 6, (rand() - 0.5) * 0.5));
    items.push({ p, h, q, at: start + (order ? order(p) : rand()) * spread });
    color.set(["#4f7a30", "#6b9640", "#8aae55", "#3e6426"][Math.floor(rand() * 4)]);
    mesh.setColorAt(i, color);
  }
  scene.add(mesh);
  const m = new THREE.Matrix4();
  const s = new THREE.Vector3();
  function update(t) {
    for (let i = 0; i < count; i++) {
      const it = items[i];
      const u = easeOut(span(t, it.at, it.at + 0.6));
      s.set(1, Math.max(0.0001, u * it.h), 1);
      m.compose(it.p, it.q, u > 0 ? s : new THREE.Vector3(0, 0, 0));
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
  update(-1);
  return { mesh, update };
}

export const WASTE = () =>
  material(
    noiseTexture({
      seed: 91,
      dark: "#4e4a43",
      light: "#7d776c",
      repeat: [1, 1],
      speckles: [
        { count: 900, min: 2, max: 6, colors: ["#5d5a55", "#8a8478", "#3b3936", "#6b6252"] },
        { count: 160, min: 2, max: 5, colors: ["#3f6fa8", "#b8413a", "#d8d2c4", "#4d7d4a", "#c9a23a"] },
      ],
    }),
    { bumpScale: 0.8 },
  );
