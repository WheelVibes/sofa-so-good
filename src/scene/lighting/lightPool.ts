/**
 * ROOM-SCOPED-LIGHTS — the slot state behind the constant point-light pool.
 *
 * `lightRooms.ts` decides WHICH fixtures belong in the pool; this keeps the fixed slots that carry
 * them, so that the number of mounted `PointLight`s (and so every lit program's cache key) never
 * changes, and so a change of room does not pop.
 *
 *  - A fixture that stays wanted keeps its slot — it never jumps between slots.
 *  - A fixture that leaves the wanted set because the camera changed room fades OUT over
 *    {@link POOL_FADE_OUT_S}; one that enters fades IN over {@link POOL_FADE_S}. An entering
 *    fixture takes a free slot; if none is free it waits for a leaving one to reach zero. That wait
 *    is why the out-fade is the shorter one: when both the old and the new room fill the pool
 *    (every door open around the corridor), the new room's lamps cannot start until slots free, and
 *    a long out-fade is a long dip. The leaving side is, by construction, light for rooms you can no
 *    longer see (or a merged stand-in being replaced by its own lamps), so losing it quickly costs
 *    little.
 *  - Everything else is INSTANT, exactly as it was before the pool: the lights switch, a lamp's own
 *    per-item switch, adding / deleting / moving a lamp, the first frame. A fixture that is no longer
 *    a candidate at all (switched off, deleted) empties its slot at once; one that has just become a
 *    candidate (switched on) appears at full weight.
 *  - `instant` (reduced motion) makes room changes instant too.
 *
 * Pure, so the transitions are unit-tested without a renderer (`lightPool.test.ts`).
 */

/** Cross-fade time for a room change (s). Long enough not to read as a pop, short enough to be
 *  done before a walking camera has taken a step into the new room. */
export const POOL_FADE_S = 0.3

/** Fade-out time for a fixture leaving scope (s) — see the module docblock for why it is shorter. */
export const POOL_FADE_OUT_S = 0.12

interface PoolSlot {
  /** Fixture this slot carries, or `null` when empty. */
  lightId: string | null
  /** Current intensity weight, 0..1 — multiplies the fixture's own intensity. */
  weight: number
  /** 1 while the fixture is wanted, 0 while it is fading out. */
  target: 0 | 1
}

export interface PoolState {
  slots: PoolSlot[]
  /** Candidate ids seen on the previous update, to tell "scope changed" from "design changed". */
  candidates: ReadonlySet<string>
}

export function emptyPool(size: number): PoolState {
  return {
    slots: Array.from({ length: size }, () => ({ lightId: null, weight: 0, target: 0 as const })),
    candidates: new Set(),
  }
}

/**
 * Advance the pool by `dt` seconds toward `wanted` (ids in priority order, already capped to the
 * slot count by the caller). `candidates` is every fixture that is lit at all right now, whether
 * or not it is in scope. Returns a NEW state; the input is not mutated.
 */
export function stepPool(
  prev: PoolState,
  wanted: readonly string[],
  candidates: ReadonlySet<string>,
  dt: number,
  instant: boolean,
): PoolState {
  const want = new Set(wanted)
  const rateIn = dt / POOL_FADE_S
  const rateOut = dt / POOL_FADE_OUT_S
  const slots = prev.slots.map((s) => ({ ...s }))
  for (const s of slots) {
    if (s.lightId === null) continue
    if (!candidates.has(s.lightId)) {
      // Switched off or deleted — out now, as it always was.
      s.lightId = null
      s.weight = 0
      s.target = 0
      continue
    }
    s.target = want.has(s.lightId) ? 1 : 0
    // Instant: nothing fades out, so a leaving fixture's slot is free for an entering one now.
    if (instant && s.target === 0) {
      s.lightId = null
      s.weight = 0
    }
  }
  // Place entering fixtures in free slots, in priority order.
  const held = new Set(slots.map((s) => s.lightId))
  for (const id of wanted) {
    if (held.has(id)) continue
    const free = slots.find((s) => s.lightId === null || (s.target === 0 && s.weight <= 0))
    if (!free) break
    // A fixture that was already lit elsewhere came into scope → fade. One that has only just
    // been switched on (or the first frame) → appear, like the switch always did.
    const fade = !instant && prev.candidates.has(id)
    free.lightId = id
    free.target = 1
    free.weight = fade ? 0 : 1
    held.add(id)
  }
  for (const s of slots) {
    if (s.lightId === null) continue
    if (instant) s.weight = s.target
    else if (s.weight < s.target) s.weight = Math.min(1, s.weight + rateIn)
    else if (s.weight > s.target) s.weight = Math.max(0, s.weight - rateOut)
    if (s.target === 0 && s.weight <= 0) {
      s.lightId = null
      s.weight = 0
    }
  }
  return { slots, candidates }
}

/** True while any slot is mid-fade — the caller must keep requesting frames until it settles. */
export function poolFading(state: PoolState): boolean {
  return state.slots.some((s) => s.lightId !== null && s.weight !== s.target)
}
