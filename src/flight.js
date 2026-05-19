import { airports, initialInstruction, route } from "./config.js";
import { bearingBetween, clamp, distance, signedAngle, wrapDeg } from "./math.js";
import { groundAltitudeAt, isOnRunway, runwayLocal, terrainHeight } from "./world.js";

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
  if (plane.state !== "flying") return;

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
  if (clearance <= 0 && plane.airborneGrace <= 0) handleGroundContact(state);
}

function updatePhase(state) {
  const { plane } = state;
  const destination = airports[1];
  const dme = distance(plane, destination);
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
    if (sink < 520 && speedGood < 24 && bank < 9 && configured) {
      plane.state = "landed";
      plane.onGround = true;
      plane.altitude = destination.elev;
      plane.score = Math.max(0, Math.round(100 - Math.abs(local.lateral) * 0.22 - sink * 0.045 - speedGood * 1.3 - bank * 2));
      setMessage(state, `NORTHRIDGE touchdown. Score ${plane.score}. Press R for another flight.`);
      setPhase(state, "ended");
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
  else if (state.phase === "takeoff") setMessage(state, "Rotate at 60 kt with Down Arrow. Hold runway heading.");
  else if (state.phase === "climb" && !plane.gearDown && plane.flaps === 0) setMessage(state, "Clean climb. Follow the cyan bearing pointer.");
  else if (state.phase === "climb") setMessage(state, "Raise gear above 300 ft and retract flaps above 500 ft.");
  else if (state.phase === "cruise" && Math.abs(err) > 10) setMessage(state, err > 0 ? "Turn right toward the waypoint." : "Turn left toward the waypoint.");
  else if (state.phase === "approach") setMessage(state, `Airport ${Math.round(dme)} m. Descend, line up runway 09.`);
  else if (state.phase === "landing") setMessage(state, "Landing checks: gear down, flaps 30, throttle 35-50%, wings level.");
  else if (plane.stall) setMessage(state, "Stall warning. Nose down or add power.");
  else setMessage(state, `Next ${waypoint.name}. Bearing ${String(Math.round(desired)).padStart(3, "0")}.`);
}
