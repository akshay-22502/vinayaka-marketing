// Home page hero: a biaxial geogrid unrolls in the dark, the camera dives to a junction,
// aggregate rains into the apertures, then the road section builds up around it.
// render(p) takes scroll progress 0..1. Frame size comes from ?w=&h= on the page URL.
import { THREE, RoundedBoxGeometry, MAT, slab, stones, ease, span, clamp01 } from "./lib.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export default async function (stage) {
  const q = new URLSearchParams(location.search);
  const W = Number(q.get("w") || 1280);
  const H = Number(q.get("h") || 720);
  const portrait = H > W;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  // Portrait frames keep about the same horizontal view, so the vertical field is wider.
  const camera = new THREE.PerspectiveCamera(portrait ? 58 : 30, W / H, 0.01, 200);
  // The page sets copy on the left (landscape) or at the top (portrait): move the subject clear of it.
  if (portrait) camera.setViewOffset(W, H, 0, -0.16 * H, W, H);
  else camera.setViewOffset(W, H, -0.13 * W, 0, W, H);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;

  scene.add(new THREE.HemisphereLight(0x9fb4e0, 0x10141c, 0.55));
  const key = new THREE.DirectionalLight(0xfff6ec, 2.7);
  key.position.set(-5, 10, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 40 });
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.01;
  scene.add(key);
  // Warm brand-orange rim from behind, cool fill from the camera side.
  const rim = new THREE.DirectionalLight(0xff8a3d, Number(new URLSearchParams(location.search).get("rim") ?? 1.3));
  rim.position.set(6, 0.4, -8);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0x8fb0ff, 0.6);
  fill.position.set(-2, 3, 10);
  scene.add(fill);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.ShadowMaterial({ opacity: 0.55 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.002;
  floor.receiveShadow = true;
  scene.add(floor);

  // ---------- the geogrid ----------
  const X0 = -4, X1 = 4, Z0 = -2.4, Z1 = 2.4, P = 0.4;
  const nx = Math.round((X1 - X0) / P), nz = Math.round((Z1 - Z0) / P);
  const gridMat = new THREE.MeshStandardMaterial({ color: 0x2b2e34, roughness: 0.38, metalness: 0.05 });
  const T = 0.028; // rib thickness
  // Ribs run between junctions; each is a rounded bar a little shorter than the pitch.
  const ribX = new THREE.InstancedMesh(new RoundedBoxGeometry(P - 0.08, T * 0.8, 0.055, 2, 0.011), gridMat, nx * (nz + 1));
  const ribZ = new THREE.InstancedMesh(new RoundedBoxGeometry(0.068, T * 0.75, P - 0.08, 2, 0.011), gridMat, (nx + 1) * nz);
  const nodeGeo = new RoundedBoxGeometry(0.13, T * 1.35, 0.13, 3, 0.035);
  const node = new THREE.InstancedMesh(nodeGeo, gridMat, (nx + 1) * (nz + 1));
  for (const m of [ribX, ribZ, node]) {
    m.castShadow = m.receiveShadow = true;
    m.frustumCulled = false;
    scene.add(m);
  }
  const ribsX = [], ribsZ = [], nodes = [];
  for (let i = 0; i <= nx; i++)
    for (let j = 0; j <= nz; j++) {
      const x = X0 + i * P, z = Z0 + j * P;
      nodes.push([x, z]);
      if (i < nx) ribsX.push([x + P / 2, z, x + P]);
      if (j < nz) ribsZ.push([x, z + P / 2, x]);
    }
  // The roll: a cylinder wrapped in a grid texture.
  const tc = document.createElement("canvas");
  tc.width = tc.height = 256;
  const g = tc.getContext("2d");
  g.fillStyle = "#000";
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = "#fff";
  g.fillRect(0, 0, 256, 34);
  g.fillRect(0, 0, 30, 256);
  const alpha = new THREE.CanvasTexture(tc);
  alpha.wrapS = alpha.wrapT = THREE.RepeatWrapping;
  const rollMat = new THREE.MeshStandardMaterial({ color: 0x2b2e34, roughness: 0.4, alphaMap: alpha, alphaTest: 0.5, side: THREE.DoubleSide });
  const R0 = 0.42;
  const roll = new THREE.Group();
  const rollLayers = [];
  for (let k = 0; k < 7; k++) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, Z1 - Z0 + 0.06, 64, 1, true).rotateX(Math.PI / 2), rollMat);
    mesh.castShadow = true;
    rollLayers.push(mesh);
    roll.add(mesh);
  }
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, Z1 - Z0 + 0.12, 24).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9a7a52, roughness: 0.7 }));
  core.castShadow = true;
  roll.add(core);
  scene.add(roll);

  const m4 = new THREE.Matrix4();
  const zero = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const pos = new THREE.Vector3();
  const qI = new THREE.Quaternion();
  function setGrid(u) {
    const reach = X0 + u * (X1 - X0);
    const place = (mesh, list, y, test) => {
      list.forEach((r, i) => {
        const shown = test(r);
        pos.set(r[0], y, r[1]);
        m4.compose(pos, qI, shown ? one : zero);
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
    place(ribX, ribsX, T / 2, (r) => r[2] <= reach + 1e-6);
    place(ribZ, ribsZ, T / 2, (r) => r[2] <= reach + 1e-6);
    place(node, nodes, (T * 1.35) / 2, (n) => n[0] <= reach + 1e-6);
    const r = R0 * Math.sqrt(1 - 0.9 * u);
    roll.visible = u < 0.999;
    rollLayers.forEach((mesh, k) => {
      const rk = Math.max(0.1, r - k * 0.045);
      mesh.scale.set(rk, rk, 1);
      mesh.visible = rk > 0.1;
    });
    alpha.repeat.set(14, nz);
    roll.position.set(reach + 0.02, r + 0.002, (Z0 + Z1) / 2);
    roll.rotation.z = -(u * (X1 - X0)) / R0;
  }

  // ---------- aggregate falling into the apertures ----------
  const stoneColors = ["#6f7277", "#80838a", "#5e6166", "#8d877c", "#756c61", "#55585d", "#9a958c"];
  const rain = stones(scene, {
    count: 4200,
    region: [X0, X1, 0, 0.1, Z0, Z1],
    size: [0.04, 0.085],
    colors: stoneColors,
    seed: 17,
    start: 0,
    spread: 1,
    fall: 3,
    dur: 0.35,
    order: "rand",
    place: (rand) => {
      // Mostly in the aperture centres, so the stones visibly sit between the ribs.
      const i = Math.floor(rand() * nx), j = Math.floor(rand() * nz);
      const jx = (rand() - 0.5) * 0.28, jz = (rand() - 0.5) * 0.28;
      return new THREE.Vector3(X0 + (i + 0.5) * P + jx, 0.035 + rand() * 0.05, Z0 + (j + 0.5) * P + jz);
    },
  });

  // ---------- the road section ----------
  const soilGroup = new THREE.Group();
  const soil = slab(soilGroup, { size: [X1 - X0, 1.4, Z1 - Z0], pos: [0, -0.7 - 0.016, 0], mat: MAT.soil(), texScale: 1.6 });
  soil.castShadow = false;
  const textile = slab(soilGroup, { size: [X1 - X0, 0.014, Z1 - Z0], pos: [0, -0.008, 0], mat: MAT.geotextile(), texScale: 0.8 });
  textile.castShadow = false;
  scene.add(soilGroup);

  const AX = -1.2, BX = 1.1; // aggregate starts at AX, asphalt at BX: a stepped cut-away.
  const agg = slab(scene, { size: [X1 - AX, 1, Z1 - Z0], pos: [0, 0, 0], mat: MAT.aggregateFace(), texScale: 0.9 });
  agg.geometry.translate((X1 + AX) / 2, 0.5, 0);
  agg.position.set(0, 0, 0);
  const aggTop = stones(scene, {
    count: 1800,
    region: [AX + 0.04, X1 - 0.04, 0.33, 0.37, Z0 + 0.04, Z1 - 0.04],
    size: [0.04, 0.085],
    colors: stoneColors,
    seed: 23,
    spread: 1,
    fall: 1.4,
    dur: 0.4,
  });
  const asphalt = slab(scene, { size: [X1 - BX, 0.2, Z1 - Z0], pos: [(X1 + BX) / 2, 0.45, 0], mat: MAT.asphalt(), texScale: 1.1 });
  const paint = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.55 });
  const marks = new THREE.Group();
  for (let x = BX + 0.25; x < X1 - 0.3; x += 0.75) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.006, 0.07), paint);
    m.position.set(x + 0.21, 0.553, 0);
    marks.add(m);
  }
  for (const z of [Z0 + 0.25, Z1 - 0.25]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(X1 - BX - 0.1, 0.006, 0.06), paint);
    m.position.set((X1 + BX) / 2, 0.553, z);
    marks.add(m);
  }
  scene.add(marks);

  rain.mesh.material.color.set(0xa4a4a4);
  aggTop.mesh.material.color.set(0xa4a4a4);
  asphalt.material.color.set(0x8a9099);
  asphalt.material.roughness = 1;

  // ---------- camera path ----------
  // [progress, camera position, look-at]
  const L = portrait
    ? [
        [0.0, [-5.2, 3.2, 6.2], [-3.8, 0, 0]],
        [0.17, [-0.5, 8.2, 6.8], [0, 0, 0.2]],
        [0.36, [0.42, 0.42, 0.62], [0.0, 0.02, 0.0]],
        [0.44, [0.24, 0.36, 0.7], [0.0, 0.02, 0.0]],
        [0.6, [0.6, 4.2, 4.2], [0.0, 0, 0]],
        [0.82, [-7.5, 5.8, 11.5], [0.2, -0.4, 0]],
        [1.0, [-6.4, 5.0, 12.4], [0.5, -0.4, 0]],
      ]
    : [
        [0.0, [-8.2, 3.0, 6.8], [-3.3, 0, 0]],
        [0.17, [-1.4, 4.6, 9.6], [0.4, 0, 0]],
        [0.36, [0.5, 0.36, 0.7], [0.0, 0.02, 0.0]],
        [0.44, [0.3, 0.3, 0.78], [0.0, 0.02, 0.0]],
        [0.6, [0.6, 3.4, 3.6], [0.0, 0, 0]],
        [0.82, [-7.4, 4.7, 10.5], [0.3, -0.45, 0]],
        [1.0, [-6.2, 4.1, 11.6], [0.6, -0.45, 0]],
      ];
  const smooth = (x) => x * x * (3 - 2 * x);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), la = new THREE.Vector3(), lb = new THREE.Vector3();
  function cameraAt(p) {
    let k = 0;
    while (k < L.length - 2 && p > L[k + 1][0]) k++;
    const [p0, c0, l0] = L[k];
    const [p1, c1, l1] = L[k + 1];
    const u = smooth(clamp01((p - p0) / (p1 - p0)));
    // Pull-back moves (big distance change) ease the distance in log space so the dive feels even.
    a.set(...c0);
    b.set(...c1);
    la.set(...l0);
    lb.set(...l1);
    const look = la.clone().lerp(lb, u);
    const d0 = a.clone().sub(la), d1 = b.clone().sub(lb);
    const len = Math.exp(Math.log(d0.length()) * (1 - u) + Math.log(d1.length()) * u);
    const dir = d0.normalize().lerp(d1.normalize(), u).normalize();
    camera.position.copy(look).addScaledVector(dir, len);
    camera.lookAt(look);
  }

  function render(p) {
    cameraAt(p);
    setGrid(ease(span(p, 0.02, 0.2)));
    rain.update(span(p, 0.45, 0.6) * 1.6);
    const s = ease(span(p, 0.62, 0.72));
    soilGroup.visible = s > 0;
    soilGroup.position.y = -(1 - s) * 3;
    const g2 = ease(span(p, 0.72, 0.8));
    agg.visible = g2 > 0;
    agg.scale.y = Math.max(0.0001, g2 * 0.35);
    aggTop.update(g2 >= 1 ? span(p, 0.8, 0.86) * 1.65 : -1);
    const h = ease(span(p, 0.84, 0.92));
    asphalt.visible = h > 0;
    asphalt.position.y = 0.45 + (1 - h) * 2.2;
    const mk = span(p, 0.92, 0.97);
    marks.visible = mk > 0;
    marks.position.y = (1 - h) * 2.2;
    marks.children.forEach((m, i) => (m.visible = i / marks.children.length < mk * 1.05));
    renderer.render(scene, camera);
  }
  render(0);
  return { duration: 1, render };
}
