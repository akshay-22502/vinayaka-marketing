// Geotextile page: a white nonwoven roll unrolls over soft subgrade, the camera dives into the
// fibres, stone is placed on top, then in a cut-away water drains down through stone and fabric
// into the ground. render(p) takes scroll progress 0..1.
import { THREE, MAT, slab, stones, unrollSheet, rng, ease, span } from "./lib.js";
import { makeStage } from "./stage.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Close-up nonwoven texture: thousands of fine curved fibres on an off-white felt. */
function fibreTexture(size = 2048) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  g.fillStyle = "#cfcfc8";
  g.fillRect(0, 0, size, size);
  const rand = rng(77);
  for (let k = 0; k < 26000; k++) {
    const x = rand() * size, y = rand() * size, len = 30 + rand() * 90, a = rand() * Math.PI * 2, bend = (rand() - 0.5) * 1.2;
    const shade = 150 + Math.floor(rand() * 105);
    g.strokeStyle = `rgba(${shade},${shade},${shade - 6},${0.35 + rand() * 0.5})`;
    g.lineWidth = 0.8 + rand() * 1.4;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + bend) * len * 0.5, y + Math.sin(a + bend) * len * 0.5, x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  return map;
}

export default async function (stage) {
  let fibreStrands = null;
  const { portrait, renderer, scene, camera, cameraPath } = makeStage(stage);

  const X0 = -4, X1 = 4, Z0 = -2.4, Z1 = 2.4;
  const clay = MAT.soil();
  slab(scene, { size: [X1 - X0, 1.2, Z1 - Z0], pos: [0, -0.6, 0], mat: clay, texScale: 1.6 });

  const fibres = fibreTexture();
  const fabric = new THREE.MeshStandardMaterial({ color: 0xc4c4be, map: fibres, bumpMap: fibres, bumpScale: 1.2, roughness: 1, side: THREE.DoubleSide });
  const sheet = unrollSheet(scene, { x0: X0, x1: X1, y: 0, z0: Z0, z1: Z1, mat: fabric, thickness: 0.05, radius: 0.3, texScale: 1 });
  fibres.repeat.y = Z1 - Z0;

  // Loose 3D fibres on the surface where the camera dives in, so the close-up has depth.
  {
    const r = rng(19);
    const geos = [];
    for (let k = 0; k < 1300; k++) {
      const cx = -2.45 + (r() - 0.5) * 1.1, cz = 0.15 + (r() - 0.5) * 0.9;
      const a = r() * Math.PI * 2, len = 0.05 + r() * 0.12, lift = 0.002 + r() * 0.01;
      const pts = [0, 0.33, 0.66, 1].map((u, i) => {
        const bend = Math.sin(u * Math.PI) * (r() - 0.5) * 0.04;
        return new THREE.Vector3(cx + Math.cos(a) * len * u - Math.sin(a) * bend, 0.05 + lift * Math.sin(u * Math.PI) + (i % 2) * 0.002, cz + Math.sin(a) * len * u + Math.cos(a) * bend);
      });
      geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.0009 + r() * 0.001, 4, false));
    }
    const merged = mergeGeometries(geos);
    const strands = new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color: 0xdcdcd5, roughness: 0.7 }));
    strands.castShadow = strands.receiveShadow = true;
    scene.add(strands);
    fibreStrands = strands;
  }

  // Stone base over the right-hand part, leaving the fabric showing on the left: a stepped cut-away.
  const AX = -1.0;
  const stoneColors = ["#6f7277", "#80838a", "#5e6166", "#8d877c", "#756c61", "#55585d", "#9a958c"];
  const agg = slab(scene, { size: [X1 - AX, 1, Z1 - Z0], pos: [0, 0, 0], mat: MAT.aggregateFace(), texScale: 0.9 });
  agg.geometry.translate((X1 + AX) / 2, 0.5, 0);
  const TOP = 0.5;
  const drop = stones(scene, { count: 2600, region: [AX + 0.04, X1 - 0.04, TOP - 0.03, TOP + 0.02, Z0 + 0.04, Z1 - 0.04], size: [0.045, 0.09], colors: stoneColors, seed: 31, spread: 1, fall: 2.4, dur: 0.35, order: "rand" });
  drop.mesh.material.color.set(0xa4a4a4);

  // Water drops in the cut-away face: through the stone, through the fabric, into the soil.
  const N = 420;
  const rand = rng(5);
  const dropMat = new THREE.MeshStandardMaterial({ color: 0x5fb4ff, emissive: 0x1d6fd0, emissiveIntensity: 0.9, roughness: 0.1, transparent: true, opacity: 0.95 });
  const drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 10), dropMat, N);
  drops.frustumCulled = false;
  const items = Array.from({ length: N }, () => ({ x: AX + 0.15 + rand() * (X1 - AX - 0.3), at: rand(), r: 0.012 + rand() * 0.01, z: Z1 + 0.035 + rand() * 0.02 }));
  scene.add(drops);
  const m4 = new THREE.Matrix4(), v = new THREE.Vector3(), s = new THREE.Vector3(), q = new THREE.Quaternion();
  function rain(t) {
    // t runs 0..2: each drop falls for 0.6 starting at its own time.
    items.forEach((it, i) => {
      const u = (t - it.at * 1.3) / 0.6;
      if (u <= 0 || u >= 1) {
        m4.makeScale(0, 0, 0);
      } else {
        const y = 0.5 - u * 1.4; // from the top of the stone to deep in the soil
        const fade = y < -0.2 ? Math.max(0, 1 + (y + 0.2) / 0.8) : 1;
        v.set(it.x + Math.sin(u * 9 + i) * 0.015, y, it.z);
        s.set(it.r * fade, it.r * 2.6 * fade, it.r * fade);
        m4.compose(v, q, s);
      }
      drops.setMatrixAt(i, m4);
    });
    drops.instanceMatrix.needsUpdate = true;
  }

  const LAND = [
    [0.0, [-5.4, 1.1, 2.9], [-3.3, 0.15, 0.5]],
    [0.2, [-1.6, 5.0, 8.4], [0.4, 0, 0]],
    [0.32, [-2.1, 0.32, 0.62], [-2.4, 0.02, 0.15]],
    [0.4, [-2.2, 0.42, 0.85], [-2.55, 0.02, 0.15]],
    [0.56, [-3.4, 3.6, 7.2], [0.6, 0.1, 0]],
    [0.66, [1.4, 0.55, 6.2], [1.4, 0.05, 2.4]],
    [0.82, [1.0, 0.7, 6.8], [1.2, 0.0, 2.4]],
    [0.9, [-4.2, 2.6, 8.6], [0.6, -0.1, 0.6]],
    [1.0, [-6.2, 4.0, 9.4], [0.4, -0.3, 0]],
  ];
  const PORT = LAND.map(([p, c, l], i) => {
    const s2 = i === 2 || i === 3 ? 1.15 : i === 5 || i === 6 ? 1.9 : 1.4;
    return [p, c.map((x, k) => l[k] + (x - l[k]) * s2), l];
  });
  const cameraAt = cameraPath(portrait ? PORT : LAND);

  function render(p) {
    cameraAt(p);
    const laid = Math.max(0.002, ease(span(p, 0.02, 0.22)));
    sheet.update(laid);
    fibreStrands.visible = laid * (X1 - X0) + X0 > -1.9;
    const g = ease(span(p, 0.44, 0.52));
    agg.visible = g > 0;
    agg.scale.y = Math.max(0.0001, g * TOP);
    drop.update(span(p, 0.44, 0.58) * 1.6);
    rain(span(p, 0.6, 0.86) * 2);
    renderer.render(scene, camera);
  }
  render(0);
  return { duration: 1, render };
}
