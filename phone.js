// phone.js — LOOKTURA phone ring carousel
// Loads the white iPhone from the GLB (the model ships 3 colourways + lies flat
// showing its back), isolates it, normalises it (upright, screen facing +Z,
// centred, unit height) and clones it N times into a ring with the screens
// facing OUTWARD. Scroll rotates the ring so each app screen turns to the front.
//
// API (createPhoneCarousel):
//   .ready             -> Promise (GLB + textures in, ring built)
//   .setProgress(0..1) -> rotate the ring (0 = screen 0 front, 1 = full turn)
//   .setMouse(x,y)     -> normalized pointer (-1..1) for subtle parallax
//   .frontIndex()      -> which screen is currently facing the viewer
//   .resize() .play() .pause() .destroy()

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const SCREEN_ASPECT = 0.462; // iPhone display w/h

export function createPhoneCarousel(container, opts = {}) {
  const {
    glbUrl = 'assets/models/iphone_17_pro.glb',
    screens = [],                 // [{ url, focus }]
    debug = false,
    reducedMotion = false,
    phoneHeight = 2.05,           // world height of one phone
    radius = 2.5,                // ring radius
    camDist = 8.8,               // camera distance from front phone
    yOffset = -0.3,              // nudge down so headline clears above, caption below
    flipUp = false,              // set true if screens come out upside-down
  } = opts;

  const count = opts.count || screens.length || 6;

  // ---- renderer ----------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({
    antialias: true, alpha: true, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;display:block;';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(4, 6, 8);
  const fill = new THREE.DirectionalLight(0xe7dcff, 0.9); fill.position.set(-6, 2, 4);
  const rim = new THREE.DirectionalLight(0xffffff, 1.5); rim.position.set(0, 4, -8);
  const amb = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(key, fill, rim, amb);

  const tilt = new THREE.Group();   // idle bob + parallax
  const ring = new THREE.Group();   // the rotating carousel
  tilt.add(ring); scene.add(tilt);

  // ---- textures ----------------------------------------------------------
  const texLoader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const textures = [];

  function applyCover(t, focus) {
    if (!t.image) return;
    const a = t.image.width / t.image.height;
    let rx = 1, ry = 1;
    if (a > SCREEN_ASPECT) rx = SCREEN_ASPECT / a; else ry = a / SCREEN_ASPECT;
    t.repeat.set(rx, ry);
    let oy = (1 - ry) / 2;
    if (focus === 'top') oy = 1 - ry;
    if (focus === 'bottom') oy = 0;
    t.offset.set((1 - rx) / 2, oy);
  }
  function loadTex(url, focus) {
    return new Promise((res) => {
      texLoader.load(url, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = maxAniso;
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        t.center.set(0.5, 0.5);
        applyCover(t, focus);
        res(t);
      }, undefined, () => res(null));
    });
  }

  // ---- build ring --------------------------------------------------------
  const loader = new GLTFLoader();
  let disposed = false;
  const onReadyCbs = [];

  const ready = (async () => {
    for (const s of screens) textures.push(await loadTex(s.url, s.focus));

    const gltf = await loader.loadAsync(glbUrl);
    if (disposed) return api;

    // isolate the white phone (Cube_* meshes); drop blue/orange colourways
    const template = gltf.scene;
    const drop = [];
    template.traverse((o) => { if (o.isMesh && !/^Cube_/.test(o.name)) drop.push(o); });
    drop.forEach((o) => o.parent && o.parent.remove(o));
    template.updateMatrixWorld(true);

    // --- align the phone to the screen's EXACT normal (so it faces dead-on) ----
    const V = () => new THREE.Vector3();
    template.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(template);
    const pc = box.getCenter(V());

    let screenMesh = null;
    template.traverse((o) => { if (o.isMesh && /screen/i.test(o.name)) screenMesh = o; });
    const sbox = new THREE.Box3().setFromObject(screenMesh || template);
    const sc = sbox.getCenter(V());

    // average the screen mesh's vertex normals into world space -> true face normal
    let n = new THREE.Vector3(0, 0, 1);
    const na = screenMesh && screenMesh.geometry.attributes.normal;
    if (na) {
      const nmat = new THREE.Matrix3().getNormalMatrix(screenMesh.matrixWorld);
      const tmp = new THREE.Vector3();
      n.set(0, 0, 0);
      for (let i = 0; i < na.count; i++) n.add(tmp.fromBufferAttribute(na, i).applyMatrix3(nmat));
      n.normalize();
    }
    if (n.dot(sc.clone().sub(pc)) < 0) n.negate();   // outward, toward the viewer
    // up = world +Y flattened into the screen plane -> keeps the phone upright
    const wy = new THREE.Vector3(0, 1, 0);
    let u = wy.clone().sub(n.clone().multiplyScalar(wy.dot(n)));
    if (u.lengthSq() < 1e-4) u.set(1, 0, 0);
    u.normalize();
    if (flipUp) u.negate();

    const right = new THREE.Vector3().crossVectors(u, n).normalize();
    const up = new THREE.Vector3().crossVectors(n, right).normalize();
    const basis = new THREE.Matrix4().makeBasis(right, up, n);
    const R = new THREE.Quaternion().setFromRotationMatrix(basis.clone().transpose());
    template.quaternion.premultiply(R);
    template.updateMatrixWorld(true);
    if (debug) console.log('[carousel] screen normal', [+n.x.toFixed(2), +n.y.toFixed(2), +n.z.toFixed(2)]);

    // recentre + fit height after reorientation
    const box2 = new THREE.Box3().setFromObject(template);
    const c2 = box2.getCenter(V());
    const s2 = box2.getSize(V());
    template.position.sub(c2);
    const pivot = new THREE.Group();
    pivot.add(template);
    pivot.scale.setScalar(phoneHeight / s2.y);
    if (debug) console.log('[carousel] size', [+s2.x.toFixed(2), +s2.y.toFixed(2), +s2.z.toFixed(2)],
      'fit', (phoneHeight / s2.y).toFixed(3));

    // clone into the ring, one screen per phone
    for (let i = 0; i < count; i++) {
      const unit = pivot.clone(true);
      let sm = null;
      unit.traverse((o) => { if (o.isMesh && /screen/i.test(o.name)) sm = o; });
      // toneMapped:false -> the screen shows the app UI colours 1:1 (no ACES
      // wash-out), like a real emissive display. The phone body still tone-maps.
      if (sm) sm.material = new THREE.MeshBasicMaterial({ map: textures[i % textures.length] || null, toneMapped: false });
      slotScreens[i] = sm;
      const slot = new THREE.Group();
      slot.add(unit);
      const theta = i * (Math.PI * 2 / count);
      slot.position.set(radius * Math.sin(theta), 0, radius * Math.cos(theta));
      slot.rotation.y = theta;
      ring.add(slot);
      slots.push({ g: slot, fr: 0.5 + (i % 3) * 0.07, ph: i * 1.7, am: 0.06 + (i % 3) * 0.02 });
    }

    layoutCamera();
    onReadyCbs.forEach((cb) => cb(api));
    return api;
  })();

  // ---- camera + viewport -------------------------------------------------
  function layoutCamera() {
    camera.position.set(0, 0, radius + camDist);
    camera.lookAt(0, 0, 0);
  }
  function resize() {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    // phones (and their screens) ~20% larger on phones; centred, so layout holds
    tilt.scale.setScalar(w <= 768 ? 1.2 : 1);
    curYOffset = w <= 768 ? -0.05 : yOffset;   // sit a touch higher on phones
  }

  // ---- loop --------------------------------------------------------------
  const clock = new THREE.Clock();
  const slots = [];                 // per-phone float state (independent)
  const slotScreens = [];           // each phone's screen mesh (for live texture swaps)
  let progress = 0, progAct = 0;
  let curYOffset = yOffset;          // raised a touch on phones (set in resize)
  const mouse = { x: 0, y: 0 }, mouseS = { x: 0, y: 0 };

  function frame() {
    const t = clock.getElapsedTime();
    progAct += (progress - progAct) * 0.12;
    mouseS.x += (mouse.x - mouseS.x) * 0.06;
    mouseS.y += (mouse.y - mouseS.y) * 0.06;

    ring.rotation.y = -progAct * Math.PI * 2;

    // Ring stays square to the camera so the front phone faces the user dead-on.
    // No Y idle/parallax rotation (that was the "slightly sideways" look). Just a
    // whisper of pointer X-tilt for life.
    tilt.position.y = curYOffset;
    tilt.rotation.set(reducedMotion ? 0 : mouseS.y * 0.03, 0, 0);

    // Each phone floats on its own phase — independent bob, not one rigid ring.
    if (!reducedMotion) {
      for (const s of slots) s.g.position.y = Math.sin(t * s.fr + s.ph) * s.am;
    }

    camera.position.set(0, 0, radius + camDist);
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  }

  let running = false;
  function play() { if (!running) { running = true; renderer.setAnimationLoop(frame); } }
  function pause() { if (running) { running = false; renderer.setAnimationLoop(null); } }

  const io = new IntersectionObserver((es) => {
    es.forEach((en) => { en.isIntersecting ? play() : pause(); });
  }, { threshold: 0 });
  io.observe(container);
  const onVis = () => { document.hidden ? pause() : play(); };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('resize', resize);

  layoutCamera(); resize(); play();

  const api = {
    ready,
    onReady(cb) { onReadyCbs.push(cb); return api; },
    setProgress(p) { progress = p; return api; },
    setMouse(x, y) { mouse.x = x; mouse.y = y; return api; },
    loadTexture(url, focus) { return loadTex(url, focus); },
    screenTexture(i) { return textures[i]; },
    setSlotMap(slotIdx, tex) {
      const m = slotScreens[slotIdx];
      if (m && tex) { m.material.map = tex; m.material.needsUpdate = true; }
      return api;
    },
    frontIndex() { return ((Math.round(progAct * count) % count) + count) % count; },
    get count() { return count; },
    resize, play, pause,
    _three: { scene, camera, renderer, ring, tilt },
    destroy() {
      disposed = true; pause(); io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', resize);
      renderer.dispose(); pmrem.dispose();
      textures.forEach((t) => t && t.dispose());
      if (renderer.domElement.parentNode) renderer.domElement.remove();
    },
  };
  return api;
}
