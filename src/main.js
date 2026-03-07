import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

const TRACKS = [
  ['Sunset Causeway', [90, 60, 0.15], 34],
  ['Basalt Belt', [78, 52, 0.22], 30],
  ['Circuit Garden', [84, 58, 0.12], 36],
  ['Cloudline Port', [95, 55, 0.20], 33],
  ['Neon Canal', [88, 50, 0.19], 31],
  ['Pine Ridge', [80, 64, 0.10], 35],
  ['Iron Quarry', [70, 48, 0.26], 29],
  ['Aurora Loop', [102, 62, 0.16], 34]
];

const CHARACTERS = [
  { name: 'Aster', speed: 1.03, accel: 1.04, handling: 0.96, drift: 1.04, trait: 'Balanced' },
  { name: 'Bolt', speed: 1.08, accel: 0.93, handling: 0.86, drift: 0.92, trait: 'Top speed' },
  { name: 'Comet', speed: 0.94, accel: 1.12, handling: 1.06, drift: 1.08, trait: 'Agile' },
  { name: 'Dune', speed: 0.98, accel: 1.03, handling: 1.12, drift: 0.95, trait: 'Grip' },
  { name: 'Echo', speed: 1.00, accel: 1.00, handling: 1.00, drift: 1.00, trait: 'All-round' },
  { name: 'Flux', speed: 1.05, accel: 0.97, handling: 0.95, drift: 1.05, trait: 'Drifter' },
  { name: 'Gale', speed: 0.92, accel: 1.14, handling: 1.10, drift: 1.00, trait: 'Recovery' },
  { name: 'Hex', speed: 1.07, accel: 0.90, handling: 0.90, drift: 1.12, trait: 'Risky' }
];

const DIFFICULTY = {
  Chill: { topSpeed: 0.90, reaction: 0.75, itemRate: 0.75, overtake: 0.6 },
  Standard: { topSpeed: 1.00, reaction: 1.00, itemRate: 1.0, overtake: 1.0 },
  Mean: { topSpeed: 1.08, reaction: 1.15, itemRate: 1.1, overtake: 1.2 }
};

const ITEMS = ['Pulse', 'Spark', 'Slick', 'Shield', 'Jolt', 'Swap', 'Mist', 'CoinBoost'];
const ITEM_WEIGHTS = [
  { max: 2, w: [1, 2, 1, 1, 0.8, 0.3, 0.6, 0.4] },
  { max: 4, w: [1, 1.8, 1, 1, 0.7, 0.4, 0.6, 0.5] },
  { max: 6, w: [1, 1.2, 1, 1, 0.6, 0.4, 0.5, 0.8] },
  { max: 8, w: [1, 1, 0.9, 1.3, 0.5, 0.3, 0.4, 1.2] }
];

const app = document.querySelector('#app');
const canvas = document.querySelector('#game');
const hud = document.querySelector('#hud');
const statusEl = document.querySelector('#status');
const itemEl = document.querySelector('#itemSlot');
const timerEl = document.querySelector('#timer');
const splitEl = document.querySelector('#split');
const minimap = document.querySelector('#minimap');
const mmctx = minimap.getContext('2d');
let audio;

const ui = {
  flow: document.querySelector('#frontFlow'),
  options: document.querySelector('#optionsMenu'),
  pause: document.querySelector('#pauseMenu'),
  track: document.querySelector('#trackSelect'),
  char: document.querySelector('#charSelect'),
  difficulty: document.querySelector('#difficultySelect'),
  mirror: document.querySelector('#mirrorToggle'),
  clone: document.querySelector('#cloneToggle')
};

TRACKS.forEach(([name], i) => ui.track.add(new Option(`${i + 1}. ${name}`, i)));
CHARACTERS.forEach((c, i) => ui.char.add(new Option(`${c.name} (${c.trait})`, i)));

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87a7ff);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2000);

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const dl = new THREE.DirectionalLight(0xffffff, 1.0);
dl.position.set(30, 60, -15);
scene.add(dl);

let state;
let keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Escape' && state?.phase === 'race') togglePause();
  if (e.code === 'Space') useItem(state.player);
});
window.addEventListener('keyup', (e) => (keys[e.code] = false));
window.addEventListener('resize', resize);
resize();

function buildTrack(index, mirror = false) {
  const [name, [rx, rz, wobble], width] = TRACKS[index];
  const points = [];
  for (let i = 0; i < 80; i++) {
    const t = i / 80;
    const a = t * Math.PI * 2;
    const mod = 1 + wobble * Math.sin(a * 3 + index);
    points.push(new THREE.Vector3(Math.cos(a) * rx * mod, 0, Math.sin(a) * rz * mod));
  }
  const spline = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.2);
  const driftZones = [{ s0: 0.1, s1: 0.2 }, { s0: 0.48, s1: 0.58 }, { s0: 0.74, s1: 0.84 }];
  const hazards = [{ s0: 0.28, s1: 0.32, laneBias: 8 }, { s0: 0.61, s1: 0.66, laneBias: -10 }];
  return { name, spline, width, mirror, driftZones, hazards, musicHz: 120 + index * 12, length: spline.getLength() };
}

function spawnKart(characterIdx, isPlayer, slot) {
  const stats = CHARACTERS[characterIdx];
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 3.2), new THREE.MeshStandardMaterial({ color: isPlayer ? 0xffcd4a : new THREE.Color().setHSL(slot / 8, 0.8, 0.55) }));
  scene.add(mesh);
  return {
    isPlayer, stats, mesh, s: 0.02 + slot * 0.015, lane: (slot % 4 - 1.5) * 4, laneV: 0,
    speed: 0, lap: 1, boosts: 0, item: null, place: 8, driftCharge: 0, drifting: false,
    stun: 0, steerLock: 0, shield: 0, slip: 0, boostTimer: 0, finished: false, split: 0,
    aiLaneIntent: 0, aiCooldown: Math.random() * 1.5
  };
}

function startRace() {
  clearScene();
  const track = buildTrack(+ui.track.value, ui.mirror.checked);
  buildTrackMesh(track);
  const chars = ui.clone.checked ? [...Array(8)].map((_, i) => (i + +ui.char.value) % 8) : shuffle([...Array(8).keys()]);
  chars[0] = +ui.char.value;
  state = {
    phase: 'race',
    track,
    difficulty: DIFFICULTY[ui.difficulty.value],
    racers: chars.map((c, i) => spawnKart(c, i === 0, i)),
    timer: 0,
    countdown: 2.5,
    paused: false
  };
  state.player = state.racers[0];
  ui.flow.classList.add('hidden');
  ui.pause.classList.add('hidden');
  hud.classList.remove('hidden');
  startMusic(track.musicHz);
}

function clearScene() {
  [...scene.children].forEach((obj) => {
    if (obj.isMesh || obj.type === 'Group') scene.remove(obj);
  });
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  scene.add(dl);
}

function buildTrackMesh(track) {
  const grp = new THREE.Group();
  const boxGeo = new THREE.BoxGeometry(3, 2, 3);
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x353d50 });
  const sideMat = new THREE.MeshStandardMaterial({ color: 0x6dc96d });
  for (let i = 0; i < 250; i++) {
    const s = i / 250;
    const p = track.spline.getPointAt(s);
    const t = track.spline.getTangentAt(s).normalize();
    const r = new THREE.Vector3(-t.z, 0, t.x);
    for (let lane = -track.width * 0.6; lane <= track.width * 0.6; lane += 3) {
      const road = new THREE.Mesh(boxGeo, Math.abs(lane) < track.width * 0.5 ? roadMat : sideMat);
      road.position.copy(p).addScaledVector(r, track.mirror ? -lane : lane).setY(-1);
      grp.add(road);
    }
  }
  scene.add(grp);
}

function update(dt) {
  if (!state || state.phase !== 'race' || state.paused) return;
  if (state.countdown > 0) {
    state.countdown -= dt;
    return;
  }
  state.timer += dt;
  for (const kart of state.racers) {
    const t = state.track.spline.getTangentAt(kart.s).normalize();
    const right = new THREE.Vector3(-t.z, 0, t.x);
    const input = kart.isPlayer ? playerInput() : aiInput(kart, dt);
    stepKart(kart, input, dt, right);
    resolveProgress(kart);
  }
  applyItems(dt);
  rankRacers();
  updateCamera();
  updateHud();
}

function playerInput() {
  return {
    throttle: keys.KeyW || keys.ArrowUp ? 1 : 0,
    brake: keys.KeyS || keys.ArrowDown ? 1 : 0,
    steer: (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0),
    drift: !!(keys.ShiftLeft || keys.ShiftRight)
  };
}

function aiInput(kart, dt) {
  const diff = state.difficulty;
  kart.aiCooldown -= dt;
  if (kart.aiCooldown <= 0) {
    kart.aiCooldown = 0.4 / diff.reaction + Math.random() * 0.4;
    const hazard = state.track.hazards.find((h) => inWrapRange(kart.s, h.s0, h.s1));
    kart.aiLaneIntent = hazard ? hazard.laneBias : (Math.random() - 0.5) * state.track.width * 0.35;
    const ahead = state.racers.find((r) => r !== kart && lapProgress(r) > lapProgress(kart) && lapProgress(r) - lapProgress(kart) < 0.03 && Math.abs(r.lane - kart.lane) < 4);
    if (ahead) kart.aiLaneIntent += (Math.random() > 0.5 ? 1 : -1) * 6 * diff.overtake;
    if (kart.item && Math.random() < 0.3 * diff.itemRate) useItem(kart);
  }
  return { throttle: 1, brake: 0, steer: Math.sign(kart.aiLaneIntent - kart.lane), drift: Math.random() < 0.03 };
}

function stepKart(kart, input, dt, right) {
  if (kart.stun > 0) kart.stun -= dt;
  if (kart.steerLock > 0) kart.steerLock -= dt;
  if (kart.slip > 0) kart.slip -= dt;
  if (kart.boostTimer > 0) kart.boostTimer -= dt;
  if (kart.shield > 0) kart.shield -= dt;

  const canDrive = kart.stun <= 0;
  const steer = kart.steerLock > 0 ? 0 : input.steer;
  const driftGain = state.track.driftZones.some((z) => inWrapRange(kart.s, z.s0, z.s1)) ? 1.2 : 1.0;

  const baseTop = 48 * kart.stats.speed * (kart.isPlayer ? 1 : state.difficulty.topSpeed);
  const accel = (44 * kart.stats.accel) * (input.throttle ? 1 : -0.6 * input.brake);
  if (canDrive) kart.speed = THREE.MathUtils.clamp(kart.speed + accel * dt, 0, baseTop);
  kart.speed *= input.throttle ? 0.998 : 0.985;

  if (input.drift && Math.abs(steer) > 0.3 && kart.speed > 15) {
    kart.drifting = true;
    kart.driftCharge += dt * kart.stats.drift * driftGain;
  } else if (kart.drifting) {
    const c = kart.driftCharge;
    if (c >= 1.5) kart.boostTimer = 1.5;
    else if (c >= 1.1) kart.boostTimer = 1.1;
    else if (c >= 0.7) kart.boostTimer = 0.7;
    kart.driftCharge = 0;
    kart.drifting = false;
    sfx(660, 0.08);
  }

  const boostMult = kart.boostTimer > 0 ? 1.18 : 1;
  const steerRate = 25 * kart.stats.handling;
  kart.laneV += steer * steerRate * dt;
  kart.laneV *= kart.slip > 0 ? 0.88 : 0.78;
  kart.lane += kart.laneV * dt;

  const w = state.track.width * 0.52;
  const offroad = Math.abs(kart.lane) > w;
  if (offroad) {
    const penalty = kart.boostTimer > 0 ? 0.975 : 0.95;
    kart.speed *= penalty; // boost中は50%軽減
  }
  const wall = state.track.width * 0.75;
  if (Math.abs(kart.lane) > wall) {
    kart.lane = THREE.MathUtils.clamp(kart.lane, -wall, wall);
    kart.laneV *= -0.35;
    kart.speed *= 0.94;
  }

  if (state.track.hazards.some((h) => inWrapRange(kart.s, h.s0, h.s1)) && Math.abs(kart.lane) < 6) {
    kart.speed *= 0.98;
  }

  kart.s = (kart.s + (kart.speed * boostMult * dt) / state.track.length + 1) % 1;
  const p = state.track.spline.getPointAt(kart.s);
  kart.mesh.position.copy(p).addScaledVector(right, state.track.mirror ? -kart.lane : kart.lane).setY(1.1);
  kart.mesh.rotation.y = Math.atan2(right.x, right.z) - steer * 0.15;

  if (!kart.item && Math.random() < dt * 0.085 && nearItemBox(kart.s)) kart.item = rollItem(kart.place);
}

function resolveProgress(kart) {
  const prev = kart.split;
  if (prev > 0.95 && kart.s < 0.05) {
    kart.lap += 1;
    if (kart.lap > 3 && !kart.finished) {
      kart.finished = true;
      kart.speed *= 0.95;
    }
  }
  kart.split = kart.s;
}

function lapProgress(k) { return (k.lap - 1) + k.s; }
function rankRacers() {
  state.racers.sort((a, b) => lapProgress(b) - lapProgress(a));
  state.racers.forEach((r, i) => (r.place = i + 1));
}

function updateCamera() {
  const p = state.player;
  const t = state.track.spline.getTangentAt(p.s).normalize();
  const pos = p.mesh.position.clone();
  camera.position.copy(pos).addScaledVector(t, -18).add(new THREE.Vector3(0, 13, 0));
  camera.lookAt(pos.clone().addScaledVector(t, 12));
}

function updateHud() {
  const p = state.player;
  statusEl.textContent = `P${p.place} | Lap ${Math.min(p.lap, 3)}/3${p.lap === 3 ? ' FINAL LAP' : ''}`;
  itemEl.textContent = `Item: ${p.item || '-'}`;
  timerEl.textContent = fmtTime(state.timer);
  splitEl.textContent = `Drift ${p.driftCharge.toFixed(2)}s`;
  drawMinimap();
}

function drawMinimap() {
  mmctx.clearRect(0, 0, minimap.width, minimap.height);
  mmctx.strokeStyle = '#99a7d8';
  mmctx.beginPath();
  for (let i = 0; i <= 120; i++) {
    const p = state.track.spline.getPointAt(i / 120);
    const x = 110 + p.x * 0.7;
    const y = 110 + p.z * 0.7;
    i ? mmctx.lineTo(x, y) : mmctx.moveTo(x, y);
  }
  mmctx.stroke();
  for (const r of state.racers) {
    const p = state.track.spline.getPointAt(r.s);
    mmctx.fillStyle = r.isPlayer ? '#ffd04f' : '#ff5f88';
    mmctx.beginPath();
    mmctx.arc(110 + p.x * 0.7, 110 + p.z * 0.7, r.isPlayer ? 4 : 3, 0, Math.PI * 2);
    mmctx.fill();
  }
}

function nearItemBox(s) {
  return [0.12, 0.33, 0.54, 0.77].some((b) => Math.abs(s - b) < 0.01);
}

function rollItem(place) {
  const table = ITEM_WEIGHTS.find((t) => place <= t.max) || ITEM_WEIGHTS.at(-1);
  const sum = table.w.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < table.w.length; i++) {
    r -= table.w[i];
    if (r <= 0) return ITEMS[i];
  }
  return ITEMS[0];
}

const effects = [];
function useItem(kart) {
  if (!kart?.item) return;
  const item = kart.item;
  kart.item = null;
  switch (item) {
    case 'Pulse': effects.push({ t: 0.3, fn: (r) => { if (r !== kart && distWrap(r.s, kart.s) < 0.02) r.speed *= 0.9; } }); break;
    case 'Spark': kart.boostTimer = Math.max(kart.boostTimer, 0.8); break;
    case 'Slick': effects.push({ t: 4, fn: (r) => { if (r !== kart && distWrap(r.s, kart.s) < 0.016) r.slip = 0.6; } }); break;
    case 'Shield': kart.shield = 4; break;
    case 'Jolt': effects.push({ t: 0.2, fn: (r) => { if (r !== kart && distWrap(r.s, kart.s) < 0.018) r.stun = Math.min(1.1, r.stun + 0.6); } }); break;
    case 'Swap': {
      const target = state.racers[Math.max(0, kart.place - 2)];
      if (target && target !== kart) [kart.s, target.s] = [target.s, kart.s];
      break;
    }
    case 'Mist': effects.push({ t: 3, fn: (r) => { if (r !== kart && distWrap(r.s, kart.s) < 0.02) r.steerLock = Math.min(0.55, r.steerLock + 0.25); } }); break;
    case 'CoinBoost': kart.speed += 5; kart.boostTimer = Math.max(0.6, kart.boostTimer); break;
  }
  sfx(420 + Math.random() * 100, 0.06);
}

function applyItems(dt) {
  for (const e of effects) {
    e.t -= dt;
    for (const r of state.racers) if (r.shield <= 0) e.fn(r);
  }
  for (let i = effects.length - 1; i >= 0; i--) if (effects[i].t <= 0) effects.splice(i, 1);
}

function inWrapRange(v, a, b) {
  if (a <= b) return v >= a && v <= b;
  return v >= a || v <= b;
}
function distWrap(a, b) {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
}
function fmtTime(s) {
  const ms = Math.floor((s % 1) * 1000).toString().padStart(3, '0');
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  const min = Math.floor(s / 60).toString().padStart(2, '0');
  return `${min}:${sec}.${ms}`;
}
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) [a[i], a[Math.random() * (i + 1) | 0]] = [a[Math.random() * (i + 1) | 0], a[i]]; return a; }

function togglePause() {
  if (!state) return;
  state.paused = !state.paused;
  ui.pause.classList.toggle('hidden', !state.paused);
}

document.querySelector('#startBtn').onclick = async () => { initAudio(); startRace(); };
document.querySelector('#optionsBtn').onclick = () => ui.options.classList.toggle('hidden');
document.querySelector('#closeOptionsBtn').onclick = () => ui.options.classList.add('hidden');
document.querySelector('#resumeBtn').onclick = () => togglePause();
document.querySelector('#restartBtn').onclick = () => startRace();
document.querySelector('#quitBtn').onclick = () => { state = null; hud.classList.add('hidden'); ui.pause.classList.add('hidden'); ui.flow.classList.remove('hidden'); stopMusic(); };
document.querySelector('#masterVolume').oninput = (e) => audio && (audio.master.gain.value = +e.target.value);
document.querySelector('#musicVolume').oninput = (e) => audio && (audio.music.gain.value = +e.target.value);

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function initAudio() {
  if (audio) return;
  const ctx = new AudioContext();
  const master = ctx.createGain(); master.gain.value = +document.querySelector('#masterVolume').value; master.connect(ctx.destination);
  const music = ctx.createGain(); music.gain.value = +document.querySelector('#musicVolume').value; music.connect(master);
  const sfxBus = ctx.createGain(); sfxBus.gain.value = 0.8; sfxBus.connect(master);
  audio = { ctx, master, music, sfxBus, osc: null, lfo: null };
}

function startMusic(baseHz) {
  if (!audio) return;
  stopMusic();
  const osc = audio.ctx.createOscillator();
  const lfo = audio.ctx.createOscillator();
  const lfoGain = audio.ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = baseHz;
  lfo.frequency.value = 0.21;
  lfoGain.gain.value = 25;
  lfo.connect(lfoGain).connect(osc.frequency);
  osc.connect(audio.music);
  osc.start();
  lfo.start();
  audio.osc = osc; audio.lfo = lfo;
}

function stopMusic() {
  if (!audio?.osc) return;
  audio.osc.stop(); audio.lfo.stop();
  audio.osc = null; audio.lfo = null;
}

function sfx(freq, len) {
  if (!audio) return;
  const o = audio.ctx.createOscillator();
  const g = audio.ctx.createGain();
  o.type = 'square';
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.1, audio.ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, audio.ctx.currentTime + len);
  o.connect(g).connect(audio.sfxBus);
  o.start();
  o.stop(audio.ctx.currentTime + len);
}

let last = performance.now();
(function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
})(last);
