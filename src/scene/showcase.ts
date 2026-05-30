/**
 * Pure idle state machine for showcase accumulation. The controller feeds it
 * whether the camera moved this frame and the current clock; it returns the
 * next state. Kept free of three.js/React so it's unit-testable with a fake
 * clock. "accumulate" means: park the live render and let AccumulativeShadows
 * converge a noise-free soft shadow.
 */

export const IDLE_MS = 400;

export interface ShowcaseState {
  mode: 'live' | 'accumulate';
  /** Clock (ms) when the camera last became still, or null while moving. */
  stillSince: number | null;
}

export interface ShowcaseInput {
  moved: boolean;
  now: number;
}

export function nextShowcaseState(prev: ShowcaseState, input: ShowcaseInput): ShowcaseState {
  if (input.moved) {
    return { mode: 'live', stillSince: null };
  }
  const stillSince = prev.stillSince ?? input.now;
  const idleFor = input.now - stillSince;
  const mode = idleFor > IDLE_MS ? 'accumulate' : 'live';
  return { mode, stillSince };
}
