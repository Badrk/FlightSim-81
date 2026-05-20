import { airports, CANVAS_HEIGHT as H, CANVAS_WIDTH as W, lakes, mountains, palette, river, route, towns, trees } from "./config.js?v=1.5.5";
import { bearingToWaypoint } from "./flight.js?v=1.5.5";
import { clamp, distance, signedAngle } from "./math.js?v=1.5.5";

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");

  function render(state) {
    ctx.fillStyle = palette.black;
    ctx.fillRect(0, 0, W, H);
    drawWorld(ctx, state);
    drawHud(ctx, state);
    drawOverlay(ctx, state);
    drawScanlines(ctx);
  }

  return { render };
}

function toScreen(state, x, y, z) {
  const { plane } = state;
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

function drawLine3d(ctx, state, a, b, color, width = 2) {
  const pa = toScreen(state, a.x, a.y, a.z);
  const pb = toScreen(state, b.x, b.y, b.z);
  if (!pa || !pb) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(pa.x, pa.y);
  ctx.lineTo(pb.x, pb.y);
  ctx.stroke();
}

function drawPoly(ctx, state, points, color, stroke = null) {
  const projected = points.map((p) => toScreen(state, p.x, p.y, p.z));
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

function drawWorld(ctx, state) {
  const horizonY = H / 2 + state.plane.pitch * 4;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-state.plane.bank * Math.PI / 180);
  ctx.translate(-W / 2, -H / 2);

  drawMovingBackdrop(ctx, state, horizonY);

  ctx.strokeStyle = palette.cyan;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-160, horizonY);
  ctx.lineTo(W + 160, horizonY);
  ctx.stroke();

  for (let i = 0; i < river.length - 1; i += 1) drawLine3d(ctx, state, { ...river[i], y: 4 }, { ...river[i + 1], y: 4 }, palette.water, 6);
  for (const lake of lakes) drawLake(ctx, state, lake);
  drawMountains(ctx, state);
  for (const town of towns) drawTown(ctx, state, town);
  for (const tree of trees) drawTree(ctx, state, tree);
  for (const airport of airports) drawRunway(ctx, state, airport);

  const waypoint = route[state.activeWaypoint];
  drawLine3d(ctx, state, { x: state.plane.x, y: state.plane.altitude - 40, z: state.plane.z }, { x: waypoint.x, y: waypoint.alt, z: waypoint.z }, palette.cyan, 1);

  ctx.restore();
}

function drawMovingBackdrop(ctx, state, horizonY) {
  const { plane } = state;
  const fillMargin = Math.hypot(W, H);
  const left = -fillMargin;
  const width = W + fillMargin * 2;
  const forward = plane.x * Math.sin(plane.heading * Math.PI / 180) - plane.z * Math.cos(plane.heading * Math.PI / 180);
  const side = plane.x * Math.cos(plane.heading * Math.PI / 180) + plane.z * Math.sin(plane.heading * Math.PI / 180);
  const skyShift = ((side * 0.015) % 42 + 42) % 42;
  const groundShift = ((forward * 0.045 + plane.altitude * 0.08) % 48 + 48) % 48;

  ctx.fillStyle = palette.farSky;
  ctx.fillRect(left, -fillMargin, width, horizonY + fillMargin);
  ctx.fillStyle = palette.ground;
  ctx.fillRect(left, horizonY, width, H - horizonY + fillMargin);

  ctx.fillStyle = "rgba(86, 215, 255, 0.09)";
  for (let y = horizonY - fillMargin + skyShift; y < horizonY; y += 42) {
    ctx.fillRect(left, y, width, 2);
  }

  ctx.strokeStyle = "rgba(78, 240, 125, 0.18)";
  ctx.lineWidth = 1;
  for (let y = horizonY + groundShift; y < H + fillMargin; y += 48) {
    const spread = (y - horizonY) * 0.75;
    ctx.beginPath();
    ctx.moveTo(W / 2 - spread, y);
    ctx.lineTo(W / 2 + spread, y);
    ctx.stroke();
  }

}

function drawRunway(ctx, state, airport) {
  const hdg = airport.heading * Math.PI / 180;
  const fx = Math.sin(hdg);
  const fz = -Math.cos(hdg);
  const rx = Math.cos(hdg);
  const rz = Math.sin(hdg);
  const length = airport.length / 2;
  const width = airport.width / 2;
  const y = airport.elev;
  const step = 70;

  function point(along, lateral, lift = 0) {
    return {
      x: airport.x + fx * along + rx * lateral,
      y: y + lift,
      z: airport.z + fz * along + rz * lateral
    };
  }

  for (let along = -length; along < length; along += step) {
    const next = Math.min(length, along + step);
    drawRunwayPoly(ctx, state, [
      point(along, -width),
      point(next, -width),
      point(next, width),
      point(along, width)
    ], palette.runway, null);
    drawLine3d(ctx, state, point(along, -width, 2), point(next, -width, 2), palette.paper, 1);
    drawLine3d(ctx, state, point(along, width, 2), point(next, width, 2), palette.paper, 1);
  }

  for (let along = -length + 120; along < length; along += 320) {
    drawLine3d(ctx, state, point(along, 0, 4), point(Math.min(along + 110, length), 0, 4), palette.amber, 3);
  }

  drawAirportBuildings(ctx, state, airport, rx, rz, fx, fz);
}

function drawRunwayPoly(ctx, state, points) {
  const projected = points.map((p) => toRunwayScreen(state, p.x, p.y, p.z));
  if (projected.every((p) => !p)) return;
  ctx.fillStyle = palette.runway;
  ctx.beginPath();
  for (let i = 0; i < projected.length; i += 1) {
    const p = projected[i] || projected[(i + 1) % projected.length] || projected[(i + 2) % projected.length];
    if (!p) return;
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fill();
}

function toRunwayScreen(state, x, y, z) {
  const { plane } = state;
  const relX = x - plane.x;
  const relZ = z - plane.z;
  const relY = y - plane.altitude;
  const headingRad = plane.heading * Math.PI / 180;
  const tx = relX * Math.cos(headingRad) + relZ * Math.sin(headingRad);
  const tz = relX * Math.sin(headingRad) + relZ * -Math.cos(headingRad);
  if (tz < -160) return null;
  const scale = 420 / Math.max(40, tz);
  return {
    x: W / 2 + tx * scale,
    y: H / 2 - relY * scale + plane.pitch * 4,
    scale
  };
}

function drawAirportBuildings(ctx, state, airport, rx, rz, fx, fz) {
  const side = airport.width / 2 + 190;
  const baseAlong = airport.name === "HAYES" ? -280 : 260;
  for (let i = 0; i < 4; i += 1) {
    const along = baseAlong + i * 130;
    const p = toScreen(state, airport.x + fx * along + rx * side, airport.elev + 28, airport.z + fz * along + rz * side);
    if (!p) continue;
    const s = clamp(p.scale * 180, 4, 18);
    ctx.fillStyle = palette.town;
    ctx.fillRect(p.x - s, p.y - s, s * 2, s);
  }
  const tower = toScreen(state, airport.x + fx * (baseAlong - 170) + rx * side, airport.elev + 85, airport.z + fz * (baseAlong - 170) + rz * side);
  if (tower) {
    const s = clamp(tower.scale * 120, 4, 15);
    ctx.fillStyle = palette.paper;
    ctx.fillRect(tower.x - s / 2, tower.y - s * 2, s, s * 2);
  }
}

function drawTree(ctx, state, tree) {
  const base = toScreen(state, tree.x, 0, tree.z);
  const top = toScreen(state, tree.x, tree.h, tree.z);
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

function drawTown(ctx, state, town) {
  for (let i = 0; i < 10; i += 1) {
    const bx = town.x + ((i % 5) - 2) * town.size * 0.18;
    const bz = town.z + (Math.floor(i / 5) - 0.5) * town.size * 0.24;
    const p = toScreen(state, bx, 20, bz);
    if (!p) continue;
    const s = clamp(p.scale * 110, 2, 12);
    ctx.fillStyle = palette.town;
    ctx.fillRect(p.x - s / 2, p.y - s, s, s);
  }
}

function drawLake(ctx, state, lake) {
  const points = [];
  for (let i = 0; i < 14; i += 1) {
    const a = i / 14 * Math.PI * 2;
    points.push({ x: lake.x + Math.cos(a) * lake.rx, y: 3, z: lake.z + Math.sin(a) * lake.rz });
  }
  drawPoly(ctx, state, points, palette.water, "#56d7ff");
}

function drawMountains(ctx, state) {
  for (const mountain of mountains) {
    drawPoly(ctx, state, [
      { x: mountain.x - mountain.w, y: 0, z: mountain.z + mountain.w * 0.2 },
      { x: mountain.x, y: mountain.h, z: mountain.z },
      { x: mountain.x + mountain.w, y: 0, z: mountain.z + mountain.w * 0.2 }
    ], palette.mountain, "#8a8b91");
    drawPoly(ctx, state, [
      { x: mountain.x - mountain.w * 0.22, y: mountain.h * 0.72, z: mountain.z + mountain.w * 0.02 },
      { x: mountain.x, y: mountain.h, z: mountain.z },
      { x: mountain.x + mountain.w * 0.22, y: mountain.h * 0.72, z: mountain.z + mountain.w * 0.02 }
    ], palette.snow);
  }
}

function drawInstrument(ctx, cx, cy, r, label, value, min, max, color, formatter = Math.round) {
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
  ctx.fillText(label, cx, cy + r + 16);
}

function drawHorizon(ctx, plane, cx, cy, r) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 1, 0, Math.PI * 2);
  ctx.clip();
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

function drawCompass(ctx, plane, cx, cy, r, bearing) {
  ctx.strokeStyle = palette.paper;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = palette.paper;
  ctx.font = "9px monospace";
  ctx.textAlign = "center";
  for (const [label, deg] of [["N", 0], ["E", 90], ["S", 180], ["W", 270]]) {
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

function mapHeadingPoint(state, x, z, box) {
  const { plane } = state;
  const relX = x - plane.x;
  const relZ = z - plane.z;
  const headingRad = plane.heading * Math.PI / 180;
  const rightX = Math.cos(headingRad);
  const rightZ = Math.sin(headingRad);
  const forwardX = Math.sin(headingRad);
  const forwardZ = -Math.cos(headingRad);
  const scale = box.w / 6800;
  return {
    x: box.x + box.w / 2 + (relX * rightX + relZ * rightZ) * scale,
    y: box.y + box.h / 2 - (relX * forwardX + relZ * forwardZ) * scale
  };
}

function mapDisplayPoint(state, x, z, box) {
  return state.mapNorthUp ? mapPoint(x, z, box) : mapHeadingPoint(state, x, z, box);
}

function drawMap(ctx, state) {
  const { plane } = state;
  const box = { x: W - 148, y: 18, w: 128, h: 100 };
  ctx.fillStyle = "rgba(2, 4, 3, 0.82)";
  ctx.fillRect(box.x, box.y, box.w, box.h);
  ctx.strokeStyle = palette.bright;
  ctx.strokeRect(box.x, box.y, box.w, box.h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x, box.y, box.w, box.h);
  ctx.clip();
  ctx.strokeStyle = palette.water;
  ctx.beginPath();
  river.forEach((point, index) => {
    const q = mapDisplayPoint(state, point.x, point.z, box);
    if (index === 0) ctx.moveTo(q.x, q.y);
    else ctx.lineTo(q.x, q.y);
  });
  ctx.stroke();
  ctx.strokeStyle = palette.dim;
  ctx.beginPath();
  route.forEach((point, index) => {
    const q = mapDisplayPoint(state, point.x, point.z, box);
    if (index === 0) ctx.moveTo(q.x, q.y);
    else ctx.lineTo(q.x, q.y);
  });
  ctx.stroke();
  for (const airport of airports) {
    const q = mapDisplayPoint(state, airport.x, airport.z, box);
    ctx.fillStyle = palette.amber;
    ctx.fillRect(q.x - 3, q.y - 3, 6, 6);
  }
  const p = mapDisplayPoint(state, plane.x, plane.z, box);
  const waypoint = mapDisplayPoint(state, route[state.activeWaypoint].x, route[state.activeWaypoint].z, box);
  ctx.strokeStyle = palette.cyan;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(waypoint.x, waypoint.y);
  ctx.stroke();
  ctx.fillStyle = palette.cyan;
  ctx.beginPath();
  ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = palette.bright;
  ctx.font = "9px monospace";
  ctx.textAlign = "right";
  ctx.fillText(state.mapNorthUp ? "N" : "HDG", box.x + box.w - 5, box.y + 12);
}

function drawHud(ctx, state) {
  const { plane } = state;
  drawMap(ctx, state);
  ctx.fillStyle = "rgba(2, 4, 3, 0.8)";
  ctx.fillRect(0, H - 138, W, 138);
  ctx.strokeStyle = palette.bright;
  ctx.lineWidth = 2;
  ctx.strokeRect(8, H - 130, W - 16, 120);

  const waypoint = route[state.activeWaypoint];
  const desired = bearingToWaypoint(state, waypoint);
  const err = signedAngle(plane.heading, desired);
  drawInstrument(ctx, 40, H - 78, 26, "ASI", plane.speed, 0, 180, palette.cyan);
  drawInstrument(ctx, 104, H - 78, 26, "ALT", plane.altitude, 0, 3000, palette.bright);
  drawInstrument(ctx, 168, H - 78, 26, "VSI", plane.verticalSpeed, -1600, 1600, palette.amber);
  drawInstrument(ctx, 232, H - 78, 26, "THR", plane.throttle, 0, 100, palette.bright);
  drawInstrument(ctx, 296, H - 78, 26, "FUEL", plane.fuel, 0, 100, palette.cyan);
  drawHorizon(ctx, plane, 372, H - 78, 27);
  drawCompass(ctx, plane, 448, H - 78, 27, desired);

  const hdg = String(Math.round(plane.heading)).padStart(3, "0");
  ctx.fillStyle = palette.bright;
  ctx.font = "11px monospace";
  ctx.textAlign = "left";
  ctx.fillText(`HDG${hdg} BRG${String(Math.round(desired)).padStart(3, "0")}`, 492, H - 108);
  ctx.fillText(`FLP${String(plane.flaps).padStart(2, "0")} GEAR ${plane.gearDown ? "DN" : "UP"}`, 492, H - 84);
  ctx.fillText(`NEXT ${waypoint.name}`, 492, H - 60);
  ctx.fillText(`DME ${(distance(plane, waypoint) / 1000).toFixed(1)}`, 492, H - 36);

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
  const altErr = clamp((plane.altitude - waypoint.alt) / 1200, -1, 1);
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

function drawOverlay(ctx, state) {
  const { plane } = state;
  if (plane.state === "flying" || plane.state === "rollout") return;
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

function drawScanlines(ctx) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.18)";
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
}
