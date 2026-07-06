// diorama.js — LOOKTURA «Магазинам» hero
// A pastel TOY-STORE diorama on a long winding street: the boutique sits at the
// end of a curving road lined with colourful little houses, trees and greenery,
// under a gradient sky.
//
// Flow: a FAST intro flies the camera down from a wide aerial hero to the start
// of the road (decoupled from scroll). Then scroll drives a slow, horizon-level
// glide along the long road (following a red dashed route that lays itself out
// ahead) to a centred, pulled-back arrival on the storefront — where the form
// appears.
//
// API (createDiorama): .ready .setProgress(0..1) .playIntro() .renderAt(p)
//   .renderIntroAt(u) .setMouse(x,y) .resize() .play() .pause() .destroy() .onReady(cb)

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const V = (x, y, z) => new THREE.Vector3(x, y, z);

export function createDiorama(container, opts = {}) {
  const { storeUrl = 'assets/models/store.glb', debug = false, reducedMotion = false,
          damping = 0.0067, posDamp = 0.04, sway = 0.03 } = opts;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 400);

  // gradient pastel sky as the scene background
  (() => {
    const c = document.createElement('canvas'); c.width = 8; c.height = 256;
    const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#A6CFF2'); g.addColorStop(0.55, '#CFE3F4'); g.addColorStop(1, '#FBE2EC');
    x.fillStyle = g; x.fillRect(0, 0, 8, 256);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
  })();

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const amb = new THREE.AmbientLight(0xffffff, 0.34); scene.add(amb);
  const key = new THREE.DirectionalLight(0xfff4e6, 3.1);
  key.position.set(12, 22, 36); key.castShadow = true;
  key.target.position.set(0, 0, 17); scene.add(key.target);
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1; key.shadow.camera.far = 110; key.shadow.bias = -0.0004;
  key.shadow.camera.left = -15; key.shadow.camera.right = 15; key.shadow.camera.top = 33; key.shadow.camera.bottom = -33;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfeaff, 0.65); fill.position.set(-9, 5, 18); scene.add(fill);

  const world = new THREE.Group(); scene.add(world);
  const mat = (c, r = 0.9, flat = true) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: 0, flatShading: flat, envMapIntensity: 0.45 });

  // nudge a colour a touch less pastel (more saturated, slightly deeper) — leaves glowy/white bits alone
  const _hsl = {};
  function lessPastel(material, ds, dl = 0) {
    if (!material || !material.color) return;
    const e = material.emissive; if (e && (e.r + e.g + e.b) > 0.002) return;
    material.color.getHSL(_hsl);
    material.color.setHSL(_hsl.h, Math.min(1, _hsl.s * (1 + ds)), Math.max(0, Math.min(1, _hsl.l + dl)));
  }
  function dePastelGroup(group, ds, dl = 0) {
    const seen = new Set();
    group.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) if (m && !seen.has(m)) { seen.add(m); lessPastel(m, ds, dl); }
    });
  }

  // ---- long winding road centreline (t=0 at the shop door, t=1 far away) --
  const ROAD = new THREE.CatmullRomCurve3([
    V(0, 0, 1.2), V(0.12, 0, 4.8), V(-0.6, 0, 8.4), V(0.52, 0, 12.0),
    V(-0.48, 0, 15.6), V(0.34, 0, 19.2), V(-0.42, 0, 22.8), V(0.46, 0, 26.4),
    V(-0.36, 0, 30.0), V(0.22, 0, 33.3), V(0, 0, 36.5),
  ], false, 'catmullrom', 0.5);

  // ---- floating base island + green ground -------------------------------
  function stadium(B, L, h, color, rough = 0.95) {
    const g = new THREE.Group(); const m2 = mat(color, rough, false);
    const body = new THREE.Mesh(new THREE.BoxGeometry(B, h, L - B), m2); g.add(body);
    [-(L - B) / 2, (L - B) / 2].forEach((z) => { const cap = new THREE.Mesh(new THREE.CylinderGeometry(B / 2, B / 2, h, 48), m2); cap.position.z = z; g.add(cap); });
    g.traverse((o) => { if (o.isMesh) o.receiveShadow = true; }); return g;
  }
  const LANE_Z = 17.5;
  const base = stadium(12.4, 44, 0.65, 0xC9B4DD); base.position.set(0, -0.32, LANE_Z); world.add(base);
  const grass = stadium(11.9, 43.4, 0.14, 0xAEDB99); grass.position.set(0, 0, LANE_Z); world.add(grass);

  // ---- flat ribbon following a curve (sidewalk + road) -------------------
  function ribbon(curve, halfW, y, color, segs = 220, rough = 1) {
    const pts = curve.getSpacedPoints(segs); const pos = []; const up = V(0, 1, 0);
    for (let i = 0; i < pts.length; i++) {
      const t = i / (pts.length - 1); const tan = curve.getTangentAt(t);
      const perp = new THREE.Vector3().crossVectors(up, tan).normalize();
      const l = pts[i].clone().addScaledVector(perp, halfW);
      const r = pts[i].clone().addScaledVector(perp, -halfW);
      pos.push(l.x, y, l.z, r.x, y, r.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const idx = [];
    for (let i = 0; i < pts.length - 1; i++) { const a = i * 2, b = i * 2 + 1, c = (i + 1) * 2, d = (i + 1) * 2 + 1; idx.push(a, b, c, b, d, c); }
    geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat(color, rough, false)); m.receiveShadow = true; return m;
  }
  world.add(ribbon(ROAD, 1.5, 0.09, 0xDAD4E0));   // sidewalk band
  world.add(ribbon(ROAD, 0.95, 0.11, 0xC2BBCF));  // road

  // ---- props + greenery --------------------------------------------------
  const GREENS = [0x86C98E, 0x9AD89F, 0x74BE84, 0x8FD49B];
  function tree(x, z, s = 1) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 0.6, 8), mat(0xB98C68, 1)); trunk.position.y = 0.3; trunk.castShadow = true; g.add(trunk);
    const c1 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.52, 0), mat(GREENS[Math.abs(Math.round(x * 3 + z)) % 4], 1)); c1.position.y = 0.92; c1.castShadow = true; g.add(c1);
    const c2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 0), mat(0x9AD89F, 1)); c2.position.set(0.22, 1.22, 0.05); c2.castShadow = true; g.add(c2);
    g.position.set(x, 0.1, z); g.scale.setScalar(s); world.add(g); return g;
  }
  function bush(x, z, s = 1) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.38, 0), mat(0x86C98E, 1)); b.position.set(x, 0.26, z); b.scale.setScalar(s); b.castShadow = true; b.receiveShadow = true; world.add(b); return b; }
  function lamp(x, z) {
    const g = new THREE.Group();
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.35, 8), mat(0x5C4A70, 0.7)); post.position.y = 0.67; post.castShadow = true; g.add(post);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 14), new THREE.MeshStandardMaterial({ color: 0xFFF1C0, emissive: 0xFFE39A, emissiveIntensity: 1.0, roughness: 0.4 })); head.position.y = 1.4; g.add(head);
    g.position.set(x, 0.1, z); world.add(g); return g;
  }
  function bench(x, z, rot) {
    const g = new THREE.Group(); const wood = mat(0xCBA07A, 0.9, false);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.06, 0.28), wood); seat.position.y = 0.28; seat.castShadow = true; g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.28, 0.05), wood); back.position.set(0, 0.42, -0.12); g.add(back);
    [-0.32, 0.32].forEach((dx) => { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.24), mat(0x9E8BAF, 0.7, false)); leg.position.set(dx, 0.14, 0); g.add(leg); });
    g.position.set(x, 0.1, z); g.rotation.y = rot; world.add(g); return g;
  }
  const BCOL = [
    { b: 0xF6B4D6, r: 0xE48BC0 }, { b: 0xB7D6F6, r: 0x8FB6E8 }, { b: 0xF7E0A2, r: 0xE6C36A },
    { b: 0xCBB2EE, r: 0xA98BDE }, { b: 0xA8E6D2, r: 0x79CDB6 }, { b: 0xF6C6A6, r: 0xE49E76 }, { b: 0xE7BEF0, r: 0xC98FDE },
  ];
  function building(pt, dir, i) {
    const g = new THREE.Group();
    const w = 1.25 + (i % 3) * 0.3, h = 1.05 + (i % 4) * 0.42, d = 1.35 + (i % 2) * 0.3;
    const col = BCOL[i % BCOL.length];
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(col.b, 0.9, false)); body.position.y = h / 2; body.castShadow = true; body.receiveShadow = true; g.add(body);
    if (i % 2) {
      const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 0.74, 0.72, 4), mat(col.r, 0.88, true)); roof.position.y = h + 0.34; roof.rotation.y = Math.PI / 4; roof.castShadow = true; g.add(roof);
    } else {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, 0.2, d + 0.14), mat(col.r, 0.9, false)); roof.position.y = h + 0.1; roof.castShadow = true; g.add(roof);
      const ch = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.36, 0.18), mat(col.r, 0.9, false)); ch.position.set(w * 0.28, h + 0.32, -d * 0.2); ch.castShadow = true; g.add(ch);
    }
    const fz = d / 2 + 0.03;
    const win = (wx, wy) => {
      const fr = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.58, 0.03), mat(0xffffff, 0.6, false)); fr.position.set(wx, wy, fz - 0.01); g.add(fr);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.04), mat(0xCFEFF7, 0.35, false)); m.position.set(wx, wy, fz); g.add(m);
    };
    win(-w * 0.26, h * 0.62); win(w * 0.26, h * 0.62);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.7, 0.05), mat(col.r, 0.6, false)); door.position.set(0, 0.35, fz); g.add(door);
    const aw = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, 0.1, 0.34), mat(0xffffff, 0.7, false)); aw.position.set(0, h * 0.4, fz + 0.14); aw.castShadow = true; g.add(aw);
    g.position.set(pt.x, 0.1, pt.z);
    g.rotation.y = Math.atan2(dir.x, dir.z);
    world.add(g); return h;
  }

  // line the long winding road with shops, trees and greenery
  const buildingTops = [];
  const segCount = 14, UP = V(0, 1, 0);
  for (let i = 0; i < segCount; i++) {
    const t = 0.07 + (i / (segCount - 1)) * 0.88;
    const pt = ROAD.getPointAt(t), tan = ROAD.getTangentAt(t);
    const perp = new THREE.Vector3().crossVectors(UP, tan).normalize();
    const side = i % 2 ? 1 : -1;
    const bp = pt.clone().addScaledVector(perp, side * 3.0);
    const face = pt.clone().sub(bp).setY(0).normalize();
    const h = building(bp, face, i);
    buildingTops.push({ x: bp.x, z: bp.z, top: h });
    tree(pt.x + perp.x * -side * 2.4, pt.z + perp.z * -side * 2.4, 0.95 + (i % 3) * 0.12);
    tree(pt.x + perp.x * side * 3.5, pt.z + perp.z * side * 3.5, 0.9 + (i % 2) * 0.2);
    if (i % 2) bush(pt.x + perp.x * -side * 1.75, pt.z + perp.z * -side * 1.75, 0.9);
  }
  for (let i = 0; i < 24; i++) {
    const t = Math.min(0.99, 0.035 + i * 0.04);
    const pt = ROAD.getPointAt(t), tan = ROAD.getTangentAt(t);
    const perp = new THREE.Vector3().crossVectors(UP, tan).normalize();
    const s = i % 2 ? 1 : -1;
    tree(pt.x + perp.x * s * 1.95, pt.z + perp.z * s * 1.95, 0.78 + (i % 3) * 0.16);
    if (i % 3 === 0) bush(pt.x + perp.x * -s * 2.2, pt.z + perp.z * -s * 2.2, 0.85);
  }
  [[0.12, 1.2], [0.28, -1.2], [0.44, 1.1], [0.6, -1.1], [0.76, 1.2], [0.9, -1.0]].forEach(([t, dx]) => { const p = ROAD.getPointAt(t); lamp(p.x + dx, p.z); });
  [[0.22, 1.3, 1.0], [0.42, -1.3, -1.0], [0.6, 1.3, 1.0], [0.8, -1.3, -1.0]].forEach(([t, dx, rot]) => { const p = ROAD.getPointAt(t); bench(p.x + dx, p.z, rot); });
  bush(1.4, 1.0, 0.85); bush(-1.5, 0.7, 0.95); bush(1.5, -0.7, 0.75); bush(-1.4, -0.5, 0.8);

  // make the whole scene a touch less pastel / more colourful (soft, just a nudge)
  dePastelGroup(world, 0.15, -0.012);

  // ---- clouds ------------------------------------------------------------
  function cloud(x, y, z, s) {
    const g = new THREE.Group();
    const cm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, emissive: 0xfff6fb, emissiveIntensity: 0.16, flatShading: true, envMapIntensity: 0.3 });
    [[0, 0, 0, 0.52], [0.62, 0.06, 0.05, 0.45], [-0.6, 0.05, -0.05, 0.43], [0.24, 0.24, 0.08, 0.37], [-0.22, 0.2, 0.06, 0.33], [1.08, -0.02, 0, 0.31]].forEach(([dx, dy, dz, r]) => {
      const p = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), cm);
      p.position.set(dx, dy, dz); g.add(p);
    });
    g.position.set(x, y, z); g.scale.setScalar(s); scene.add(g); return g;
  }
  cloud(-9, 9, 5, 1.5); cloud(8, 11, 14, 2.0); cloud(-2, 12.5, 22, 1.6); cloud(6, 9.5, 2, 1.3);
  cloud(-8, 13.8, 28, 1.5); cloud(8, 14.6, 23, 1.6); cloud(2, 13.2, 33, 1.4); cloud(-5, 11.6, 17, 1.3);
  // cute clouds framed in the sky band behind the store for the final arrival shot
  cloud(-4.6, 3.5, -4.5, 1.05); cloud(4.7, 3.95, -6, 1.25); cloud(0.5, 4.45, -9.5, 1.4); cloud(-7.4, 4.1, -5, 1.0); cloud(7.3, 3.6, -3.8, 0.95);
  // high clouds that fill the sky for the "in the clouds" hero (camera starts up here)
  cloud(-6, 15.5, 30, 2.0); cloud(7.5, 16.8, 33, 2.2); cloud(0.5, 18.4, 26, 1.8); cloud(-10, 14, 23, 1.7);
  cloud(10, 14.6, 21, 1.8); cloud(3.5, 17, 38, 1.9); cloud(-3, 13.2, 18, 1.5);

  // ---- flat red map marker over the store (billboard sprite) -------------
  function flatPin() {
    const c = document.createElement('canvas'); c.width = 224; c.height = 288;
    const x = c.getContext('2d');
    const cx = 112, cyc = 100, R = 86, tipY = 264;
    x.fillStyle = 'rgba(150,28,20,0.16)';                 // soft contact shadow near the tip
    x.beginPath(); x.ellipse(cx, tipY - 4, R * 0.32, 11, 0, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#F0322A';                              // red body: round head + pointed tip
    x.beginPath(); x.arc(cx, cyc, R, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.moveTo(cx - R * 0.66, cyc + R * 0.52); x.lineTo(cx + R * 0.66, cyc + R * 0.52); x.lineTo(cx, tipY); x.closePath(); x.fill();
    x.fillStyle = '#ffffff';                              // white centre hole
    x.beginPath(); x.arc(cx, cyc, R * 0.40, 0, Math.PI * 2); x.fill();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
    sp.scale.set(1.02, 1.31, 1);                          // canvas aspect 224:288
    return sp;
  }
  const mainPin = flatPin(); world.add(mainPin);

  // ---- route dashes along the road (clear gaps) --------------------------
  const routeG = new THREE.Group(); world.add(routeG);
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xF53D2E, roughness: 0.45, metalness: 0, emissive: 0xF53D2E, emissiveIntensity: 0.45 });
  const ND = 46, dashes = [], dashTs = [], T_FAR = 0.95, T_DOOR = 0.05;
  for (let i = 0; i < ND; i++) {
    const t = lerp(T_FAR, T_DOOR, i / (ND - 1));
    const pt = ROAD.getPointAt(t), tan = ROAD.getTangentAt(t);
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.05, 0.44), dashMat);
    d.position.set(pt.x, 0.13, pt.z); d.rotation.y = Math.atan2(tan.x, tan.z); d.scale.setScalar(0.001);
    routeG.add(d); dashes.push(d); dashTs.push(t);
  }

  // ---- store -------------------------------------------------------------
  const STORE_YAW = -Math.PI / 2;
  let storeTopY = 2.5, storeGroup = null; const onReadyCbs = []; let disposed = false;
  // the GLB ships Draco-compressed geometry; decoder pinned to our three version
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/gltf/');
  loader.setDRACOLoader(draco);
  const ready = loader.loadAsync(storeUrl).then((gl) => {
    if (disposed) return api;
    const m = gl.scene; m.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m); const s = box.getSize(new THREE.Vector3()); const c = box.getCenter(new THREE.Vector3());
    m.position.sub(c);
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; const ms = Array.isArray(o.material) ? o.material : (o.material ? [o.material] : []); ms.forEach((mm) => { mm.envMapIntensity = 0.62; lessPastel(mm, 0.22, -0.02); mm.needsUpdate = true; }); } });
    const pivot = new THREE.Group(); pivot.add(m);
    const k = 3 / Math.max(s.x, s.y, s.z); pivot.scale.setScalar(k); pivot.rotation.y = STORE_YAW; pivot.position.y = (s.y / 2) * k;
    storeGroup = pivot; world.add(pivot); storeTopY = s.y * k;
    mainPin.position.set(0, storeTopY + 0.95, 0);
    if (debug) console.log('[diorama] store', [+s.x.toFixed(2), +s.y.toFixed(2), +s.z.toFixed(2)], 'topY', storeTopY.toFixed(2));
    onReadyCbs.forEach((cb) => cb(api)); return api;
  });

  // ---- camera: starts up in the clouds; scroll descends into the city, then drives to the store
  const HERO_SKY_POS = V(0, 17, 47), HERO_SKY_TGT = V(0, 18.2, 24);
  const END_POS = V(0, 2.55, 10.5), END_TGT = V(0, 1.48, 0);
  const DRIVE_T0 = 0.96, DRIVE_T1 = 0.24, LOOK_AHEAD = 0.22, HORIZON_Y = 2.2, DESCENT = 0.16;
  const _p = new THREE.Vector3(), _t = new THREE.Vector3(), _a = new THREE.Vector3();
  const _pS = new THREE.Vector3(), _tS = new THREE.Vector3();

  function poseRoad(p) {
    const u = smooth(clamp01(p));
    const camT = lerp(DRIVE_T0, DRIVE_T1, u);
    const r = ROAD.getPointAt(camT);
    _p.set(r.x, lerp(2.55, 2.15, u), r.z);
    _a.copy(ROAD.getPointAt(Math.max(0, camT - LOOK_AHEAD)));
    _t.set(_a.x, HORIZON_Y, _a.z);                // gaze along the horizon, not down at the road
    const endB = smooth(clamp01((u - 0.8) / 0.2)); // final crane up + centre on the store
    _p.lerp(END_POS, endB);
    _t.lerp(END_TGT, endB);
  }
  function poseAt(p) {
    if (p < DESCENT) {                            // descend from the clouds down to the road start
      const u = smooth(clamp01(p / DESCENT));
      const r0 = ROAD.getPointAt(DRIVE_T0);
      const a0 = ROAD.getPointAt(Math.max(0, DRIVE_T0 - LOOK_AHEAD));
      _p.lerpVectors(HERO_SKY_POS, V(r0.x, 2.55, r0.z), u);
      _t.lerpVectors(HERO_SKY_TGT, V(a0.x, HORIZON_Y, a0.z), u);
    } else {
      poseRoad((p - DESCENT) / (1 - DESCENT));
    }
  }

  function resize() {
    const w = container.clientWidth || window.innerWidth, h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  const clock = new THREE.Clock();
  let progress = 0, progAct = 0, snapNext = true, elapsed = 0;
  const mouse = { x: 0, y: 0 }, mouseS = { x: 0, y: 0 };
  const dashStepT = (T_FAR - T_DOOR) / (ND - 1);

  function applyDashes() {
    const drive = clamp01((progAct - DESCENT) / (1 - DESCENT));   // dashes belong to the road drive only
    const camTpos = lerp(DRIVE_T0, DRIVE_T1, smooth(drive));
    const lead = 0.30 * smooth(clamp01(drive / 0.18));
    const front = (progAct < DESCENT) ? 1.0 : Math.max(T_DOOR - 0.02, camTpos - lead);
    for (let i = 0; i < dashes.length; i++) {
      const reveal = clamp01((dashTs[i] - front) / dashStepT);
      const sc2 = reducedMotion ? (reveal > 0.5 ? 1 : 0) : smooth(reveal);
      dashes[i].scale.setScalar(Math.max(0.001, sc2));
    }
  }

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    progAct += (progress - progAct) * damping;          // soft follow of the scroll
    poseAt(progAct);
    if (snapNext) { _pS.copy(_p); _tS.copy(_t); snapNext = false; }
    else { _pS.lerp(_p, posDamp); _tS.lerp(_t, posDamp * 0.82); }
    mouseS.x += (mouse.x - mouseS.x) * 0.035; mouseS.y += (mouse.y - mouseS.y) * 0.035;
    const swayX = reducedMotion ? 0 : Math.sin(elapsed * 0.35) * sway;
    camera.position.set(_pS.x + mouseS.x * 0.35 + swayX, _pS.y - mouseS.y * 0.22, _pS.z);
    camera.lookAt(_tS);
    applyDashes();
    if (!reducedMotion) {
      mainPin.position.y = storeTopY + 0.95 + Math.sin(elapsed * 1.4) * 0.07;
    }
    renderer.render(scene, camera);
  }

  let running = false;
  function play() { if (!running) { running = true; renderer.setAnimationLoop(frame); } }
  function pause() { if (running) { running = false; renderer.setAnimationLoop(null); } }
  const io = new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? play() : pause())), { threshold: 0 });
  io.observe(container);
  const onVis = () => (document.hidden ? pause() : play());
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('resize', resize); resize(); play();

  const api = {
    ready,
    onReady(cb) { onReadyCbs.push(cb); return api; },
    setProgress(p) { progress = clamp01(p); return api; },
    renderAt(p) { progress = progAct = clamp01(p); snapNext = true; frame(); return api; },
    setMouse(x, y) { mouse.x = x; mouse.y = y; return api; },
    resize, play, pause,
    _three: { scene, camera, renderer, world },
    destroy() {
      disposed = true; pause(); io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', resize);
      renderer.dispose(); pmrem.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.remove();
    },
  };
  return api;
}
