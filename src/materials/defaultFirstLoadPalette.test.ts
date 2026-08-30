import { describe, expect, it } from 'vitest'
import { ROOMS } from '../apartment/constants'
import { FINISHES_INITIAL } from '../state/slices/finishesSlice'
import { BUILTIN_MATERIALS } from './builtinCatalog'

/**
 * DEFAULT-FIRST-LOAD-PALETTE (v0.31.5.126) — the finishes a brand-new visitor
 * meets, pinned BY NAME.
 *
 * A fresh visitor has no persisted state, so the flat they see is rendered from
 * `FINISHES_INITIAL` alone (`DEFAULT_FLOOR`/`DEFAULT_WALL` plus the per-room
 * `DEFAULT_ROOM_FLOOR`/`DEFAULT_ROOM_WALL` overrides, which follow the Serangoon
 * North Vista 4-room handover spec). Verified end to end with
 * `scripts/dev-probes/first-run.mjs SEQUENCE=1 FAKE_HOUR=13` — the only probe
 * that suppresses nothing: carousel → 9 tour steps → location prompt →
 * unobstructed, scene mean 181.5 → 183.1, near-black 0.0% throughout.
 *
 * `builtinCatalog.test.ts` already guards that the default ids EXIST and that
 * every painted default stays near-neutral (WARM-WALL-CAST). Neither pins WHICH
 * finish each room gets, so the shipped look could drift a room at a time
 * without a single test failing. This is that ratchet.
 *
 * **Changing a value here changes what every new user sees.** That is a product
 * decision, not a refactor — if a diff lands on this file, it should be because
 * the look was deliberately re-chosen, and the reason belongs in `CHANGELOG.md`.
 */
const EXPECTED_FLOOR: Record<string, string> = {
  mainBedroom: 'floor-vinyl-oak',
  bedroom2: 'floor-vinyl-oak',
  bedroom3: 'floor-vinyl-oak',
  livingDining: 'floor-vinyl-oak',
  corridor: 'floor-vinyl-oak',
  kitchen: 'floor-tile-beige',
  bath1: 'floor-tile-bath-green',
  bath2: 'floor-tile-bath-green',
  householdShelter: 'floor-tile-beige-300',
  serviceYard: 'floor-tile-beige-300',
  acLedge: 'floor-concrete',
}

/** Glazed porcelain in the wet rooms; everything else is painted plaster. */
const EXPECTED_WALL: Record<string, string> = {
  mainBedroom: 'wall-paint-white',
  bedroom2: 'wall-paint-white',
  bedroom3: 'wall-paint-white',
  livingDining: 'wall-paint-white',
  corridor: 'wall-paint-white',
  kitchen: 'wall-tile-white',
  bath1: 'wall-tile-white',
  bath2: 'wall-tile-white',
  householdShelter: 'wall-paint-white',
  serviceYard: 'wall-paint-white',
  acLedge: 'wall-paint-white',
}

describe('the default flat a new visitor sees on first load', () => {
  it('covers every room of the default flat, so it cannot pass by measuring nothing', () => {
    const rooms = Object.keys(ROOMS).sort()
    expect(rooms.length).toBe(11)
    expect(Object.keys(EXPECTED_FLOOR).sort()).toEqual(rooms)
    expect(Object.keys(EXPECTED_WALL).sort()).toEqual(rooms)
  })

  it('seeds exactly this floor finish in every room', () => {
    expect(FINISHES_INITIAL.finishes.floor).toEqual(EXPECTED_FLOOR)
  })

  it('seeds exactly this wall finish in every room', () => {
    expect(FINISHES_INITIAL.finishes.walls).toEqual(EXPECTED_WALL)
  })

  // An absent key is the plain white ceiling, which is the shipped look — a
  // seeded ceiling material would change every room at once.
  it('seeds no ceiling finish, no accents and no wall textures', () => {
    expect(FINISHES_INITIAL.finishes.ceiling).toEqual({})
    expect(FINISHES_INITIAL.finishes.wallAccents).toEqual({})
    expect(FINISHES_INITIAL.finishes.wallTex).toEqual({})
  })

  it('every seeded finish is a real catalog material', () => {
    const ids = [
      ...Object.values(FINISHES_INITIAL.finishes.floor),
      ...Object.values(FINISHES_INITIAL.finishes.walls),
    ]
    expect(ids.length).toBe(22)
    for (const id of ids) {
      expect(BUILTIN_MATERIALS[id as keyof typeof BUILTIN_MATERIALS], id).toBeDefined()
    }
  })
})
