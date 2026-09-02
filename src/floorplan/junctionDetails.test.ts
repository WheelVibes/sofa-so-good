import { describe, expect, it } from 'vitest'
import { buildJunctionDetails } from './junctionDetails'
import type { FloorPlan } from './types'

/** A bare 4 × 3 m room, no ceiling treatment, no windows, no wet area. */
function plan(over: Partial<FloorPlan> = {}): FloorPlan {
  return {
    name: 'p',
    extent: [4, 3],
    ceilingHeight: 2.6,
    walls: [
      { id: 'w-n', start: [0, 0], end: [4, 0], thickness: 'external' },
      { id: 'w-e', start: [4, 0], end: [4, 3], thickness: 'external' },
    ],
    openings: [],
    rooms: [{ id: 'r1', name: 'Living', origin: [0, 0], width: 4, depth: 3 }],
    ...over,
  } as unknown as FloorPlan
}

describe('buildJunctionDetails', () => {
  it('returns nothing for a plan with nothing to detail', () => {
    // No ceiling treatment, no wet room, no level change, no windows.
    expect(buildJunctionDetails(plan())).toEqual([])
  })

  it('details a window sill and head from the opening and wall thickness', () => {
    const details = buildJunctionDetails(
      plan({
        openings: [
          {
            id: 'win1',
            wallId: 'w-n',
            kind: 'window',
            offset: 1,
            width: 1.2,
            sill: 0.9,
            head: 2.1,
          },
        ],
      } as never),
    )
    const win = details.find((d) => d.kind === 'window-sill')
    expect(win).toBeDefined()
    const byLabel = Object.fromEntries(win!.dimensions.map((d) => [d.label, d.mm]))
    expect(byLabel['Sill height above FFL']).toBe(900)
    expect(byLabel['Head height above FFL']).toBe(2100)
    expect(byLabel['Opening height']).toBe(1200)
    // Reveal depth comes from the resolved wall thickness, not a guess.
    expect(byLabel['Wall thickness (reveal depth)']).toBeGreaterThan(0)
  })

  it('groups identical windows into ONE detail rather than repeating it', () => {
    const win = (id: string) => ({
      id,
      wallId: 'w-n',
      kind: 'window',
      offset: 1,
      width: 1.2,
      sill: 0.9,
      head: 2.1,
    })
    const details = buildJunctionDetails(
      plan({ openings: [win('a'), win('b'), win('c')] } as never),
    )
    expect(details.filter((d) => d.kind === 'window-sill')).toHaveLength(1)
  })

  it('separates windows that differ in sill height', () => {
    const details = buildJunctionDetails(
      plan({
        openings: [
          { id: 'a', wallId: 'w-n', kind: 'window', offset: 1, width: 1, sill: 0.9, head: 2.1 },
          { id: 'b', wallId: 'w-n', kind: 'window', offset: 2, width: 1, sill: 0.45, head: 2.1 },
        ],
      } as never),
    )
    expect(details.filter((d) => d.kind === 'window-sill')).toHaveLength(2)
  })

  it('ignores doors — they are not a sill detail', () => {
    const details = buildJunctionDetails(
      plan({
        openings: [
          { id: 'd1', wallId: 'w-n', kind: 'door', offset: 1, width: 0.9, sill: 0, head: 2.1 },
        ],
      } as never),
    )
    expect(details).toEqual([])
  })

  it('details a wet-area upturn with the real 300 mm general height', () => {
    const details = buildJunctionDetails(
      plan({
        rooms: [{ id: 'b1', name: 'Bath/WC 1', origin: [0, 0], width: 2, depth: 2 }],
      } as never),
    )
    const wp = details.find((d) => d.kind === 'waterproofing-upturn')
    expect(wp).toBeDefined()
    expect(wp!.dimensions[0]!.mm).toBe(300)
    expect(wp!.notes.join(' ')).toMatch(/never bed tiles into it/i)
  })

  it('gives every detail a quotable id, a location and at least one dimension', () => {
    const details = buildJunctionDetails(
      plan({
        rooms: [{ id: 'b1', name: 'Bath/WC 1', origin: [0, 0], width: 2, depth: 2 }],
        openings: [
          { id: 'a', wallId: 'w-n', kind: 'window', offset: 1, width: 1, sill: 0.9, head: 2.1 },
        ],
      } as never),
    )
    expect(details.length).toBeGreaterThan(0)
    for (const d of details) {
      expect(d.id).toMatch(/^D-[A-Z]{2}-\d{2}$/)
      expect(d.location.trim()).not.toBe('')
      expect(d.dimensions.length).toBeGreaterThan(0)
      expect(d.notes.length).toBeGreaterThan(0)
      for (const dim of d.dimensions) expect(Number.isFinite(dim.mm)).toBe(true)
    }
  })

  it('numbers ids per detail kind, independently', () => {
    const details = buildJunctionDetails(
      plan({
        rooms: [{ id: 'b1', name: 'Bath/WC 1', origin: [0, 0], width: 2, depth: 2 }],
        openings: [
          { id: 'a', wallId: 'w-n', kind: 'window', offset: 1, width: 1, sill: 0.9, head: 2.1 },
          { id: 'b', wallId: 'w-n', kind: 'window', offset: 2, width: 1, sill: 0.45, head: 2.1 },
        ],
      } as never),
    )
    const ws = details.filter((d) => d.kind === 'window-sill').map((d) => d.id)
    expect(ws).toEqual(['D-WS-01', 'D-WS-02'])
  })

  it('never invents a skirting or cornice profile detail', () => {
    // The model stores trim HEIGHTS but no profile or specified projection, so
    // drawing one would mean inventing dimensions a contractor would build to.
    const details = buildJunctionDetails(
      plan({
        walls: [
          {
            id: 'w-n',
            start: [0, 0],
            end: [4, 0],
            thickness: 'external',
            baseboard: { height: 0.12 },
            crown: { height: 0.09 },
          },
        ],
      } as never),
    )
    expect(details.some((d) => /skirting|cornice|architrave|kerb|worktop/i.test(d.title))).toBe(
      false,
    )
  })

  it('is deterministic', () => {
    const p = plan({
      rooms: [{ id: 'b1', name: 'Bath/WC 1', origin: [0, 0], width: 2, depth: 2 }],
    } as never)
    expect(buildJunctionDetails(p)).toEqual(buildJunctionDetails(p))
  })
})

describe('buildJunctionDetails — multi-storey (F13)', () => {
  it('details an UPPER-storey window, not just ground-floor ones', () => {
    // `plan.openings` is ground-only, so an upstairs window produced no
    // sill/head detail at all — silently absent from the detail sheet.
    const twoStorey = {
      ...plan(),
      upperLevels: [
        {
          id: 'upper',
          name: 'Upper storey',
          elevation: 3,
          walls: [{ id: 'u-w', start: [0, 0], end: [4, 0], thickness: 'external' }],
          openings: [
            {
              id: 'u-win',
              wallId: 'u-w',
              kind: 'window',
              offset: 1,
              width: 1.2,
              sill: 1.1,
              head: 2.2,
            },
          ],
          rooms: [{ id: 'u-r', name: 'Bedroom', origin: [0, 0], width: 4, depth: 3 }],
        },
      ],
    } as unknown as FloorPlan
    const details = buildJunctionDetails(twoStorey)
    const win = details.find((d) => d.kind === 'window-sill')
    expect(win).toBeDefined()
    expect(win!.location).toContain('u-win')
    const byLabel = Object.fromEntries(win!.dimensions.map((d) => [d.label, d.mm]))
    expect(byLabel['Sill height above FFL']).toBe(1100)
  })
})
