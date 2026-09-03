import { describe, expect, it } from 'vitest'
import { buildDefaultPlan } from './defaultPlan'
import { allPlanRooms, allPlanWalls } from './levels'
import { roomCategory } from './roomCategory'
import { roomBoundaryWalls } from './roomWallNames'
import { PLAN_TEMPLATES } from './templates'
import type { FloorPlan, PlanRoom, PlanWall } from './types'
import {
  establishedWallStructure,
  establishedWallStructureInPlan,
  type HackClass,
  hackClassDescription,
  hackClassLabel,
  isDemolitionRestricted,
  shelterWallIds,
  wallHackability,
} from './wallHackability'

describe('wallHackability', () => {
  const cases: Array<[PlanWall['structure'], HackClass]> = [
    ['load-bearing', 'no'],
    ['rc-partition', 'no'],
    ['gable-end', 'no'],
    ['brick-partition', 'permit'],
    ['drywall', 'permit'],
    ['unknown', 'unknown'],
  ]

  for (const [structure, expected] of cases) {
    it(`classifies ${structure} as ${expected}`, () => {
      expect(wallHackability(structure)).toBe(expected)
    })
  }

  it('treats undefined structure as unknown', () => {
    expect(wallHackability(undefined)).toBe('unknown')
    expect(wallHackability()).toBe('unknown')
  })

  it('labels each class', () => {
    expect(hackClassLabel('no')).toBe('Not permitted')
    expect(hackClassLabel('permit')).toBe('Permit required')
    expect(hackClassLabel('unknown')).toBe('Unclassified')
  })

  it('describes each class', () => {
    expect(hackClassDescription('no')).toMatch(/not permitted/i)
    expect(hackClassDescription('permit')).toMatch(/permit/i)
    expect(hackClassDescription('unknown')).toMatch(/confirm/i)
  })

  it('flags only structural walls as demolition-restricted', () => {
    expect(isDemolitionRestricted('load-bearing')).toBe(true)
    expect(isDemolitionRestricted('rc-partition')).toBe(true)
    expect(isDemolitionRestricted('gable-end')).toBe(true)
    expect(isDemolitionRestricted('brick-partition')).toBe(false)
    expect(isDemolitionRestricted('drywall')).toBe(false)
    expect(isDemolitionRestricted('unknown')).toBe(false)
    expect(isDemolitionRestricted(undefined)).toBe(false)
  })
})

/**
 * `establishedWallStructure` (v0.31.8.4). Every shipped template left `structure`
 * unset on every wall, so the hacking plan reported an entire flat —
 * facade included — as "Unclassified". HDB is unambiguous that external walls
 * cannot be hacked, so reporting that as unknown was a missing fact, not caution.
 */
describe('establishedWallStructure', () => {
  const w = (
    thickness: 'external' | 'internal',
    structure?: PlanWall['structure'],
  ): Pick<PlanWall, 'structure' | 'thickness'> => ({ thickness, structure })

  it('establishes an undeclared EXTERNAL wall as load-bearing', () => {
    expect(establishedWallStructure(w('external'))).toBe('load-bearing')
    expect(wallHackability(establishedWallStructure(w('external')))).toBe('no')
  })

  it('leaves an undeclared INTERNAL wall unknown', () => {
    // Deliberate: for a generic flat-TYPE archetype there is no single correct
    // answer, since structural layout varies by block and construction era. An
    // official per-block plan cannot classify a template, because a template is
    // not a block.
    expect(establishedWallStructure(w('internal'))).toBeUndefined()
    expect(wallHackability(establishedWallStructure(w('internal')))).toBe('unknown')
  })

  it('never overrides a declaration, including a surprising one', () => {
    // A user who declares their external wall a drywall is wrong, but it is
    // their declaration and this function only fills blanks.
    expect(establishedWallStructure(w('external', 'drywall'))).toBe('drywall')
    expect(establishedWallStructure(w('internal', 'load-bearing'))).toBe('load-bearing')
    expect(establishedWallStructure(w('external', 'gable-end'))).toBe('gable-end')
  })

  it('does not claim gable-end for a plain facade wall', () => {
    // `gable-end` is specifically the block's exposed END wall, which cannot be
    // told apart from any other external wall here. Both classify as 'no', so
    // nothing is under-reported by staying with 'load-bearing'.
    expect(establishedWallStructure(w('external'))).not.toBe('gable-end')
  })

  it('is idempotent — resolving twice changes nothing', () => {
    const once = establishedWallStructure(w('external'))
    expect(establishedWallStructure({ thickness: 'external', structure: once })).toBe(once)
  })
})

/**
 * `shelterWallIds` + `establishedWallStructureInPlan` (v0.31.8.26) — the
 * household-shelter exception the module docstring had recorded as blocked on a
 * `'shelter'` room category. SCDF forbids hacking any part of a household
 * shelter's RC walls, and unlike a load-bearing wall no permit or PE endorsement
 * lifts that, so reporting one as "Unclassified" was a missing fact.
 */
describe('shelterWallIds', () => {
  const wall = (
    id: string,
    start: [number, number],
    end: [number, number],
    thickness: 'external' | 'internal' = 'internal',
  ): PlanWall => ({ id, start, end, thickness })

  /** A 2×2 shelter at the origin, ringed by four undeclared internal walls. */
  const shelterPlan = (category?: 'shelter' | 'storeroom'): FloorPlan => ({
    id: 'p',
    name: 'P',
    ceilingHeight: 2.6,
    extent: [10, 10],
    rooms: [{ id: 'hs', name: 'Household Shelter', origin: [0, 0], width: 2, depth: 2, category }],
    walls: [
      wall('w-n', [0, 0], [2, 0]),
      wall('w-e', [2, 0], [2, 2]),
      wall('w-s', [2, 2], [0, 2]),
      wall('w-w', [0, 2], [0, 0]),
      wall('far', [5, 5], [7, 5]),
    ],
    openings: [],
  })

  it('collects the walls bounding a shelter and nothing else', () => {
    const ids = shelterWallIds(shelterPlan('shelter'))
    expect([...ids].sort()).toEqual(['w-e', 'w-n', 'w-s', 'w-w'])
    expect(ids.has('far')).toBe(false)
  })

  it('is empty when the room is a store room, not a shelter', () => {
    // The fixture is not inert: identical geometry, different category.
    expect(shelterWallIds(shelterPlan('storeroom')).size).toBe(0)
    // Name inference alone still resolves it — an authored category that says
    // storeroom OUTRANKS the name, which is why the templates had to be
    // recategorised rather than relying on the name.
    expect(shelterWallIds(shelterPlan()).size).toBe(4)
  })

  it('classifies an undeclared INTERNAL shelter wall as not permitted', () => {
    const plan = shelterPlan('shelter')
    const ids = shelterWallIds(plan)
    const w = plan.walls.find((x) => x.id === 'w-n')!
    // Without the shelter rule this is the `undefined`/`unknown` case.
    expect(establishedWallStructure(w)).toBeUndefined()
    expect(establishedWallStructureInPlan(w, ids)).toBe('rc-partition')
    expect(wallHackability(establishedWallStructureInPlan(w, ids))).toBe('no')
  })

  it('lets a user declaration win over the shelter rule', () => {
    const ids = new Set(['w-n'])
    expect(
      establishedWallStructureInPlan(
        { id: 'w-n', thickness: 'internal', structure: 'drywall' },
        ids,
      ),
    ).toBe('drywall')
  })

  it('prefers the shelter rule over the envelope rule', () => {
    // A shelter wall that is also on the façade: both classify 'no', so the
    // order under-reports nothing, but rc-partition is the more specific fact.
    expect(
      establishedWallStructureInPlan({ id: 'w-n', thickness: 'external' }, new Set(['w-n'])),
    ).toBe('rc-partition')
    expect(
      establishedWallStructureInPlan({ id: 'other', thickness: 'external' }, new Set(['w-n'])),
    ).toBe('load-bearing')
  })

  it('does not let a shelter classify a wall on ANOTHER storey', () => {
    // F13: an upper-storey wall directly above the shelter is collinear with its
    // boundary, so a level-BLIND walk marks it RC. Measured on the shipped
    // corpus this is real, not hypothetical — see the maisonette test below.
    // Storeys are `plan.upperLevels`, each carrying its OWN walls/rooms arrays;
    // there is no `level` field on a wall.
    const base = shelterPlan('shelter')
    const multi: FloorPlan = {
      ...base,
      upperLevels: [
        {
          id: 'upper',
          name: 'Upper',
          elevation: 3,
          walls: [wall('up-n', [0, 0], [2, 0])],
          openings: [],
          rooms: [{ id: 'up-bed', name: 'Bedroom', origin: [0, 0], width: 2, depth: 2 }],
        },
      ],
    }
    const ids = shelterWallIds(multi)
    expect(ids.has('w-n')).toBe(true)
    // The upper wall is collinear with the ground shelter's north edge, and the
    // upper storey has no shelter of its own, so it must not be classified.
    expect(ids.has('up-n')).toBe(false)
  })

  it('would catch upper-storey walls without the per-level scoping', () => {
    // Proves the scoping is what does the work, using the real shipped plan:
    // a level-blind walk over `allPlanWalls` finds MORE walls for the
    // maisonette's ground-floor shelter than the level-scoped resolver does.
    const maisonette = PLAN_TEMPLATES.find((t) => t.id === 'tpl-hdb-maisonette')
    expect(maisonette).toBeDefined()
    const plan = maisonette as FloorPlan
    const shelter = allPlanRooms(plan).find((r) => roomCategory(r) === 'shelter')
    expect(shelter).toBeDefined()
    const levelBlind = roomBoundaryWalls(allPlanWalls(plan), shelter as PlanRoom)
    const scoped = shelterWallIds(plan)
    expect(levelBlind.length).toBeGreaterThan(scoped.size)
  })
})

describe('shipped plans — every household-shelter wall is NOT PERMITTED', () => {
  const plans: [string, FloorPlan][] = [
    ['DEFAULT', buildDefaultPlan()],
    ...PLAN_TEMPLATES.map((t): [string, FloorPlan] => [t.id ?? '?', t]),
  ]

  it('classifies all of them, and the rule is what does it', () => {
    const unresolved: string[] = []
    let ruleDidTheWork = 0
    for (const [id, plan] of plans) {
      const ids = shelterWallIds(plan)
      for (const wid of ids) {
        const w = allPlanWalls(plan).find((x: PlanWall) => x.id === wid)
        if (!w) continue
        if (wallHackability(establishedWallStructureInPlan(w, ids)) !== 'no')
          unresolved.push(`${id}:${wid}`)
        // Would this wall have been 'unknown' WITHOUT the shelter rule?
        if (wallHackability(establishedWallStructure(w)) === 'unknown') ruleDidTheWork++
      }
    }
    expect(unresolved).toEqual([])
    // Guards against the whole rule going inert: if every shipped shelter wall
    // were already declared or external, this suite would pass while proving
    // nothing. Measured at the time of writing: 10 such walls across 6 plans.
    expect(ruleDidTheWork).toBeGreaterThan(0)
  })
})
