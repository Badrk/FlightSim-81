export const CANVAS_WIDTH = 640;
export const CANVAS_HEIGHT = 480;

export const palette = {
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

export const airports = [
  { name: "HAYES", x: 0, z: 0, heading: 90, length: 2600, width: 150, elev: 0 },
  { name: "NORTHRIDGE", x: 9200, z: -3900, heading: 90, length: 2300, width: 150, elev: 160 }
];

export const route = [
  { name: "RIVER", x: 2500, z: -650, alt: 1300 },
  { name: "TOWN", x: 5200, z: -2100, alt: 1800 },
  { name: "FINAL", x: 6900, z: -3900, alt: 900 },
  { name: "RWY 09", x: airports[1].x, z: airports[1].z, alt: airports[1].elev }
];

export const river = [
  { x: -1500, z: 1100 },
  { x: 900, z: 650 },
  { x: 2600, z: -700 },
  { x: 4300, z: -900 },
  { x: 6200, z: -2300 },
  { x: 8500, z: -3000 },
  { x: 10700, z: -2500 },
  { x: 11900, z: -4700 }
];

export const lakes = [
  { x: 3400, z: 1250, rx: 520, rz: 260 },
  { x: 7600, z: -1450, rx: 620, rz: 320 },
  { x: 12400, z: -5200, rx: 760, rz: 360 }
];

export const towns = [
  { name: "MILL", x: 1800, z: 900, size: 520 },
  { name: "LAKE", x: 5150, z: -1900, size: 720 },
  { name: "RIDGE", x: 8700, z: -4700, size: 620 },
  { name: "HAYES", x: -550, z: 520, size: 600 },
  { name: "NORTH", x: 9100, z: -3300, size: 760 },
  { name: "FARMS", x: 11800, z: -1800, size: 640 },
  { name: "EAST", x: 13200, z: -5600, size: 700 }
];

export const mountains = [
  { x: 4100, z: -4600, h: 1280, w: 950 },
  { x: 5700, z: -5200, h: 1680, w: 1200 },
  { x: 7700, z: -6100, h: 1360, w: 1000 },
  { x: 9600, z: -6800, h: 1500, w: 1250 }
];

export const trees = Array.from({ length: 150 }, (_, index) => {
  const x = -1200 + (index * 347) % 15500;
  const z = 1800 - (index * 619) % 10200;
  return { x, z, h: 65 + (index % 5) * 12 };
}).filter((tree) => Math.abs(tree.z) > 260 || tree.x < -1000 || tree.x > 11000);

export const helpText = {
  preflight: ["Flaps F to 15.", "Keep gear down.", "Throttle A to 100% and hold runway heading 090."],
  takeoff: ["At 55-60 kt, ease nose up with Down Arrow.", "Flaps 15 will help the aircraft fly off.", "Climb through 300 ft before raising gear."],
  climb: ["Gear up with G.", "Flaps F to 0 above 500 ft.", "Climb to about 1600 ft and steer to the map arrow."],
  cruise: ["Follow the cyan bearing pointer and map route.", "Keep speed 105-145 kt.", "Stay above terrain and below 2500 ft."],
  approach: ["Descend toward FINAL at 900 ft.", "NORTHRIDGE runway elevation is 160 ft.", "Set throttle near 45% and line up runway 09."],
  landing: ["Gear down, flaps 30.", "Aim for 85-105 kt.", "Touch down gently at 160 ft field elevation."],
  rollout: ["Keep rolling straight down the runway.", "Throttle idle.", "Wait for the aircraft to slow."],
  ended: ["Press R to reset.", "Score rewards centerline, sink rate, speed, and correct configuration."]
};

export const initialInstruction = "HAYES runway 09. Set flaps 15, gear down, then full throttle for takeoff.";

export const handledKeys = new Set([
  "arrowleft",
  "arrowright",
  "arrowup",
  "arrowdown",
  "a",
  "z",
  "f",
  "g",
  "h",
  "r",
  " ",
  "escape"
]);
