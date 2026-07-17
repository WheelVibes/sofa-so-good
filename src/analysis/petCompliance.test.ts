import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../floorplan/types'
import type { FurnitureItem } from '../furniture/types'
import {
  buildPetCompliance,
  countPlanWindows,
  essentialDefIdsForPetTypes,
  isPetType,
  PET_TYPE_LABEL,
  PET_TYPES,
  type PetType,
  petComplianceSummary,
} from './petCompliance'

/** Minimal placed item — only `id`/`defId` matter to the checker. */
function item(
  defId: string,
  id = `${defId}-${Math.random().toString(36).slice(2)}`,
): FurnitureItem {
  return { id, defId, position: [0, 0], rotation: 0, props: {} } as FurnitureItem
}

/** A plan with `n` window openings (plus one door, ignored by the checker). */
function planWithWindows(n: number): FloorPlan {
  const openings = [
    {
      id: 'door-1',
      kind: 'door' as const,
      wallId: 'w0',
      offset: 0,
      width: 0.9,
      sill: 0,
      head: 2.1,
    },
    ...Array.from({ length: n }, (_, i) => ({
      id: `win-${i}`,
      kind: 'window' as const,
      wallId: 'w0',
      offset: 0,
      width: 1.2,
      sill: 0.9,
      head: 2.1,
    })),
  ]
  return {
    id: 'p',
    name: 'Plan',
    ceilingHeight: 2.6,
    extent: [10, 10],
    walls: [{ id: 'w0', start: [0, 0], end: [10, 0], thickness: 'external' }],
    openings,
    rooms: [],
  } as unknown as FloorPlan
}

describe('petCompliance — pet type vocabulary', () => {
  it('exposes seven pet types with labels', () => {
    expect(PET_TYPES).toHaveLength(7)
    for (const t of PET_TYPES) expect(PET_TYPE_LABEL[t]).toBeTruthy()
  })
  it('isPetType guards the vocabulary', () => {
    expect(isPetType('cat')).toBe(true)
    expect(isPetType('small-pet')).toBe(false)
    expect(isPetType(42)).toBe(false)
    expect(isPetType(undefined)).toBe(false)
  })
})

describe('petCompliance — empty profile', () => {
  it('yields no entries for an empty profile', () => {
    const r = buildPetCompliance([], [item('litter-box')], planWithWindows(3))
    expect(r.entries).toEqual([])
    expect(r.requiredTotal).toBe(0)
    expect(petComplianceSummary(r).ok).toBe(true)
  })
})

describe('petCompliance — cat rules', () => {
  it('flags the window-mesh + litter required items as missing when nothing is placed', () => {
    const r = buildPetCompliance(['cat'], [], planWithWindows(3))
    const mesh = r.entries.find((e) => e.id === 'cat:window-mesh')!
    expect(mesh.kind).toBe('required')
    expect(mesh.status).toBe('missing')
    expect(mesh.need).toBe(3)
    expect(mesh.have).toBe(0)
    expect(mesh.cite).toMatch(/Cat Management Framework/)
    const litter = r.entries.find((e) => e.id === 'cat:litter')!
    expect(litter.status).toBe('missing')
    expect(r.requiredMissing).toBe(2)
  })

  it('counts partial window meshing (N of M windows)', () => {
    const r = buildPetCompliance(
      ['cat'],
      [item('window-mesh-screen'), item('window-mesh-screen')],
      planWithWindows(3),
    )
    const mesh = r.entries.find((e) => e.id === 'cat:window-mesh')!
    expect(mesh.status).toBe('partial')
    expect(mesh.have).toBe(2)
    expect(mesh.need).toBe(3)
    expect(r.requiredPartial).toBe(1)
  })

  it('marks mesh done when every window is meshed and caps a spare mesh', () => {
    const r = buildPetCompliance(
      ['cat'],
      [
        item('window-mesh-screen'),
        item('window-mesh-screen'),
        item('window-mesh-screen'),
        item('window-mesh-screen'),
      ],
      planWithWindows(3),
    )
    const mesh = r.entries.find((e) => e.id === 'cat:window-mesh')!
    expect(mesh.status).toBe('done')
    expect(mesh.have).toBe(3) // capped at the window count, not 4
  })

  it('skips the mesh rule entirely when the plan has no windows', () => {
    const r = buildPetCompliance(['cat'], [], planWithWindows(0))
    expect(r.entries.find((e) => e.id === 'cat:window-mesh')).toBeUndefined()
  })

  it('litter-cabinet satisfies the litter requirement', () => {
    const r = buildPetCompliance(['cat'], [item('litter-cabinet')], planWithWindows(1))
    expect(r.entries.find((e) => e.id === 'cat:litter')!.status).toBe('done')
  })

  it('cat-tree satisfies both scratching and vertical recommendations', () => {
    const r = buildPetCompliance(['cat'], [item('cat-tree')], planWithWindows(1))
    expect(r.entries.find((e) => e.id === 'cat:scratching')!.status).toBe('done')
    expect(r.entries.find((e) => e.id === 'cat:vertical')!.status).toBe('done')
  })
})

describe('petCompliance — dog rules', () => {
  it('requires a rest area and surfaces the HDB info note', () => {
    const r = buildPetCompliance(['dog'], [], planWithWindows(2))
    const rest = r.entries.find((e) => e.id === 'dog:rest-area')!
    expect(rest.kind).toBe('required')
    expect(rest.status).toBe('missing')
    const info = r.entries.find((e) => e.id === 'dog:hdb-approval')!
    expect(info.kind).toBe('info')
    expect(info.status).toBe('done') // info notes never count as missing
    expect(info.cite).toMatch(/HDB/)
    // info notes are excluded from required + recommended tallies
    expect(r.requiredMissing).toBe(1)
  })

  it('pet-bed satisfies the rest area; playpen satisfies containment', () => {
    const r = buildPetCompliance(
      ['dog'],
      [item('pet-bed'), item('pet-playpen')],
      planWithWindows(2),
    )
    expect(r.entries.find((e) => e.id === 'dog:rest-area')!.status).toBe('done')
    expect(r.entries.find((e) => e.id === 'dog:containment')!.status).toBe('done')
  })
})

describe('petCompliance — other pets', () => {
  it('bird requires a cage', () => {
    const missing = buildPetCompliance(['bird'], [], planWithWindows(1))
    expect(missing.entries.find((e) => e.id === 'bird:cage')!.status).toBe('missing')
    const done = buildPetCompliance(['bird'], [item('bird-cage')], planWithWindows(1))
    expect(done.entries.find((e) => e.id === 'bird:cage')!.status).toBe('done')
  })

  it('rabbit + guinea pig require an enclosure (hutch or pen)', () => {
    const r = buildPetCompliance(
      ['rabbit', 'guinea-pig'],
      [item('small-pet-pen')],
      planWithWindows(0),
    )
    expect(r.entries.find((e) => e.id === 'rabbit:enclosure')!.status).toBe('done')
    expect(r.entries.find((e) => e.id === 'guinea-pig:enclosure')!.status).toBe('done')
  })

  it('hamster requires a tank', () => {
    const r = buildPetCompliance(['hamster'], [], planWithWindows(0))
    expect(r.entries.find((e) => e.id === 'hamster:tank')!.status).toBe('missing')
  })

  it('fish requires an aquarium and shows the ~300 kg load note', () => {
    const r = buildPetCompliance(['fish'], [item('aquarium-stand')], planWithWindows(0))
    expect(r.entries.find((e) => e.id === 'fish:aquarium')!.status).toBe('done')
    const note = r.entries.find((e) => e.id === 'fish:load-note')!
    expect(note.kind).toBe('info')
    expect(note.detail).toMatch(/300 kg/)
  })
})

describe('petCompliance — multi-pet + summary', () => {
  it('aggregates required counts across pet types', () => {
    const r = buildPetCompliance(
      ['cat', 'dog'],
      [item('window-mesh-screen'), item('litter-box'), item('dog-bed-orthopedic')],
      planWithWindows(1),
    )
    // cat mesh done + litter done, dog rest done → all required satisfied
    expect(r.requiredMissing).toBe(0)
    expect(r.requiredPartial).toBe(0)
    expect(petComplianceSummary(r).ok).toBe(true)
  })

  it('ordering follows PET_TYPES then rule order', () => {
    const r = buildPetCompliance(['dog', 'cat'], [], planWithWindows(1))
    const firstDog = r.entries.findIndex((e) => e.petType === 'dog')
    const firstCat = r.entries.findIndex((e) => e.petType === 'cat')
    expect(firstDog).toBeLessThan(firstCat) // dog precedes cat in PET_TYPES
  })
})

describe('petCompliance — window counting across levels', () => {
  it('counts windows on upper storeys too', () => {
    const base = planWithWindows(2)
    const multi = {
      ...base,
      upperLevels: [
        {
          id: 'l2',
          name: 'Level 2',
          elevation: 3,
          walls: [{ id: 'w1', start: [0, 0], end: [10, 0], thickness: 'external' }],
          openings: [
            {
              id: 'win-u',
              kind: 'window',
              wallId: 'w1',
              offset: 0,
              width: 1.2,
              sill: 0.9,
              head: 2.1,
            },
          ],
          rooms: [],
        },
      ],
    } as unknown as FloorPlan
    expect(countPlanWindows(multi)).toBe(3)
    expect(countPlanWindows(null)).toBe(0)
  })
})

describe('petCompliance — essentials for catalog surfacing', () => {
  it('unions required def ids for the declared pet types', () => {
    const cat = essentialDefIdsForPetTypes(['cat'])
    expect(cat.has('window-mesh-screen')).toBe(true)
    expect(cat.has('litter-box')).toBe(true)
    expect(cat.has('litter-cabinet')).toBe(true)
    // recommended-only defs are NOT essential
    expect(cat.has('scratching-post')).toBe(false)
    expect(cat.has('cat-window-perch')).toBe(false)
  })
  it('empty profile → empty set', () => {
    expect(essentialDefIdsForPetTypes([]).size).toBe(0)
  })
  it('merges across multiple pet types', () => {
    const s = essentialDefIdsForPetTypes(['dog', 'fish'] as PetType[])
    expect(s.has('dog-bed-orthopedic')).toBe(true)
    expect(s.has('aquarium-stand')).toBe(true)
  })
})
