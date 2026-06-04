/**
 * Shared walk-mode move input. The mobile joystick (DOM) writes the current
 * normalized move vector here; FirstPersonCamera (R3F canvas) reads it each
 * frame. A module singleton instead of Zustand so per-frame joystick updates
 * never churn React/the store.
 *
 * Convention matches keyboard movement: y = forward(+)/back(-), x = right(+)/
 * left(-), each in -1..1, magnitude (0..1) = analog push amount.
 */
export interface MoveVector {
  x: number
  y: number
}

export const walkInput: { move: MoveVector } = { move: { x: 0, y: 0 } }

export function setWalkMove(x: number, y: number): void {
  walkInput.move.x = x
  walkInput.move.y = y
}

export function resetWalkMove(): void {
  walkInput.move.x = 0
  walkInput.move.y = 0
}

/**
 * Map a joystick thumb offset (px, screen coords with y-down) to a move vector.
 * `radius` is the joystick's max travel in px; `deadZone` is a fraction (0..1)
 * of the radius below which input is ignored. Screen-down y is flipped so
 * pushing up = forward (+y). Magnitude is clamped to 1.
 */
export function normalizeJoystick(
  dx: number,
  dy: number,
  radius: number,
  deadZone: number,
): MoveVector {
  const dist = Math.hypot(dx, dy)
  if (dist < radius * deadZone) return { x: 0, y: 0 }
  const capped = Math.min(dist, radius)
  const mag = capped / radius
  const ux = dx / dist
  const uy = dy / dist
  return { x: ux * mag, y: -uy * mag }
}
