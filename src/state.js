import { initialInstruction } from "./config.js";

export function createInitialPlane() {
  return {
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
}

export function createGameState() {
  return {
    plane: createInitialPlane(),
    phase: "preflight",
    activeWaypoint: 0,
    message: initialInstruction,
    messageTimer: 3.8,
    paused: false,
    autopilot: false,
    soundEnabled: true,
    mapNorthUp: true
  };
}

export function resetGameState(state) {
  const preferences = {
    soundEnabled: state.soundEnabled,
    mapNorthUp: state.mapNorthUp
  };
  Object.assign(state, createGameState(), preferences);
}
