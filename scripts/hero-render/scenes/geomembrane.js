// Geomembrane page: black HDPE liner panels unroll into an excavated pond, a glowing weld runs
// along each seam, then water fills the lined basin. render(p) takes scroll progress 0..1.
import { THREE, MAT, noiseTexture, ease, span, clamp01 } from "./lib.js";
import { makeStage } from "./stage.js";

export default async function (stage) {
  const { portrait, renderer, scene, camera, cameraPath } = makeStage(stage);

  // ---------- the excavation ----------
  const SX = 10, SZ = 7; // block size
  const RX = 2.7, RZ = 1.8, BX = 1.5, BZ = 0.7, D = 1.0; // rim and floor half-sizes, depth
  const ground = (x, z) => {
    const tx = clamp01((RX - Math.abs(x)) / (RX - BX));
    const tz = clamp01((RZ - Math.abs(z)) / (RZ - BZ));
    const t = Math.min(tx, tz);
    return -D * t * t * (3 - 2 * t) * 0.15 - D * t * 0.85;
  };
  function heightfield(w, d, nx, nz, cx, cz, lift) {
    const geo = new THREE.PlaneGeometry(w, d, nx, nz).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
      pos.setXYZ(i, x, ground(x, z) + lift, z);
    }
    geo.computeVertexNormals();
    return geo;
  }
  const soilMat = MAT.soil();
  soilMat.map.repeat.set(4, 3);
  soilMat.bumpMap.repeat.set(4, 3);
  const terrain = new THREE.Mesh(heightfield(SX, SZ, 200, 140, 0, 0, 0), soilMat);
  terrain.receiveShadow = true;
  scene.add(terrain);
  // Sides of the block; the top face is the terrain above.
  const hidden = new THREE.MeshBasicMaterial({ visible: false });
  const sideMat = MAT.soil();
  const block = new THREE.Mesh(new THREE.BoxGeometry(SX, 1.6, SZ), [sideMat, sideMat, hidden, sideMat, sideMat, sideMat]);
  block.position.y = -0.8 - 0.001;
  block.receiveShadow = true;
  scene.add(block);

  // ---------- the liner: three panels, unrolled one after another ----------
  const LX0 = -RX - 0.55, LX1 = RX + 0.55, LZ = RZ + 0.55;
  const tex = noiseTexture({ seed: 52, dark: "#141619", light: "#22252a", contrast: 0.25, repeat: [6, 4] });
  const panels = [];
  const width = (2 * LZ) / 3;
  for (let i = 0; i < 3; i++) {
    const z0 = -LZ + i * width - (i > 0 ? 0.06 : 0), z1 = -LZ + (i + 1) * width;
    const clip = new THREE.Plane(new THREE.Vector3(-1, 0, 0), LX0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tex.map, bumpMap: tex.bumpMap, bumpScale: 0.15, roughness: 0.3, metalness: 0, clippingPlanes: [clip], side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(heightfield(LX1 - LX0, z1 - z0, 220, 50, (LX0 + LX1) / 2, (z0 + z1) / 2, 0.018 + i * 0.004), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, z1 - z0 + 0.04, 48).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.25 }));
    roll.castShadow = true;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, z1 - z0 + 0.08, 20).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9a7a52, roughness: 0.7 }));
    roll.add(core);
    scene.add(roll);
    panels.push({ clip, roll, core, zc: (z0 + z1) / 2, seam: z1 });
  }
  function layPanel(i, u) {
    const { clip, roll, core, zc } = panels[i];
    const reach = LX0 + u * (LX1 - LX0);
    clip.constant = reach;
    const r = 0.26 * Math.sqrt(1 - 0.8 * u);
    roll.visible = u > 0 && u < 0.999;
    roll.scale.set(r, r, 1);
    core.scale.set(1 / r, 1 / r, 1);
    roll.position.set(reach, ground(reach, zc) + 0.02 + r, zc);
    roll.rotation.z = -(u * (LX1 - LX0)) / 0.26;
  }

  // ---------- welds along the two seams ----------
  const welds = panels.slice(0, 2).map(({ seam }) => {
    const pts = [];
    for (let k = 0; k <= 200; k++) {
      const x = LX0 + 0.15 + (k / 200) * (LX1 - LX0 - 0.3);
      pts.push(new THREE.Vector3(x, ground(x, seam) + 0.03, seam));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 400, 0.012, 6, false);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2b2e, emissive: 0xff6a1a, emissiveIntensity: 3, roughness: 0.4 });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffc58a }));
    const glow = new THREE.PointLight(0xff7a2a, 2.5, 1.2, 2);
    tip.add(glow);
    scene.add(tip);
    return { curve, geo, mat, mesh, tip, glow };
  });
  function weld(w, u, cool) {
    const n = w.geo.index.count;
    w.mesh.visible = u > 0;
    w.geo.setDrawRange(0, Math.floor((n * u) / 6) * 6);
    w.tip.visible = u > 0 && u < 1;
    if (u > 0) w.tip.position.copy(w.curve.getPointAt(Math.min(u, 1)));
    w.mat.emissiveIntensity = 3 * (1 - cool) + 0.0;
  }

  // ---------- water ----------
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(2 * RX, 2 * RZ, 1, 1).rotateX(-Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: 0x1b4a68, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.9, envMapIntensity: 2.2, clearcoat: 1 }),
  );
  scene.add(water);

  // ---------- camera ----------
  const LAND = [
    [0.0, [-6.6, 2.6, 6.2], [-2.6, -0.3, 0]],
    [0.3, [-0.8, 6.6, 8.4], [0.2, -0.5, 0]],
    [0.42, [-3.75, 0.5, 1.75], [-2.85, 0.0, 0.6]],
    [0.58, [-2.3, 0.9, 2.3], [-1.3, -0.4, 0.6]],
    [0.7, [0.6, 7.6, 7.2], [0.1, -0.7, 0]],
    [0.86, [-5.2, 4.2, 8.0], [0.2, -0.6, 0]],
    [1.0, [-6.4, 4.4, 9.2], [0.3, -0.6, 0]],
  ];
  // Portrait: same shots from further back, except the close-ups.
  const PORT = LAND.map(([p, c, l], i) => {
    const s = i === 2 || i === 3 ? 1.15 : 1.4;
    return [p, c.map((v, k) => l[k] + (v - l[k]) * s), l];
  });
  const cameraAt = cameraPath(portrait ? PORT : LAND);

  function render(p) {
    cameraAt(p);
    for (let i = 0; i < 3; i++) layPanel(i, ease(span(p, 0.04 + i * 0.09, 0.16 + i * 0.09)));
    const cool = span(p, 0.62, 0.7);
    weld(welds[0], span(p, 0.4, 0.6), cool);
    weld(welds[1], span(p, 0.44, 0.62), cool);
    const f = ease(span(p, 0.66, 0.86));
    water.visible = f > 0;
    water.position.y = -D + 0.03 + f * (D - 0.26);
    renderer.render(scene, camera);
  }
  render(0);
  return { duration: 1, render };
}
