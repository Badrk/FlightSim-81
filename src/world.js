import { airports, mountains } from "./config.js?v=1.5.2";

export function terrainHeight(x, z) {
  let height = 0;
  for (const mountain of mountains) {
    const d = Math.hypot((x - mountain.x) / mountain.w, (z - mountain.z) / mountain.w);
    if (d < 1.2) height = Math.max(height, mountain.h * Math.max(0, 1 - d));
  }
  return height;
}

export function runwayLocal(plane, airport) {
  const hdg = airport.heading * Math.PI / 180;
  const dx = plane.x - airport.x;
  const dz = plane.z - airport.z;
  return {
    along: dx * Math.sin(hdg) + dz * -Math.cos(hdg),
    lateral: dx * Math.cos(hdg) + dz * Math.sin(hdg)
  };
}

export function isOnRunway(plane, airport) {
  const local = runwayLocal(plane, airport);
  return Math.abs(local.along) < airport.length / 2 && Math.abs(local.lateral) < airport.width / 2;
}

export function groundAltitudeAt(plane) {
  const nearStartRunway = isOnRunway(plane, airports[0]) && plane.altitude < 45;
  const nearDestRunway = isOnRunway(plane, airports[1]) && plane.altitude < airports[1].elev + 80;
  if (nearStartRunway) return airports[0].elev;
  if (nearDestRunway) return airports[1].elev;
  return terrainHeight(plane.x, plane.z);
}
