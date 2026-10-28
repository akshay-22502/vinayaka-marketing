// Geocell page: a collapsed panel stretches open into a honeycomb, the camera looks down on the
// cells and into one, then the cells fill with soil and grass grows through.
// render(p) takes scroll progress 0..1.
import { THREE, MAT, slab, stones, grassBlades, ease, span } from "./lib.js";
import { makeStage } from "./stage.js";

/** Perforated strip texture: alpha with rows of round holes, as on perforated HDPE geocell. */
function perforations() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = "#000";
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 6; col++) {
      g.beginPath();
      g.arc(21 + col * 43 + (row % 2) * 21, 26 + row * 38, 8, 0, Math.PI * 2);
      g.fill();
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export default async function (stage) {
  const { portrait, renderer, scene, camera, cameraPath } = makeStage(stage);

  const NS = 11; // strips
  const XL = 3.2; // strips run x in [-XL, XL]
  const LAMBDA = 0.56; // weld spacing pattern
  const HC = 0.26; // cell depth
  const AMAX = 0.21; // half-opening of a cell at full stretch
  const SAMPLES = 260;

  const holes = perforations();
  holes.repeat.set((2 * XL) / 0.32, 1);
  const stripMat = new THREE.MeshStandardMaterial({ color: 0xc9b98f, roughness: 0.55, alphaMap: holes, alphaTest: 0.5, side: THREE.DoubleSide });
  const strips = [];
  for (let j = 0; j < NS; j++) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array((SAMPLES + 1) * 2 * 3);
    const uv = new Float32Array((SAMPLES + 1) * 2 * 2);
    const idx = [];
    for (let k = 0; k <= SAMPLES; k++) {
      uv.set([k / SAMPLES, 0, k / SAMPLES, 1], k * 4);
      if (k < SAMPLES) {
        const a = k * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mesh = new THREE.Mesh(geo, stripMat);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    scene.add(mesh);
    strips.push({ geo, pos });
  }
  // Neighbouring strips touch where cos() = ±1 (the welds), so the cells close up into a honeycomb.
  function stretch(A) {
    strips.forEach(({ geo, pos }, j) => {
      const sign = j % 2 === 0 ? 1 : -1;
      const zc = (j - (NS - 1) / 2) * 2 * A;
      for (let k = 0; k <= SAMPLES; k++) {
        const x = -XL + (k / SAMPLES) * 2 * XL;
        const z = zc + sign * A * Math.cos((2 * Math.PI * x) / LAMBDA);
        pos.set([x, 0, z, x, HC, z], k * 6);
      }
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
    });
  }

  // Ground under the panel, rising into place before the fill.
  const groundMat = MAT.soil();
  const ground = slab(scene, { size: [8.4, 1.2, 6.2], pos: [0, -0.6 - 0.002, 0], mat: groundMat, texScale: 1.6 });
  ground.castShadow = false;
  const zMax = ((NS - 1) / 2) * 2 * AMAX + AMAX;

  // Infill: granular soil poured into the cells, then a topsoil layer, then grass.
  const fill = stones(scene, {
    count: 5200,
    region: [-XL + 0.03, XL - 0.03, 0.03, 0.2, -zMax + 0.03, zMax - 0.03],
    size: [0.028, 0.055],
    colors: ["#7a5c3f", "#8d6b4a", "#6a4f37", "#9c7b58", "#5c4430"],
    seed: 41,
    spread: 1,
    fall: 2.2,
    dur: 0.35,
    order: "rand",
  });
  const top = MAT.soil();
  top.color.set(0x9a7a5c);
  const topsoil = slab(scene, { size: [2 * XL - 0.02, 1, 2 * zMax - 0.04], pos: [0, 0, 0], mat: top, texScale: 0.8 });
  topsoil.geometry.translate(0, 0.5, 0);
  const grass = grassBlades(scene, {
    count: 9000,
    place: (r) => new THREE.Vector3(-XL + 0.05 + r() * (2 * XL - 0.1), HC - 0.035, -zMax + 0.05 + r() * (2 * zMax - 0.1)),
    height: [0.07, 0.16],
    seed: 13,
    spread: 1,
  });

  const LAND = [
    [0.0, [-3.6, 1.3, 2.6], [-1.6, 0.1, 0]],
    [0.27, [0.6, 7.6, 2.2], [0.3, 0, 0]],
    [0.38, [0.42, 0.75, 0.62], [0.0, 0.08, 0.0]],
    [0.47, [0.3, 0.95, 0.8], [0.05, 0.08, 0.0]],
    [0.62, [-4.8, 3.6, 6.4], [0.3, 0, 0]],
    [0.82, [-3.0, 1.5, 4.4], [0.2, 0.15, 0.2]],
    [1.0, [-6.0, 4.0, 8.8], [0.4, -0.2, 0]],
  ];
  const PORT = LAND.map(([p, c, l], i) => {
    const s = i === 2 || i === 3 ? 1.2 : 1.45;
    return [p, c.map((v, k) => l[k] + (v - l[k]) * s), l];
  });
  const cameraAt = cameraPath(portrait ? PORT : LAND);

  function render(p) {
    cameraAt(p);
    stretch(0.006 + ease(span(p, 0.04, 0.28)) * (AMAX - 0.006));
    const g = ease(span(p, 0.5, 0.58));
    ground.visible = g > 0;
    ground.position.y = -0.6 - 0.002 - (1 - g) * 2.5;
    fill.update(span(p, 0.56, 0.7) * 1.6);
    const t = ease(span(p, 0.68, 0.74));
    topsoil.visible = t > 0;
    topsoil.scale.y = Math.max(0.0001, t * (HC - 0.03));
    grass.update(span(p, 0.74, 0.92) * 1.6);
    renderer.render(scene, camera);
  }
  render(0);
  return { duration: 1, render };
}
