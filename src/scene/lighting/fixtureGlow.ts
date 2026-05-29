/**
 * Shared 0..1 "lights are on" factor (≈ scene darkness), written each frame by
 * FurnitureLights and read by light-fixture primitives so their emissive
 * shades glow at night and go dark in daylight. A plain module singleton (not
 * store state) keeps it out of React re-renders — it's polled in useFrame.
 */
let glow = 0;

export function setFixtureGlow(v: number): void {
  glow = v;
}

export function getFixtureGlow(): number {
  return glow;
}
