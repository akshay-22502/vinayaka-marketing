// Shared set-up for the scroll-sequence scenes: renderer, dark studio lighting with a brand-orange
// rim, a shadow floor, and a camera that follows keyframes. Frame size comes from ?w=&h= on the
// page URL; portrait frames get their own camera path.
import { THREE, clamp01 } from "./lib.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export function makeStage(stage, { shadowSize = 7 } = {}) {
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
  renderer.localClippingEnabled = true;
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
  Object.assign(key.shadow.camera, { left: -shadowSize, right: shadowSize, top: shadowSize, bottom: -shadowSize, near: 1, far: 40 });
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.01;
  scene.add(key);
  // Warm brand-orange rim from behind (kept low so flat tops don't turn brown), cool fill from the front.
  const rim = new THREE.DirectionalLight(0xff8a3d, 1.3);
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

  /**
   * Camera along keyframes [progress, position, look-at]. Between two keyframes it eases, and
   * the distance changes in log space so dives and pull-backs feel even.
   */
  function cameraPath(L) {
    const smooth = (x) => x * x * (3 - 2 * x);
    const la = new THREE.Vector3(), lb = new THREE.Vector3(), d0 = new THREE.Vector3(), d1 = new THREE.Vector3();
    return (p) => {
      let k = 0;
      while (k < L.length - 2 && p > L[k + 1][0]) k++;
      const [p0, c0, l0] = L[k];
      const [p1, c1, l1] = L[k + 1];
      const u = smooth(clamp01((p - p0) / (p1 - p0)));
      la.set(...l0);
      lb.set(...l1);
      d0.set(...c0).sub(la);
      d1.set(...c1).sub(lb);
      const look = la.clone().lerp(lb, u);
      const len = Math.exp(Math.log(d0.length()) * (1 - u) + Math.log(d1.length()) * u);
      const dir = d0.normalize().lerp(d1.normalize(), u).normalize();
      camera.position.copy(look).addScaledVector(dir, len);
      camera.lookAt(look);
    };
  }

  return { W, H, portrait, renderer, scene, camera, key, rim, floor, cameraPath };
}
