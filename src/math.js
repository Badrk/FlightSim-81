export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function wrapDeg(value) {
  return ((value % 360) + 360) % 360;
}

export function signedAngle(from, to) {
  let diff = wrapDeg(to - from);
  if (diff > 180) diff -= 360;
  return diff;
}

export function distance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function bearingBetween(from, to) {
  return wrapDeg(Math.atan2(to.x - from.x, -(to.z - from.z)) * 180 / Math.PI);
}
