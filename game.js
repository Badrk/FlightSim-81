const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("status");
const phaseEl = document.getElementById("phase");
const helpEl = document.getElementById("help");
const helpButton = document.getElementById("helpButton");
const helpModal = document.getElementById("helpModal");
const closeHelp = document.getElementById("closeHelp");

const W = canvas.width;
const H = canvas.height;
const keys = new Set();
const pressed = new Set();

const palette = {
  sky: "#17325c",
  farSky: "#284e79",
  ground: "#183326",
  field: "#2f5b2f",
  mountain: "#5d5d68",
  snow: "#d8dce0",
  runway: "#34383c",
  bright: "#4ef07d",
  dim: "#1e8f45",
  amber: "#f2b84b",
  cyan: "#56d7ff",
  paper: "#e7dfc8",
  red: "#ff5b55",
  water: "#2d83b8",
  town: "#b6a46d",
  black: "#020403"
};

const airports = [
  { name: "HAYES", x: 0, z: 0, heading: 90, length: 2600, width: 150, elev: 0 },
  { name: "NORTHRIDGE", x: 9200, z: -3900, heading: 90, length: 2300, width: 150, elev: 160 }
];

const route = [
  { name: "RIVER", x: 2500, z: -650, alt: 1300 },
  { name: "TOWN", x: 5200, z: -2100, alt: 1800 },
  { name: "FINAL", x: 6900, z: -3900, alt: 900 },
  { name: "RWY 09", x: airports[1].x, z: airports[1].z, alt: airports[1].elev }
];

const river = [
  { x: -1500, z: 1100 },
  { x: 900, z: 650 },
  { x: 2600, z: -700 },
  { x: 4300, z: -900 },
  { x: 6200, z: -2300 },
  { x: 8500, z: -3000 },
  { x: 11100, z: -4700 }
];

const towns = [
  { name: "MILL", x: 1800, z: 900, size: 520 },
  { name: "LAKE", x: 5150, z: -1900, size: 720 },
  { name: "RIDGE", x: 8700, z: -4700, size: 620 }
];

const mountains = [
  { x: 4100, z: -4600, h: 1280, w: 950 },
  { x: 5700, z: -5200, h: 1680, w: 1200 },
  { x: 7700, z: -6100, h: 1360, w: 1000 },
  { x: 9600, z: -6800, h: 1500, w: 1250 }
];

const trees = [];
for (let i = 0; i < 90; i += 1) {
  const x = -800 + (i * 347) % 11500;
  const z = 1500 - (i * 619) % 8200;
  if (Math.abs(z) > 260 || x < -1000 || x > 11000) trees.push({ x, z, h: 65 + (i % 5) * 12 });
}

let plane;
let phase = "preflight";
let activeWaypoint = 0;
let last = performance.now();
let messageTimer = 0;
let audio;
let paused = false;

function reset() {
  plane = {
    x: -780,
    z: 0,
    altitude: 0,
    groundAltitude: 0,
    heading: 90,
    pitch: 0,
    bank: 0,
    speed: 0,
    throttle: 0,
    flaps: 0,
    gearDown: true,
    verticalSpeed: 0,
    fuel: 100,
    onGround: true,
    airborneGrace: 0,
    state: "flying",
    score: 0,
    stall: false
  };
  phase = "preflight";
  activeWaypoint = 0;
  setMessage("HAYES runway 09. Set flaps 15, gear down, then full throttle for takeoff.");
  updateHelp();
}

function setMessage(text) {
  statusEl.textContent = text;
  messageTimer = 3.8;
}

function setPaused(next) {
  paused = next;
  helpModal.hidden = !next;
  if (next) {
    keys.clear();
    closeHelp.focus();
  } else {
    helpButton.focus();
  }
}

function toggleHelp() {
  setPaused(!paused);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wrapDeg(value) {
  return ((value % 360) + 360) % 360;
}

function signedAngle(from, to) {
  let diff = wrapDeg(to - from);
  if (diff > 180) diff -= 360;
  return diff;
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function bearingTo(target) {
  return wrapDeg(Math.atan2(target.x - plane.x, -(target.z - plane.z)) * 180 / Math.PI);
}

function terrainHeight(x, z) {
  let height = 0;
  for (const m of mountains) {
    const d = Math.hypot((x - m.x) / m.w, (z - m.z) / m.w);
    if (d < 1.2) height = Math.max(height, m.h * Math.max(0, 1 - d));
  }
  return height;
}

function runwayLocal(airport) {
  const hdg = airport.heading * Math.PI / 180;
  const dx = plane.x - airport.x;
  const dz = plane.z - airport.z;
  const along = dx * Math.sin(hdg) + dz * -Math.cos(hdg);
  const lateral = dx * Math.cos(hdg) + dz * Math.sin(hdg);
  return { along, lateral };
}

function isOnRunway(airport) {
  const p = runwayLocal(airport);
  return Math.abs(p.along) < airport.length / 2 && Math.abs(p.lateral) < airport.width / 2;
}

function setPhase(next) {
  if (phase === next) return;
  phase = next;
  updateHelp();
}

function updateHelp() {
  const help = {
    preflight: ["Flaps F to 15.", "Keep gear down.", "Throttle A to 100% and hold runway heading 090."],
    takeoff: ["At 55-60 kt, ease nose up with Down Arrow.", "Flaps 15 will help the aircraft fly off.", "Climb through 300 ft before raising gear."],
    climb: ["Gear up with G.", "Flaps F to 0 above 500 ft.", "Climb to about 1600 ft and steer to the map arrow."],
    cruise: ["Follow the cyan bearing pointer and map route.", "Keep speed 105-145 kt.", "Stay above terrain and below 2500 ft."],
    approach: ["Descend toward FINAL at 900 ft.", "Set throttle near 45%.", "Line up with runway 09."],
    landing: ["Gear down, flaps 30.", "Aim for 85-105 kt.", "Touch down gently on the runway with wings level."],
    ended: ["Press R to reset.", "Score rewards centerline, sink rate, speed, and correct configuration."]
  };
  phaseEl.textContent = phase.charAt(0).toUpperCase() + phase.slice(1);
  helpEl.innerHTML = help[phase].map((item) => `<li>${item}</li>`).join("");
}

function initAudio() {
  if (audio || !window.AudioContext && !window.webkitAudioContext) return;
  const Audio = window.AudioContext || window.webkitAudioContext;
  const context = new Audio();
  const engine = context.createOscillator();
  const growl = context.createOscillator();
  const tremolo = context.createOscillator();
  const warning = context.createOscillator();
  const tremoloGain = context.createGain();
  const master = context.createGain();
  const warningGain = context.createGain();
  const filter = context.createBiquadFilter();

  engine.type = "sawtooth";
  growl.type = "square";
  tremolo.type = "sine";
  warning.type = "square";
  filter.type = "lowpass";
  filter.frequency.value = 420;
  engine.frequency.value = 48;
  growl.frequency.value = 24;
  tremolo.frequency.value = 7;
  warning.frequency.value = 880;
  tremoloGain.gain.value = 0.018;
  master.gain.value = 0;
  warningGain.gain.value = 0;

  tremolo.connect(tremoloGain);
  tremoloGain.connect(master.gain);
  engine.connect(filter);
  growl.connect(filter);
  filter.connect(master);
  warning.connect(warningGain);
  warningGain.connect(context.destination);
  master.connect(context.destination);
  engine.start();
  growl.start();
  tremolo.start();
  warning.start();
  audio = { context, engine, growl, filter, master, warningGain };
}

function updateAudio() {
  if (!audio) return;
  const now = audio.context.currentTime;
  const power = plane.state === "flying" && !paused ? plane.throttle / 100 : 0;
  const motion = plane.state === "flying" && !paused ? clamp(plane.speed / 130, 0, 1) : 0;
  const configWarning = phase === "landing" && (!plane.gearDown || plane.flaps !== 30);
  const warning = plane.state === "flying" && !paused && (plane.stall || configWarning) ? 0.035 : 0;
  audio.engine.frequency.setTargetAtTime(42 + power * 78 + motion * 18, now, 0.08);
  audio.growl.frequency.setTargetAtTime(20 + power * 26, now, 0.1);
  audio.filter.frequency.setTargetAtTime(260 + power * 820, now, 0.12);
  audio.master.gain.setTargetAtTime(0.018 + power * 0.09 + motion * 0.025, now, 0.08);
  audio.warningGain.gain.setTargetAtTime(warning, now, 0.03);
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if (["arrowleft", "arrowright", "arrowup", "arrowdown", "a", "z", "f", "g", "h", "r", " ", "escape"].includes(key)) {
    event.preventDefault();
  }
  if (!pressed.has(key)) {
    if (key === "h" || key === "escape" && paused) {
      toggleHelp();
      pressed.add(key);
      return;
    }
    if (paused) {
      pressed.add(key);
      return;
    }
    initAudio();
    if (audio && audio.context.state === "suspended") audio.context.resume();
    if (key === "r") reset();
    if (key === "f" && plane.state === "flying") plane.flaps = plane.flaps === 0 ? 15 : plane.flaps === 15 ? 30 : 0;
    if (key === "g" && plane.state === "flying" && !plane.onGround) plane.gearDown = !plane.gearDown;
  }
  pressed.add(key);
  keys.add(key);
});

window.addEventListener("pointerdown", () => {
  if (paused) return;
  initAudio();
  if (audio && audio.context.state === "suspended") audio.context.resume();
});

helpButton.addEventListener("click", toggleHelp);
closeHelp.addEventListener("click", () => setPaused(false));
helpModal.addEventListener("click", (event) => {
  if (event.target === helpModal) setPaused(false);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
  pressed.delete(event.key.toLowerCase());
});

function updatePhase() {
  const destination = airports[1];
  const dme = dist(plane, destination);
  if (plane.state !== "flying") return setPhase("ended");
  if (plane.onGround && plane.speed < 35 && dist(plane, airports[0]) < 1500) return setPhase("preflight");
  if (plane.onGround && plane.speed >= 35) return setPhase("takeoff");
  if (plane.altitude < 900 && dme > 5200) return setPhase("climb");
  if (dme > 3000) return setPhase("cruise");
  if (dme > 1100 || plane.altitude > 420) return setPhase("approach");
  return setPhase("landing");
}

function update(dt) {
  if (plane.state !== "flying") return;

  const bankInput = (keys.has("arrowright") ? 1 : 0) - (keys.has("arrowleft") ? 1 : 0);
  const pitchInput = (keys.has("arrowdown") ? 1 : 0) - (keys.has("arrowup") ? 1 : 0);
  const throttleInput = (keys.has("a") ? 1 : 0) - (keys.has("z") ? 1 : 0);

  plane.throttle = clamp(plane.throttle + throttleInput * 42 * dt, 0, 100);
  plane.bank += bankInput * 48 * dt;
  plane.bank *= 1 - Math.min(0.8, dt * (plane.onGround ? 2.8 : 0.9));
  plane.bank = clamp(plane.bank, -55, 55);

  plane.pitch += pitchInput * 15 * dt;
  plane.pitch *= 1 - Math.min(0.5, dt * 0.18);
  plane.pitch = clamp(plane.pitch, plane.onGround ? -1 : -14, 15);

  const flapDrag = plane.flaps * 0.38;
  const gearDrag = plane.gearDown ? 8 : 0;
  const targetSpeed = plane.throttle * 1.72 - flapDrag - gearDrag - Math.max(0, plane.pitch) * 1.45;
  plane.speed += (targetSpeed - plane.speed) * dt * (plane.onGround ? 0.46 : 0.32);
  plane.speed = clamp(plane.speed, 0, 168);

  const minFlying = 54 - plane.flaps * 0.45;
  const speedLift = (plane.speed - 105) * 4.5;
  const pitchLift = plane.pitch * 150;
  const powerLift = (plane.throttle - 55) * 7;
  const flapLift = plane.flaps * 10;
  plane.stall = !plane.onGround && plane.speed < minFlying + 5;
  const sinkPenalty = plane.stall ? -920 : 0;
  const targetVs = plane.onGround ? 0 : speedLift + pitchLift + powerLift + flapLift + sinkPenalty;
  plane.verticalSpeed += (targetVs - plane.verticalSpeed) * dt * 0.7;

  const turnRate = Math.sin(plane.bank * Math.PI / 180) * plane.speed * (plane.onGround ? 0.018 : 0.078);
  plane.heading = wrapDeg(plane.heading + turnRate * dt);

  const headingRad = plane.heading * Math.PI / 180;
  plane.x += Math.sin(headingRad) * plane.speed * 1.68 * dt;
  plane.z -= Math.cos(headingRad) * plane.speed * 1.68 * dt;

  const currentTerrain = terrainHeight(plane.x, plane.z);
  const nearStartRunway = isOnRunway(airports[0]) && plane.altitude < 45;
  const nearDestRunway = isOnRunway(airports[1]) && plane.altitude < airports[1].elev + 80;
  plane.groundAltitude = nearStartRunway ? airports[0].elev : nearDestRunway ? airports[1].elev : currentTerrain;

  if (plane.onGround) {
    plane.altitude = plane.groundAltitude;
    plane.verticalSpeed = 0;
    const wantsToFly = plane.pitch > 2.5 || plane.flaps >= 15 && plane.speed > 62;
    if (plane.speed > minFlying + 6 && wantsToFly && isOnRunway(airports[0])) {
      plane.onGround = false;
      plane.airborneGrace = 1.8;
      plane.pitch = Math.max(plane.pitch, 5);
      plane.verticalSpeed = 620;
      setMessage("Positive climb. Gear up above 300 ft, flaps up above 500 ft.");
    }
  } else {
    plane.altitude += (plane.verticalSpeed / 60) * dt;
    plane.airborneGrace = Math.max(0, plane.airborneGrace - dt);
    const clearance = plane.altitude - plane.groundAltitude;
    if (clearance <= 0 && plane.airborneGrace <= 0) handleGroundContact();
  }

  plane.fuel = clamp(plane.fuel - (0.002 + plane.throttle * 0.00014) * dt, 0, 100);
  if (plane.fuel <= 0) {
    plane.state = "crashed";
    setMessage("Fuel exhausted. Press R to try again.");
  }

  while (activeWaypoint < route.length - 1 && dist(plane, route[activeWaypoint]) < 750) activeWaypoint += 1;

  updatePhase();
  updateAdvisory(dt);
  updateAudio();
}

function handleGroundContact() {
  const destination = airports[1];
  if (isOnRunway(destination) && Math.abs(signedAngle(plane.heading, destination.heading)) < 18) {
    const local = runwayLocal(destination);
    const sink = Math.abs(plane.verticalSpeed);
    const speedGood = Math.abs(plane.speed - 92);
    const bank = Math.abs(plane.bank);
    const configured = plane.gearDown && plane.flaps === 30;
    if (sink < 520 && speedGood < 24 && bank < 9 && configured) {
      plane.state = "landed";
      plane.onGround = true;
      plane.altitude = destination.elev;
      plane.score = Math.max(0, Math.round(100 - Math.abs(local.lateral) * 0.22 - sink * 0.045 - speedGood * 1.3 - bank * 2));
      setMessage(`NORTHRIDGE touchdown. Score ${plane.score}. Press R for another flight.`);
      updateHelp();
      return;
    }
    plane.state = "crashed";
    setMessage("Bad touchdown. Use gear down, flaps 30, 85-105 kt, low sink rate.");
    updateHelp();
    return;
  }
  plane.state = "crashed";
  setMessage(terrainHeight(plane.x, plane.z) > 40 ? "Terrain impact. Climb over mountains and watch the map." : "Off-airport landing. Find the destination runway first.");
  updateHelp();
}

function updateAdvisory(dt) {
  if (messageTimer > 0) {
    messageTimer -= dt;
    return;
  }
  const wp = route[activeWaypoint];
  const desired = bearingTo(wp);
  const err = signedAngle(plane.heading, desired);
  const dme = dist(plane, airports[1]);
  if (phase === "preflight") setMessage("HAYES runway 09. Set flaps 15, gear down, then full throttle for takeoff.");
  else if (phase === "takeoff") setMessage("Rotate at 60 kt with Down Arrow. Hold runway heading.");
  else if (phase === "climb" && !plane.gearDown && plane.flaps === 0) setMessage("Clean climb. Follow the cyan bearing pointer.");
  else if (phase === "climb") setMessage("Raise gear above 300 ft and retract flaps above 500 ft.");
  else if (phase === "cruise" && Math.abs(err) > 10) setMessage(err > 0 ? "Turn right toward the waypoint." : "Turn left toward the waypoint.");
  else if (phase === "approach") setMessage(`Airport ${Math.round(dme)} m. Descend, line up runway 09.`);
  else if (phase === "landing") setMessage("Landing checks: gear down, flaps 30, throttle 35-50%, wings level.");
  else if (plane.stall) setMessage("Stall warning. Nose down or add power.");
  else setMessage(`Next ${wp.name}. Bearing ${String(Math.round(desired)).padStart(3, "0")}.`);
}

function toScreen(x, y, z) {
  const relX = x - plane.x;
  const relZ = z - plane.z;
  const relY = y - plane.altitude;
  const headingRad = plane.heading * Math.PI / 180;
  const forwardX = Math.sin(headingRad);
  const forwardZ = -Math.cos(headingRad);
  const rightX = Math.cos(headingRad);
  const rightZ = Math.sin(headingRad);
  const tx = relX * rightX + relZ * rightZ;
  const tz = relX * forwardX + relZ * forwardZ;
  if (tz < 40) return null;
  const scale = 420 / tz;
  return {
    x: W / 2 + tx * scale,
    y: H / 2 - relY * scale + plane.pitch * 4,
    scale
  };
}

function drawLine3d(a, b, color, width = 2) {
  const pa = toScreen(a.x, a.y, a.z);
  const pb = toScreen(b.x, b.y, b.z);
  if (!pa || !pb) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(pa.x, pa.y);
  ctx.lineTo(pb.x, pb.y);
  ctx.stroke();
}

function drawPoly(points, color, stroke = null) {
  const projected = points.map((p) => toScreen(p.x, p.y, p.z));
  if (projected.some((p) => !p)) return;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(projected[0].x, projected[0].y);
  for (let i = 1; i < projected.length; i += 1) ctx.lineTo(projected[i].x, projected[i].y);
  ctx.closePath();
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function drawRunway(airport) {
  const hdg = airport.heading * Math.PI / 180;
  const fx = Math.sin(hdg);
  const fz = -Math.cos(hdg);
  const rx = Math.cos(hdg);
  const rz = Math.sin(hdg);
  const l = airport.length / 2;
  const w = airport.width / 2;
  const y = airport.elev + 2;
  const corners = [
    { x: airport.x - fx * l - rx * w, y, z: airport.z - fz * l - rz * w },
    { x: airport.x + fx * l - rx * w, y, z: airport.z + fz * l - rz * w },
    { x: airport.x + fx * l + rx * w, y, z: airport.z + fz * l + rz * w },
    { x: airport.x - fx * l + rx * w, y, z: airport.z - fz * l + rz * w }
  ];
  drawPoly(corners, palette.runway, palette.paper);
  for (let i = -4; i <= 4; i += 1) {
    const c = i * 160;
    drawLine3d(
      { x: airport.x + fx * (c - 45), y: y + 3, z: airport.z + fz * (c - 45) },
      { x: airport.x + fx * (c + 45), y: y + 3, z: airport.z + fz * (c + 45) },
      palette.amber,
      3
    );
  }
}

function drawTree(tree) {
  const base = toScreen(tree.x, 0, tree.z);
  const top = toScreen(tree.x, tree.h, tree.z);
  if (!base || !top || base.scale > 0.8) return;
  const s = clamp(base.scale * 70, 2, 14);
  ctx.fillStyle = "#255f35";
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(base.x - s, base.y);
  ctx.lineTo(base.x + s, base.y);
  ctx.closePath();
  ctx.fill();
}

function drawTown(town) {
  for (let i = 0; i < 10; i += 1) {
    const bx = town.x + ((i % 5) - 2) * town.size * 0.18;
    const bz = town.z + (Math.floor(i / 5) - 0.5) * town.size * 0.24;
    const p = toScreen(bx, 20, bz);
    if (!p) continue;
    const s = clamp(p.scale * 110, 2, 12);
    ctx.fillStyle = palette.town;
    ctx.fillRect(p.x - s / 2, p.y - s, s, s);
  }
}

function drawMountains() {
  for (const m of mountains) {
    drawPoly([
      { x: m.x - m.w, y: 0, z: m.z + m.w * 0.2 },
      { x: m.x, y: m.h, z: m.z },
      { x: m.x + m.w, y: 0, z: m.z + m.w * 0.2 }
    ], palette.mountain, "#8a8b91");
    drawPoly([
      { x: m.x - m.w * 0.22, y: m.h * 0.72, z: m.z + m.w * 0.02 },
      { x: m.x, y: m.h, z: m.z },
      { x: m.x + m.w * 0.22, y: m.h * 0.72, z: m.z + m.w * 0.02 }
    ], palette.snow);
  }
}

function drawWorld() {
  const horizonY = H / 2 + plane.pitch * 4;
  ctx.fillStyle = palette.farSky;
  ctx.fillRect(0, 0, W, horizonY);
  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, horizonY, W, H - horizonY);

  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-plane.bank * Math.PI / 180);
  ctx.translate(-W / 2, -H / 2);

  ctx.strokeStyle = palette.cyan;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-160, horizonY);
  ctx.lineTo(W + 160, horizonY);
  ctx.stroke();

  for (let x = -2000; x <= 12000; x += 700) drawLine3d({ x, y: 0, z: 1600 }, { x, y: 0, z: -7600 }, palette.dim, 1);
  for (let z = 1600; z >= -7600; z -= 700) drawLine3d({ x: -2000, y: 0, z }, { x: 12000, y: 0, z }, palette.dim, 1);

  for (let i = 0; i < river.length - 1; i += 1) drawLine3d({ ...river[i], y: 4 }, { ...river[i + 1], y: 4 }, palette.water, 6);
  drawMountains();
  for (const town of towns) drawTown(town);
  for (const tree of trees) drawTree(tree);
  for (const airport of airports) drawRunway(airport);

  const wp = route[activeWaypoint];
  drawLine3d({ x: plane.x, y: plane.altitude - 40, z: plane.z }, { x: wp.x, y: wp.alt, z: wp.z }, palette.cyan, 1);

  ctx.restore();
}

function drawInstrument(cx, cy, r, label, value, min, max, color, formatter = Math.round) {
  ctx.strokeStyle = palette.paper;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i <= 8; i += 1) {
    const a = (-210 + i * 30) * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r - 8), cy + Math.sin(a) * (r - 8));
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.stroke();
  }
  const labels = [
    { text: formatter(min), angle: -210 },
    { text: formatter((min + max) / 2), angle: -90 },
    { text: formatter(max), angle: 30 }
  ];
  ctx.fillStyle = palette.paper;
  ctx.font = "8px monospace";
  ctx.textAlign = "center";
  for (const tick of labels) {
    const a = tick.angle * Math.PI / 180;
    ctx.fillText(String(tick.text), cx + Math.cos(a) * (r - 15), cy + Math.sin(a) * (r - 15) + 3);
  }
  const normalized = clamp((value - min) / (max - min), 0, 1);
  const angle = (-210 + normalized * 240) * Math.PI / 180;
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(angle) * (r - 12), cy + Math.sin(angle) * (r - 12));
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = "10px monospace";
  ctx.fillText(String(formatter(value)), cx, cy + 4);
  ctx.fillStyle = palette.paper;
  ctx.font = "12px monospace";
  ctx.textAlign = "center";
  ctx.fillText(label, cx, cy + r + 16);
}

function drawHorizon(cx, cy, r) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-plane.bank * Math.PI / 180);
  const offset = clamp(plane.pitch * 1.3, -r + 8, r - 8);
  ctx.fillStyle = palette.farSky;
  ctx.fillRect(-r + 2, -r + 2, r * 2 - 4, r + offset - 2);
  ctx.fillStyle = palette.ground;
  ctx.fillRect(-r + 2, offset, r * 2 - 4, r - offset - 2);
  ctx.strokeStyle = palette.cyan;
  ctx.beginPath();
  ctx.moveTo(-r + 5, offset);
  ctx.lineTo(r - 5, offset);
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = palette.paper;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = palette.bright;
  ctx.beginPath();
  ctx.moveTo(cx - 20, cy);
  ctx.lineTo(cx - 6, cy);
  ctx.moveTo(cx + 6, cy);
  ctx.lineTo(cx + 20, cy);
  ctx.moveTo(cx, cy - 5);
  ctx.lineTo(cx, cy + 5);
  ctx.stroke();
  ctx.fillStyle = palette.paper;
  ctx.font = "12px monospace";
  ctx.textAlign = "center";
  ctx.fillText("HOR", cx, cy + r + 16);
}

function drawCompass(cx, cy, r, bearing) {
  ctx.strokeStyle = palette.paper;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = palette.paper;
  ctx.font = "9px monospace";
  ctx.textAlign = "center";
  const labels = [
    ["N", 0],
    ["E", 90],
    ["S", 180],
    ["W", 270]
  ];
  for (const [label, deg] of labels) {
    const a = (deg - plane.heading - 90) * Math.PI / 180;
    ctx.fillText(label, cx + Math.cos(a) * (r - 10), cy + Math.sin(a) * (r - 10) + 3);
  }
  ctx.strokeStyle = palette.amber;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r + 7);
  ctx.lineTo(cx - 5, cy - r + 17);
  ctx.lineTo(cx + 5, cy - r + 17);
  ctx.closePath();
  ctx.stroke();

  const relBearing = (bearing - plane.heading - 90) * Math.PI / 180;
  ctx.strokeStyle = palette.cyan;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(relBearing) * (r - 8), cy + Math.sin(relBearing) * (r - 8));
  ctx.stroke();
  ctx.fillStyle = palette.bright;
  ctx.font = "10px monospace";
  ctx.fillText(String(Math.round(plane.heading)).padStart(3, "0"), cx, cy + 4);
  ctx.fillStyle = palette.paper;
  ctx.font = "12px monospace";
  ctx.fillText("COMP", cx, cy + r + 16);
}

function mapPoint(x, z, box) {
  const minX = -1200;
  const maxX = 10200;
  const minZ = -6600;
  const maxZ = 1600;
  return {
    x: box.x + ((x - minX) / (maxX - minX)) * box.w,
    y: box.y + ((z - maxZ) / (minZ - maxZ)) * box.h
  };
}

function drawMap() {
  const box = { x: W - 148, y: 18, w: 128, h: 100 };
  ctx.fillStyle = "rgba(2, 4, 3, 0.82)";
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.strokeStyle = palette.bright;
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  ctx.strokeStyle = palette.water;
  ctx.beginPath();
  river.forEach((p, i) => {
    const q = mapPoint(p.x, p.z, box);
    if (i === 0) ctx.moveTo(q.x, q.y);
    else ctx.lineTo(q.x, q.y);
  });
  ctx.stroke();
  ctx.strokeStyle = palette.dim;
  ctx.beginPath();
  route.forEach((p, i) => {
    const q = mapPoint(p.x, p.z, box);
    if (i === 0) ctx.moveTo(q.x, q.y);
    else ctx.lineTo(q.x, q.y);
  });
  ctx.stroke();
  for (const airport of airports) {
    const q = mapPoint(airport.x, airport.z, box);
    ctx.fillStyle = palette.amber;
    ctx.fillRect(q.x - 3, q.y - 3, 6, 6);
  }
  const p = mapPoint(plane.x, plane.z, box);
  ctx.fillStyle = palette.cyan;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
  ctx.fill();
  const wp = mapPoint(route[activeWaypoint].x, route[activeWaypoint].z, box);
  ctx.strokeStyle = palette.cyan;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(wp.x, wp.y);
  ctx.stroke();
}

function drawHud() {
  drawMap();
  ctx.fillStyle = "rgba(2, 4, 3, 0.8)";
  ctx.fillRect(0, H - 138, W, 138);
  ctx.strokeStyle = palette.bright;
  ctx.lineWidth = 2;
  ctx.strokeRect(8, H - 130, W - 16, 120);

  const wp = route[activeWaypoint];
  const desired = bearingTo(wp);
  const err = signedAngle(plane.heading, desired);
  drawInstrument(40, H - 78, 26, "ASI", plane.speed, 0, 180, palette.cyan);
  drawInstrument(104, H - 78, 26, "ALT", plane.altitude, 0, 3000, palette.bright);
  drawInstrument(168, H - 78, 26, "VSI", plane.verticalSpeed, -1600, 1600, palette.amber);
  drawInstrument(232, H - 78, 26, "THR", plane.throttle, 0, 100, palette.bright, (v) => Math.round(v));
  drawInstrument(296, H - 78, 26, "FUEL", plane.fuel, 0, 100, palette.cyan, (v) => Math.round(v));
  drawHorizon(372, H - 78, 27);
  drawCompass(448, H - 78, 27, desired);

  const hdg = String(Math.round(plane.heading)).padStart(3, "0");
  ctx.fillStyle = palette.bright;
  ctx.font = "11px monospace";
  ctx.textAlign = "left";
  ctx.fillText(`HDG${hdg} BRG${String(Math.round(desired)).padStart(3, "0")}`, 492, H - 108);
  ctx.fillText(`FLP${String(plane.flaps).padStart(2, "0")} GEAR ${plane.gearDown ? "DN" : "UP"}`, 492, H - 84);
  ctx.fillText(`NEXT ${wp.name}`, 492, H - 60);
  ctx.fillText(`DME ${(dist(plane, wp) / 1000).toFixed(1)}`, 492, H - 36);

  ctx.strokeStyle = palette.paper;
  ctx.strokeRect(606, H - 128, 18, 110);
  ctx.beginPath();
  ctx.moveTo(615, H - 128);
  ctx.lineTo(615, H - 18);
  ctx.moveTo(606, H - 73);
  ctx.lineTo(624, H - 73);
  ctx.stroke();
  ctx.fillStyle = palette.cyan;
  ctx.fillRect(612 + clamp(err / 45, -1, 1) * 5, H - 126, 6, 106);
  ctx.fillStyle = palette.amber;
  const altErr = clamp((plane.altitude - wp.alt) / 1200, -1, 1);
  ctx.fillRect(608, H - 76 + altErr * 43, 14, 5);

  ctx.strokeStyle = plane.stall || plane.state === "crashed" ? palette.red : palette.bright;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 42, H / 2);
  ctx.lineTo(W / 2 - 10, H / 2);
  ctx.moveTo(W / 2 + 10, H / 2);
  ctx.lineTo(W / 2 + 42, H / 2);
  ctx.moveTo(W / 2, H / 2 - 8);
  ctx.lineTo(W / 2, H / 2 + 8);
  ctx.stroke();
}

function drawOverlay() {
  if (plane.state === "flying") return;
  ctx.fillStyle = "rgba(2, 4, 3, 0.72)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = plane.state === "landed" ? palette.bright : palette.red;
  ctx.font = "34px monospace";
  ctx.textAlign = "center";
  ctx.fillText(plane.state === "landed" ? "LANDED" : "CRASH", W / 2, H / 2 - 18);
  ctx.fillStyle = palette.paper;
  ctx.font = "16px monospace";
  ctx.fillText(plane.state === "landed" ? `SCORE ${plane.score}` : "PRESS R TO RESTART", W / 2, H / 2 + 22);
}

function drawScanlines() {
  ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
}

function render() {
  ctx.fillStyle = palette.black;
  ctx.fillRect(0, 0, W, H);
  drawWorld();
  drawHud();
  drawOverlay();
  drawScanlines();
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused) update(dt);
  updateAudio();
  render();
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);
