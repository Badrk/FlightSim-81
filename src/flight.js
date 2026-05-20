import { airports, initialInstruction, route } from "./config.js?v=1.5.4";
import { bearingBetween, clamp, distance, signedAngle, wrapDeg } from "./math.js?v=1.5.4";
import { groundAltitudeAt, isOnRunway, runwayLocal, terrainHeight } from "./world.js?v=1.5.4";

const autopilotPath = [airports[0], ...route];

export function setMessage(state, text, seconds = 3.8) {
  state.message = text;
  state.messageTimer = seconds;
}

export function setPhase(state, next) {
  if (state.phase !== next) state.phase = next;
}

export function bearingToWaypoint(state, waypoint = route[state.activeWaypoint]) {
  return bearingBetween(state.plane, waypoint);
}

export function updateFlight(state, input, dt) {
  const { plane } = state;
  if (plane.state === "rollout") {
    updateLandingRollout(state, dt);
    updateAdvisory(state, dt);
    return;
  }
  if (plane.state !== "flying") return;
  if (state.autopilot) updateAutopilot(state, input, dt);

  const bankInput = (input.keys.has("arrowright") ? 1 : 0) - (input.keys.has("arrowleft") ? 1 : 0);
  const pitchInput = (input.keys.has("arrowdown") ? 1 : 0) - (input.keys.has("arrowup") ? 1 : 0);
  const throttleInput = (input.keys.has("a") ? 1 : 0) - (input.keys.has("z") ? 1 : 0);

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

  plane.groundAltitude = groundAltitudeAt(plane);
  updateGroundContact(state, minFlying, dt);
  if (plane.state === "rollout") {
    updateAdvisory(state, dt);
    return;
  }

  plane.fuel = clamp(plane.fuel - (0.002 + plane.throttle * 0.00014) * dt, 0, 100);
  if (plane.fuel <= 0) {
    plane.state = "crashed";
    setMessage(state, "Fuel exhausted. Press R to try again.");
  }

  while (state.activeWaypoint < route.length - 1 && distance(plane, route[state.activeWaypoint]) < 750) {
    state.activeWaypoint += 1;
  }

  updatePhase(state);
  updateAdvisory(state, dt);
}

function updateAutopilot(state, input, dt) {
  const { plane } = state;
  input.keys.clear();

  const destination = airports[1];
  const finalPoint = route[route.length - 2];
  const distanceToDestination = distance(plane, destination);
  const guidance = autopilotGuidance(state);
  const target = guidance.target;
  let desiredHeading = bearingBetween(plane, target);
  if (guidance.onFinal || distanceToDestination < 1800) {
    const local = runwayLocal(plane, destination);
    desiredHeading = wrapDeg(destination.heading - clamp(local.lateral * 0.08, -28, 28));
  }
  const headingError = signedAngle(plane.heading, desiredHeading);

  plane.bank += clamp(headingError * 0.9 - plane.bank, -34, 34) * dt * 1.8;
  plane.bank = clamp(plane.bank, -30, 30);
  plane.heading = wrapDeg(plane.heading + clamp(headingError, -45, 45) * dt * 0.7);

  let targetAltitude = Math.max(target.alt, terrainHeight(plane.x, plane.z) + 650);
  let targetSpeed = 122;
  if (plane.onGround && distance(plane, airports[0]) < 1500) {
    plane.flaps = 15;
    plane.gearDown = true;
    plane.throttle = 100;
    targetAltitude = 700;
    targetSpeed = 85;
  } else if (state.phase === "climb") {
    if (plane.altitude > 300) plane.gearDown = false;
    if (plane.altitude > 500) plane.flaps = 0;
    plane.throttle = 88;
    targetAltitude = 1600;
    targetSpeed = 125;
  } else if (distanceToDestination < 4500 || guidance.onFinal) {
    const finalDistance = Math.max(0, distance(plane, finalPoint));
    targetAltitude = clamp(destination.elev + 10 + Math.max(0, distanceToDestination - 700) * 0.035, destination.elev + 10, 760);
    if (guidance.onFinal || finalDistance < 1900 || distanceToDestination < 1800) {
      plane.gearDown = true;
      plane.flaps = 30;
      targetSpeed = 92;
    } else {
      plane.flaps = 15;
      targetSpeed = 108;
    }
    plane.throttle = clamp(38 + (targetAltitude - plane.altitude) * 0.014 + (targetSpeed - plane.speed) * 0.6, 24, 76);
  } else {
    plane.gearDown = false;
    plane.flaps = 0;
    plane.throttle = 64;
    targetAltitude = 1650;
    targetSpeed = 125;
  }

  const altitudeError = targetAltitude - plane.altitude;
  const speedError = targetSpeed - plane.speed;
  const targetPitch = clamp(altitudeError * 0.035 + speedError * -0.025, -14, 9);
  plane.pitch += (targetPitch - plane.pitch) * dt * 1.6;
  plane.pitch = clamp(plane.pitch, plane.onGround ? -1 : -14, 15);
}

function autopilotGuidance(state) {
  const routePosition = locateAlongRoute(state.plane);
  const lookAhead = clamp(state.plane.speed * 12, 850, 1800);
  const target = pointAlongRoute(routePosition.progress + lookAhead);
  state.activeWaypoint = nextRouteWaypoint(routePosition.progress + 350);
  return {
    target,
    onFinal: routePosition.progress >= routeProgressAt(route.length - 1) - 250 || distance(state.plane, airports[1]) < 2200
  };
}

function locateAlongRoute(plane) {
  let best = { distance: Infinity, progress: 0 };
  let progress = 0;

  for (let index = 0; index < autopilotPath.length - 1; index += 1) {
    const start = autopilotPath[index];
    const end = autopilotPath[index + 1];
    const dx = end.x - start.x;
    const dz = end.z - start.z;
    const length = Math.hypot(dx, dz);
    const t = length === 0 ? 0 : clamp(((plane.x - start.x) * dx + (plane.z - start.z) * dz) / (length * length), 0, 1);
    const x = start.x + dx * t;
    const z = start.z + dz * t;
    const candidateDistance = Math.hypot(plane.x - x, plane.z - z);
    if (candidateDistance < best.distance) best = { distance: candidateDistance, progress: progress + length * t };
    progress += length;
  }

  return best;
}

function pointAlongRoute(progress) {
  const total = routeProgressAt(route.length);
  let remaining = clamp(progress, 0, total);

  for (let index = 0; index < autopilotPath.length - 1; index += 1) {
    const start = autopilotPath[index];
    const end = autopilotPath[index + 1];
    const length = Math.hypot(end.x - start.x, end.z - start.z);
    if (remaining <= length || index === autopilotPath.length - 2) {
      const t = length === 0 ? 0 : remaining / length;
      return {
        name: end.name,
        x: start.x + (end.x - start.x) * t,
        z: start.z + (end.z - start.z) * t,
        alt: altitudeFor(start) + (altitudeFor(end) - altitudeFor(start)) * t
      };
    }
    remaining -= length;
  }

  return route[route.length - 1];
}

function nextRouteWaypoint(progress) {
  for (let index = 0; index < route.length; index += 1) {
    if (progress <= routeProgressAt(index + 1)) return index;
  }
  return route.length - 1;
}

function routeProgressAt(pathIndex) {
  let progress = 0;
  for (let index = 0; index < Math.min(pathIndex, autopilotPath.length - 1); index += 1) {
    progress += Math.hypot(autopilotPath[index + 1].x - autopilotPath[index].x, autopilotPath[index + 1].z - autopilotPath[index].z);
  }
  return progress;
}

function altitudeFor(point) {
  return point.alt ?? point.elev ?? 0;
}

function startLandingRollout(state, score) {
  const { plane } = state;
  const destination = airports[1];
  plane.state = "rollout";
  plane.onGround = true;
  plane.altitude = destination.elev;
  plane.groundAltitude = destination.elev;
  plane.verticalSpeed = 0;
  plane.bank = 0;
  plane.pitch = 0;
  plane.throttle = 0;
  plane.rolloutTimer = 0;
  plane.score = score;
  setPhase(state, "rollout");
  setMessage(state, "Touchdown. Rolling out on NORTHRIDGE runway.");
}

function updateLandingRollout(state, dt) {
  const { plane } = state;
  const destination = airports[1];
  const headingRad = destination.heading * Math.PI / 180;
  plane.heading += signedAngle(plane.heading, destination.heading) * dt * 1.8;
  plane.heading = wrapDeg(plane.heading);
  plane.x += Math.sin(headingRad) * plane.speed * 1.45 * dt;
  plane.z -= Math.cos(headingRad) * plane.speed * 1.45 * dt;
  plane.speed = Math.max(0, plane.speed - 14 * dt);
  plane.altitude = destination.elev;
  plane.groundAltitude = destination.elev;
  plane.verticalSpeed = 0;
  plane.rolloutTimer += dt;

  if (plane.rolloutTimer >= 5 || plane.speed <= 5) {
    plane.state = "landed";
    plane.speed = 0;
    state.autopilot = false;
    setPhase(state, "ended");
    setMessage(state, `Landed. Score ${plane.score}. Press R for another flight.`);
  }
}

function updateGroundContact(state, minFlying, dt) {
  const { plane } = state;
  if (plane.onGround) {
    plane.altitude = plane.groundAltitude;
    plane.verticalSpeed = 0;
    const wantsToFly = plane.pitch > 2.5 || plane.flaps >= 15 && plane.speed > 62;
    if (plane.speed > minFlying + 6 && wantsToFly && isOnRunway(plane, airports[0])) {
      plane.onGround = false;
      plane.airborneGrace = 1.8;
      plane.pitch = Math.max(plane.pitch, 5);
      plane.verticalSpeed = 620;
      setMessage(state, "Positive climb. Gear up above 300 ft, flaps up above 500 ft.");
    }
    return;
  }

  plane.altitude += (plane.verticalSpeed / 60) * dt;
  plane.airborneGrace = Math.max(0, plane.airborneGrace - dt);
  const clearance = plane.altitude - plane.groundAltitude;
  const overDestinationRunway = isOnRunway(plane, airports[1]) && plane.groundAltitude === airports[1].elev;
  if (clearance <= 0 && plane.airborneGrace <= 0 || overDestinationRunway && clearance <= 40 && plane.verticalSpeed <= 120) handleGroundContact(state);
}

function updatePhase(state) {
  const { plane } = state;
  const destination = airports[1];
  const dme = distance(plane, destination);
  if (plane.state === "rollout") return setPhase(state, "rollout");
  if (plane.state !== "flying") return setPhase(state, "ended");
  if (plane.onGround && plane.speed < 35 && distance(plane, airports[0]) < 1500) return setPhase(state, "preflight");
  if (plane.onGround && plane.speed >= 35) return setPhase(state, "takeoff");
  if (plane.altitude < 900 && dme > 5200) return setPhase(state, "climb");
  if (dme > 3000) return setPhase(state, "cruise");
  if (dme > 1100 || plane.altitude > 420) return setPhase(state, "approach");
  return setPhase(state, "landing");
}

function handleGroundContact(state) {
  const { plane } = state;
  const destination = airports[1];
  if (isOnRunway(plane, destination) && Math.abs(signedAngle(plane.heading, destination.heading)) < 18) {
    const local = runwayLocal(plane, destination);
    const sink = Math.abs(plane.verticalSpeed);
    const speedGood = Math.abs(plane.speed - 92);
    const bank = Math.abs(plane.bank);
    const configured = plane.gearDown && plane.flaps === 30;
    if (state.autopilot || sink < 520 && speedGood < 24 && bank < 9 && configured) {
      const score = state.autopilot ? 96 : Math.max(0, Math.round(100 - Math.abs(local.lateral) * 0.22 - sink * 0.045 - speedGood * 1.3 - bank * 2));
      startLandingRollout(state, score);
      return;
    }
    plane.state = "crashed";
    setMessage(state, "Bad touchdown. Use gear down, flaps 30, 85-105 kt, low sink rate.");
    setPhase(state, "ended");
    return;
  }

  plane.state = "crashed";
  setMessage(state, terrainHeight(plane.x, plane.z) > 40 ? "Terrain impact. Climb over mountains and watch the map." : "Off-airport landing. Find the destination runway first.");
  setPhase(state, "ended");
}

function updateAdvisory(state, dt) {
  if (state.messageTimer > 0) {
    state.messageTimer -= dt;
    return;
  }

  const { plane } = state;
  const waypoint = route[state.activeWaypoint];
  const desired = bearingToWaypoint(state, waypoint);
  const err = signedAngle(plane.heading, desired);
  const dme = distance(plane, airports[1]);

  if (state.phase === "preflight") setMessage(state, initialInstruction);
  else if (state.autopilot) setMessage(state, "Autopilot engaged. Monitoring route, descent, and landing.");
  else if (state.phase === "takeoff") setMessage(state, "Rotate at 60 kt with Down Arrow. Hold runway heading.");
  else if (state.phase === "climb" && !plane.gearDown && plane.flaps === 0) setMessage(state, "Clean climb. Follow the cyan bearing pointer.");
  else if (state.phase === "climb") setMessage(state, "Raise gear above 300 ft and retract flaps above 500 ft.");
  else if (state.phase === "cruise" && Math.abs(err) > 10) setMessage(state, err > 0 ? "Turn right toward the waypoint." : "Turn left toward the waypoint.");
  else if (state.phase === "approach") setMessage(state, `Airport ${Math.round(dme)} m. Descend for runway 09, elevation 160 ft.`);
  else if (state.phase === "landing") setMessage(state, "Landing checks: gear down, flaps 30, runway elevation 160 ft.");
  else if (state.phase === "rollout") setMessage(state, "Rolling out. Keep straight until the aircraft slows.");
  else if (plane.stall) setMessage(state, "Stall warning. Nose down or add power.");
  else setMessage(state, `Next ${waypoint.name}. Bearing ${String(Math.round(desired)).padStart(3, "0")}.`);
}
