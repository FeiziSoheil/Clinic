// Health chatbot avatar core. Built and tested against three@0.128.0 (npm i three@0.128.0).
// createHealthAvatar(THREE, canvas, opts) -> { setState, setSpeaking, setLevel, dispose, states }
export function createHealthAvatar(THREE, canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  camera.position.set(0, 1.0, 7.5); camera.lookAt(0, 0.95, 0);
  const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  // ---- lighting ----
  scene.add(new THREE.HemisphereLight(0xffffff, 0xa9e3ea, 0.4));
  const key = new THREE.DirectionalLight(0xfff7ef, 0.8); key.position.set(3, 5, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0x6ff0ff, 0.8); rim.position.set(-4, 2, -4); scene.add(rim);
  const fill = new THREE.PointLight(0x66f0ff, 0.35); fill.position.set(-3, 0, 4); scene.add(fill);
  {
    const ec = document.createElement('canvas'); ec.width = 512; ec.height = 256;
    const g = ec.getContext('2d'), eg = g.createLinearGradient(0, 0, 0, 256);
    eg.addColorStop(0, '#e8f6f9'); eg.addColorStop(0.5, '#a9d8e0'); eg.addColorStop(1, '#4f9bb0');
    g.fillStyle = eg; g.fillRect(0, 0, 512, 256); g.fillStyle = '#fff'; g.fillRect(70, 40, 100, 50); g.fillRect(330, 55, 120, 40);
    const tex = new THREE.CanvasTexture(ec); tex.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = new THREE.PMREMGenerator(renderer).fromEquirectangular(tex).texture;
  }

  // ---- helpers ----
  const glass = (c, e, o = 0.95) => new THREE.MeshPhysicalMaterial({ color: c, emissive: e, emissiveIntensity: 0.35, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.2, transparent: true, opacity: o });
  const basic = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: o < 1, opacity: o });
  const ell = (mat, r, sx, sy, sz, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); return m; };
  function roundBox(mat, sx, sy, sz, r, x = 0, y = 0, z = 0, seg = 20) {
    const g = new THREE.BoxGeometry(2, 2, 2, seg, seg, seg), p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3(), k = 1 - r;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const ix = Math.max(-k, Math.min(k, v.x)), iy = Math.max(-k, Math.min(k, v.y)), iz = Math.max(-k, Math.min(k, v.z));
      const d = new THREE.Vector3(v.x - ix, v.y - iy, v.z - iz).normalize();
      n.setXYZ(i, d.x, d.y, d.z); p.setXYZ(i, ix + d.x * r, iy + d.y * r, iz + d.z * r);
    }
    const m = new THREE.Mesh(g, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); return m;
  }

  const root = new THREE.Group(); scene.add(root);
  const accent = new THREE.Color(0x7ff3ff), accentT = new THREE.Color(0x7ff3ff);

  // halo + contact shadow
  {
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d'), gr = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    gr.addColorStop(0, 'rgba(120,225,240,0.45)'); gr.addColorStop(0.6, 'rgba(120,225,240,0.14)'); gr.addColorStop(1, 'rgba(120,225,240,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthWrite: false }));
    s.scale.set(8, 8, 1); s.position.set(0, 0.9, -1.5); root.add(s);
    const c2 = document.createElement('canvas'); c2.width = c2.height = 128;
    const g3 = c2.getContext('2d'), r2 = g3.createRadialGradient(64, 64, 4, 64, 64, 64);
    r2.addColorStop(0, 'rgba(20,80,100,0.3)'); r2.addColorStop(1, 'rgba(20,80,100,0)'); g3.fillStyle = r2; g3.fillRect(0, 0, 128, 128);
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c2), transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.y = -1.25; scene.add(sh);
  }

  // ---- head ----
  const hoodMat = new THREE.MeshPhysicalMaterial({ color: 0xeaf3f7, emissive: 0xcfeef5, emissiveIntensity: 0.08, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12 });
  const head = new THREE.Group(); head.position.y = 0.85; root.add(head);
  head.add(roundBox(hoodMat, 1.3, 1.1, 1.0, 0.4));
  const t1 = ell(hoodMat, 1, 0.3, 0.55, 0.28, 0.15, 1.12, 0); t1.rotation.z = -0.5; head.add(t1);
  const t2 = ell(hoodMat, 1, 0.2, 0.34, 0.24, 0.62, 1.05, 0); t2.rotation.z = -1.0; head.add(t2);

  // medical cross badge on the forehead
  const badge = new THREE.Group(); badge.position.set(0, 0.96, 0.88); badge.rotation.x = -0.55; head.add(badge);
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 32), glass(0x62d9cc, 0x1d9fb2, 1)); disc.rotation.x = Math.PI / 2; badge.add(disc);
  const wm = basic(0xffffff);
  const cx1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.045, 0.02), wm), cx2 = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.16, 0.02), wm);
  cx1.position.z = cx2.position.z = 0.03; badge.add(cx1, cx2);

  // monitor: bezel + gradient screen + glare
  const scrTex = (() => { const c = document.createElement('canvas'); c.width = 8; c.height = 128; const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#0b2f48'); gr.addColorStop(1, '#0a5a6e'); g.fillStyle = gr; g.fillRect(0, 0, 8, 128); return new THREE.CanvasTexture(c); })();
  head.add(roundBox(new THREE.MeshPhysicalMaterial({ color: 0x8fa9b8, roughness: 0.3, metalness: 0.4, clearcoat: 1 }), 1.12, 0.88, 0.3, 0.3, 0, -0.05, 0.73));
  head.add(roundBox(new THREE.MeshPhysicalMaterial({ map: scrTex, emissive: 0x0b4a63, emissiveIntensity: 0.5, roughness: 0.12, clearcoat: 1 }), 1.0, 0.76, 0.3, 0.3, 0, -0.05, 0.76));
  { const gl = ell(basic(0xffffff, 0.09), 0.3, 1.8, 0.4, 0.05, -0.45, 0.5, 1.07); gl.rotation.z = 0.35; head.add(gl); }
  const led = ell(new THREE.MeshBasicMaterial({ color: 0x7ff3ff }), 0.06, 1, 1, 0.6, 0, -1.0, 0.87); head.add(led);

  // overlay canvas on the screen (ECG / SOS)
  const oc = document.createElement('canvas'); oc.width = 256; oc.height = 192;
  const og2 = oc.getContext('2d'), oTex = new THREE.CanvasTexture(oc);
  const overlay = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.35), new THREE.MeshBasicMaterial({ map: oTex, transparent: true, depthWrite: false }));
  overlay.position.set(0, -0.05, 1.075); head.add(overlay);
  const ecg = u => { const g = (c, w, a) => a * Math.exp(-(((u - c) / w) ** 2)); return g(0.25, 0.04, 0.15) + g(0.42, 0.012, -0.12) + g(0.46, 0.012, 1) + g(0.5, 0.012, -0.25) + g(0.7, 0.06, 0.2); };
  function drawECG(t) {
    const col = '#' + accent.getHexString();
    og2.clearRect(0, 0, 256, 192); og2.lineWidth = 5; og2.lineJoin = 'round'; og2.strokeStyle = col; og2.shadowColor = col; og2.shadowBlur = 10; og2.beginPath();
    for (let x = 0; x <= 256; x += 2) { const v = (x / 256) * 1.6 - t * 0.5; const u = ((v % 1) + 1) % 1; const y = 96 - ecg(u) * 70; x ? og2.lineTo(x, y) : og2.moveTo(x, y); }
    og2.stroke(); oTex.needsUpdate = true;
  }
  function drawSOS() {
    og2.clearRect(0, 0, 256, 192); og2.shadowBlur = 0; og2.fillStyle = '#ff5a5f';
    og2.fillRect(18, 82, 90, 28); og2.fillRect(49, 51, 28, 90);
    og2.font = 'bold 80px sans-serif'; og2.textAlign = 'left'; og2.textBaseline = 'middle'; og2.fillText('۱۱۵', 122, 100); oTex.needsUpdate = true;
  }

  function drawCheck() {
    og2.clearRect(0, 0, 256, 192); og2.shadowColor = '#5be08a'; og2.shadowBlur = 14; og2.strokeStyle = '#5be08a';
    og2.lineWidth = 18; og2.lineCap = 'round'; og2.lineJoin = 'round'; og2.beginPath();
    og2.moveTo(72, 100); og2.lineTo(114, 140); og2.lineTo(186, 54); og2.stroke(); oTex.needsUpdate = true;
  }
  function drawPill() {
    const rr = (x, y, w, h, r) => { og2.beginPath(); og2.moveTo(x + r, y); og2.arcTo(x + w, y, x + w, y + h, r); og2.arcTo(x + w, y + h, x, y + h, r); og2.arcTo(x, y + h, x, y, r); og2.arcTo(x, y, x + w, y, r); og2.closePath(); };
    og2.clearRect(0, 0, 256, 192); og2.save(); og2.translate(128, 96); og2.rotate(-Math.PI / 4);
    og2.shadowColor = '#7ff3ff'; og2.shadowBlur = 12; rr(-80, -32, 160, 64, 32); og2.fillStyle = '#e8fbff'; og2.fill();
    og2.shadowBlur = 0; og2.save(); rr(-80, -32, 160, 64, 32); og2.clip(); og2.fillStyle = '#7ff3ff'; og2.fillRect(0, -40, 90, 80); og2.restore();
    og2.restore(); oTex.needsUpdate = true;
  }
  function drawBreath(t) {
    const ph = (t / 8) % 1, sc = 0.5 - 0.5 * Math.cos(ph * Math.PI * 2), r = 34 + sc * 46;
    og2.clearRect(0, 0, 256, 192); og2.shadowColor = '#8fe8d0'; og2.shadowBlur = 16; og2.strokeStyle = '#8fe8d0'; og2.lineWidth = 8;
    og2.beginPath(); og2.arc(128, 96, r, 0, Math.PI * 2); og2.stroke();
    og2.shadowBlur = 0; og2.fillStyle = '#8fe8d0'; og2.font = 'bold 30px sans-serif'; og2.textAlign = 'center'; og2.textBaseline = 'middle';
    og2.fillText(ph < 0.5 ? 'دم' : 'بازدم', 128, 96); oTex.needsUpdate = true;
  }

  // ---- face ----
  const cyan = new THREE.MeshBasicMaterial({ color: 0x8fF6ff });
  const eyes = new THREE.Group(); head.add(eyes);
  const eyeRoots = [], eyeSets = [], irises = [], brows = [], blushes = [];
  [-1, 1].forEach(s => {
    const e = new THREE.Group(); e.position.set(s * 0.5, 0.1, 1.04); eyes.add(e); eyeRoots.push(e);
    const og = new THREE.Group(); og.add(ell(glass(0xcff6fb, 0x7fe0ee, 1), 0.22, 1, 1, 0.5));
    const ir = new THREE.Group();
    ir.add(ell(glass(0x2b8ea8, 0x1a6f8a, 1), 0.16, 1, 1, 0.5, 0, 0, 0.07));
    ir.add(ell(basic(0x0e2a4a), 0.085, 1, 1, 0.5, 0, 0, 0.13));
    ir.add(ell(basic(0xffffff), 0.04, 1, 1, 1, -0.06, 0.07, 0.18));
    ir.add(ell(basic(0xffffff), 0.02, 1, 1, 1, 0.06, -0.06, 0.18));
    og.add(ir); irises.push(ir);
    const ag = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.05, 12, 24, Math.PI), cyan); ag.position.set(0, -0.07, 0.06);
    const lg = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 0.05), cyan); lg.position.z = 0.06;
    e.add(og, ag, lg); eyeSets.push({ open: og, arc: ag, line: lg });
    const br = ell(glass(0xb6f3fb, 0x7fe0ee, 0.9), 0.12, 1.8, 0.28, 0.3, s * 0.5, 0.55, 1.07); head.add(br); brows.push(br);
    const bl = ell(new THREE.MeshBasicMaterial({ color: 0xf2a6c8, transparent: true, opacity: 0.3 }), 0.2, 1.4, 0.8, 0.1, s * 0.82, -0.28, 1.06); bl.rotation.y = s * 0.25; head.add(bl); blushes.push(bl);
  });
  const mA = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.022, 12, 32, Math.PI), cyan); mA.rotation.z = Math.PI;
  const mD = new THREE.Mesh(new THREE.CircleGeometry(0.14, 32, Math.PI, Math.PI), new THREE.MeshBasicMaterial({ color: 0x8ff6ff, side: THREE.DoubleSide }));
  [mA, mD].forEach(m => { m.position.z = 1.08; head.add(m); });

  // ---- floating robot hands ----
  const handWhite = new THREE.MeshPhysicalMaterial({ color: 0xf1f7fa, emissive: 0xbfeaf2, emissiveIntensity: 0.1, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 });
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x7ff3ff });
  function robotHand(side) {
    const g = new THREE.Group();
    const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.6, 40), handWhite); cyl.position.y = 0.3; g.add(cyl);
    g.add(ell(handWhite, 0.2, 1, 1.5, 1, 0, 0.6, 0)); g.add(ell(handWhite, 0.2, 1, 0.4, 1, 0, 0, 0));
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.205, 0.028, 12, 40), ringMat); r.rotation.x = Math.PI / 2; r.position.y = 0.12; g.add(r);
    root.add(g); return g;
  }
  const handL = robotHand(-1), handR = robotHand(1);
  const qTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); g.fillStyle = '#2fb4c8'; g.font = 'bold 100px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', 64, 68); return new THREE.CanvasTexture(c); })();
  const qm = new THREE.Sprite(new THREE.SpriteMaterial({ map: qTex, transparent: true, depthWrite: false })); qm.scale.set(0.8, 0.8, 1); qm.position.set(1.1, 2.7, 0.4); qm.visible = false; root.add(qm);

  // ---- states ----
  const base = { eyeS: 1, lookX: 0, lookY: 0, browYL: 0, browYR: 0, browRot: 0.12, blush: 0.3, mSX: 1.3, mSY: 0.8, mY: -0.3,
    lx: -1.7, ly: 0.4, lr: 0.25, lw: 0, rx: 1.7, ry: 0.4, rr: -0.25, rw: 0, nod: 0, tilt: 0, mot: 1 };
  const STATES = {
    ready:     { overlay: '',    acc: 0x7ff3ff, p: {} },
    listening: { overlay: '',    acc: 0x7ff3ff, p: { eyeS: 1.1, browYL: 0.04, browYR: 0.04, mSX: 1, mSY: 0.35, mY: -0.31, nod: 0.12, tilt: 0.06, ly: 0.3, ry: 0.3 } },
    thinking:  { overlay: 'ecg', acc: 0x7ff3ff, p: { ly: 0.35, ry: 0.35, lr: 0.2, rr: -0.2 } },
    empathy:   { overlay: '',    acc: 0x8fe8d0, p: { lookY: -0.2, browRot: 0.32, browYL: -0.01, browYR: -0.01, blush: 0.2, mSX: 0.9, mSY: 0.18, mY: -0.32, nod: 0.08, tilt: 0.08, lx: -1.5, ly: 0.15, lr: 0.12, rx: 1.5, ry: 0.15, rr: -0.12, mot: 0.6 } },
    caution:   { overlay: '',    acc: 0xffb84d, p: { eyeS: 1.05, browRot: -0.18, browYL: -0.02, browYR: -0.02, blush: 0.05, mSX: 1, mSY: 0.1, mY: -0.32, ly: 0.8, lr: 0.12, ry: 0.8, rr: -0.12, mot: 0.5 } },
    emergency: { overlay: 'sos', acc: 0xff5a5f, p: { ly: 0.2, ry: 0.2, lr: 0.1, rr: -0.1, mot: 0 } },
    greeting:  { overlay: '',      eyes: 'arc',  acc: 0x7ff3ff, p: { mSX: 1.5, mSY: 1.1, mY: -0.28, browYL: 0.06, browYR: 0.06, browRot: -0.08, blush: 0.55, ly: 0.9, lr: 0.55, lw: 0.35 } },
    success:   { overlay: 'check', acc: 0x5be08a, p: { ly: 0.7, lr: 0.35, ry: 0.7, rr: -0.35 } },
    confused:  { overlay: '',      acc: 0x7ff3ff, p: { lookX: 0.5, lookY: 0.5, browYL: 0.16, browYR: -0.04, mSX: 0.8, mSY: 0.12, mY: -0.32, tilt: -0.14, ly: 0.3, lr: 0.2, rx: 1.15, ry: -0.5, rr: -0.9 } },
    reminder:  { overlay: 'pill',  acc: 0x7ff3ff, p: { ry: 0.9, rr: -0.5, rw: 0.3 } },
    breathing: { overlay: 'breath', acc: 0x8fe8d0, p: { lx: -1.9, rx: 1.9, ly: 0.3, ry: 0.3, lr: 0.4, rr: -0.4, mot: 0.4 } },
    offline:   { overlay: '',      eyes: 'line', acc: 0x8aa4b0, p: { mSX: 0.8, mSY: 0.12, mY: -0.32, browRot: 0.2, browYL: -0.04, browYR: -0.04, blush: 0.05, ly: 0, ry: 0, lr: 0.05, rr: -0.05, nod: 0.18, tilt: 0.12, mot: 0.3 } },
  };
  let state = 'ready', pop = 0;
  const cur = Object.assign({}, base), tg = Object.assign({}, base);
  const talk = { on: false, lv: 0, tgt: 0, amt: 0, next: 0, ext: -1, extT: 0 };

  function applyFace() {
    const ov = STATES[state].overlay;
    eyes.visible = !ov; brows.forEach(b => b.visible = !ov); blushes.forEach(b => b.visible = !ov);
    mA.visible = !ov && !talk.on; mD.visible = !ov && talk.on; overlay.visible = !!ov;
    const et = STATES[state].eyes || 'open';
    eyeSets.forEach(es => { es.open.visible = et === 'open'; es.arc.visible = et === 'arc'; es.line.visible = et === 'line'; });
    if (ov === 'sos') drawSOS(); else if (ov === 'check') drawCheck(); else if (ov === 'pill') drawPill();
  }
  function setState(n) {
    const S = STATES[n]; if (!S) return;
    state = n; Object.assign(tg, base, S.p); accentT.setHex(S.acc); pop = 1; applyFace();
  }
  function setSpeaking(on) { talk.on = !!on; applyFace(); }
  function setLevel(v) { talk.ext = Math.max(0, Math.min(1, v)); talk.extT = performance.now(); }

  // ---- interaction / resize ----
  let px = 0, py = 0, drag = false, lastX = 0, userRot = 0;
  const onMove = e => { px = (e.clientX / innerWidth) * 2 - 1; py = (e.clientY / innerHeight) * 2 - 1; if (drag) { userRot += (e.clientX - lastX) * 0.01; lastX = e.clientX; } };
  const onDown = e => { drag = true; lastX = e.clientX; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} };
  const onUp = () => { drag = false; };
  if (opts.interactive !== false) { window.addEventListener('pointermove', onMove); canvas.addEventListener('pointerdown', onDown); window.addEventListener('pointerup', onUp); }
  function resize() {
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 300;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.position.z = Math.max(7.5, 7.77 / camera.aspect); camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(canvas); resize();
  let visible = true;
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(en => { visible = en[0].isIntersecting; }) : null; if (io) io.observe(canvas);

  // ---- loop ----
  const clock = new THREE.Clock(); let nextBlink = 2, raf = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    if (!visible) return;
    const t = clock.getElapsedTime(), rm = mq.matches ? 0.25 : 1;
    for (const q in cur) cur[q] += (tg[q] - cur[q]) * 0.12;
    accent.lerp(accentT, 0.1); ringMat.color.copy(accent); led.material.color.copy(accent);
    const m = cur.mot * rm;
    const bs = state === 'breathing' ? 0.5 - 0.5 * Math.cos((((t * rm) / 8) % 1) * Math.PI * 2) : 0;
    root.position.y = Math.sin(t * 1.6) * 0.07 * m;
    if (!drag) userRot *= 0.94;
    root.rotation.y = Math.sin(t * 0.5) * 0.2 * m + userRot;
    head.rotation.y += (px * 0.35 * m - head.rotation.y) * 0.08;
    head.rotation.x += (py * 0.2 * m + cur.nod - head.rotation.x) * 0.08;
    head.rotation.z = Math.sin(t * 1.1) * 0.03 * m + cur.tilt;
    handL.position.set(cur.lx, cur.ly + Math.sin(t * 1.8) * 0.05 * m + bs * 0.25, 0); handL.rotation.z = cur.lr + Math.sin(t * 4) * cur.lw * m;
    handR.position.set(cur.rx, cur.ry + Math.sin(t * 1.8 + 1.5) * 0.05 * m + bs * 0.25, 0); handR.rotation.z = cur.rr + Math.sin(t * 4 + 1) * cur.rw * m;

    let k = 1; if (t > nextBlink) { const d = t - nextBlink; k = 1 - Math.sin(Math.min(d / 0.18, 1) * Math.PI) * 0.9; if (d > 0.18) nextBlink = t + 2.5 + Math.random() * 2.5; }
    eyeRoots.forEach((e, i) => { e.scale.set(1.25 * cur.eyeS, 1.25 * cur.eyeS * ((STATES[state].eyes || 'open') === 'open' ? k : 1), 0.8); irises[i].position.set(cur.lookX * 0.07, cur.lookY * 0.07, 0); });
    brows.forEach((b, i) => { b.position.y = 0.55 + (i ? cur.browYR : cur.browYL); b.rotation.z = (i ? -1 : 1) * cur.browRot; });
    blushes.forEach(b => b.material.opacity = cur.blush);
    mA.scale.set(cur.mSX, cur.mSY, 1); mA.position.y = cur.mY;

    talk.amt += ((talk.on ? 1 : 0) - talk.amt) * 0.1;
    if (talk.on) {
      if (performance.now() - talk.extT < 250) talk.tgt = talk.ext;
      else if (t > talk.next) { talk.tgt = Math.random() < 0.2 ? 0.1 : 0.35 + Math.random() * 0.65; talk.next = t + 0.07 + Math.random() * 0.09; }
      talk.lv += (talk.tgt - talk.lv) * 0.4;
      mD.scale.set(1.3 - 0.3 * talk.lv, 0.15 + 1.05 * talk.lv, 1); mD.position.y = -0.23 - 0.02 * talk.lv;
    } else talk.lv *= 0.8;
    const ta = talk.amt * Math.min(1, m * 2);
    head.position.y = 0.85 + talk.lv * 0.03 * ta;
    brows.forEach(b => b.position.y += talk.lv * 0.05 * ta);
    handL.rotation.z += Math.sin(t * 5) * 0.15 * ta; handL.position.y += Math.abs(Math.sin(t * 5)) * 0.1 * ta;
    handR.rotation.z += Math.sin(t * 5 + 1.5) * 0.15 * ta; handR.position.y += Math.abs(Math.sin(t * 5 + 1.5)) * 0.1 * ta;

    const pulse = state === 'emergency' ? 1 : 1 + Math.sin(t * (state === 'thinking' ? 6 : 2)) * 0.2 * rm;
    led.scale.set(pulse, pulse, 0.6);
    if (state === 'thinking') drawECG(t * rm); else if (state === 'breathing') drawBreath(t * rm);
    overlay.rotation.z = state === 'reminder' ? Math.sin(t * 12) * 0.08 * rm : 0;
    qm.visible = state === 'confused'; qm.position.y = 2.6 + Math.sin(t * 3) * 0.06 * rm;
    pop = Math.max(0, pop - 0.04); head.scale.setScalar(1 + Math.sin((1 - pop) * Math.PI) * 0.05 * m);
    renderer.render(scene, camera);
  }
  setState(opts.state || 'ready'); accent.copy(accentT);
  frame();

  function dispose() {
    cancelAnimationFrame(raf); ro.disconnect(); if (io) io.disconnect();
    window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); canvas.removeEventListener('pointerdown', onDown);
    renderer.dispose();
  }
  return { setState, setSpeaking, setLevel, dispose, states: Object.keys(STATES) };
}
