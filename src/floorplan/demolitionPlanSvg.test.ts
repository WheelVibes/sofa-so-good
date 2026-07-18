import { describe, expect, it } from 'vitest'
import type { WallDiff } from './demolitionPlan'
import { demolitionSvg } from './demolitionPlanSvg'
import type { PlanWall } from './types'

function wall(
  id: string,
  start: [number, number],
  end: [number, number],
  over: Partial<PlanWall> = {},
): PlanWall {
  return { id, start, end, thickness: 'internal', ...over }
}

const PALETTE = {
  kept: '#11aa22',
  demolished: '#cc2233',
  added: '#2244ff',
  ink: '#101010',
  danger: '#7f1d1d',
}

function sampleDiff(): WallDiff {
  return {
    // Classified drywall — kept, so no hatch/warning noise on the base cases.
    kept: [wall('a', [0, 0], [4, 0], { structure: 'drywall' })],
    demolished: [wall('b', [4, 0], [4, 3], { structure: 'drywall' })],
    added: [wall('c', [0, 0], [0, 5])],
    hackedLengthM: 3,
    addedLengthM: 5,
  }
}

describe('demolitionSvg', () => {
  it('emits an <svg> with a viewBox', () => {
    const svg = demolitionSvg(sampleDiff(), { palette: PALETTE })
    expect(svg).toContain('<svg')
    expect(svg).toMatch(/viewBox="0 0 [\d.]+ [\d.]+"/)
    expect(svg.trim().endsWith('</svg>')).toBe(true)
  })

  it('draws a line per wall plus a hatch group for the demolished wall plus legend swatches', () => {
    const svg = demolitionSvg(sampleDiff(), { palette: PALETTE })
    // 3 wall centrelines + legend swatches (kept/demolished/added).
    const lineCount = (svg.match(/<line /g) ?? []).length
    const hatchLineCount = (
      svg.match(/<g class="hatch">([\s\S]*?)<\/g>/)?.[1].match(/<line /g) ?? []
    ).length
    // 1 demolished wall → ≥ 1 diagonal hatch tick, in its own group.
    expect(hatchLineCount).toBeGreaterThan(0)
    // Total lines = 3 centrelines + hatch ticks + 3 legend swatches.
    expect(lineCount).toBe(3 + hatchLineCount + 3)
  })

  it('injects all palette colours and a legend', () => {
    const svg = demolitionSvg(sampleDiff(), { palette: PALETTE })
    expect(svg).toContain(PALETTE.kept)
    expect(svg).toContain(PALETTE.demolished)
    expect(svg).toContain(PALETTE.added)
    expect(svg).toContain(PALETTE.ink)
    expect(svg).toContain('class="legend"')
    expect(svg).toContain('Kept (1)')
    expect(svg).toContain('Demolished (1)')
    expect(svg).toContain('Added (1)')
  })

  it('dashes demolished walls and does not hardcode foreign colours', () => {
    const svg = demolitionSvg(sampleDiff(), { palette: PALETTE })
    expect(svg).toContain('stroke-dasharray')
    // No stray hex colours beyond the injected palette.
    const hexes = new Set(svg.match(/#[0-9a-fA-F]{3,6}/g) ?? [])
    for (const h of hexes) {
      expect(Object.values(PALETTE)).toContain(h)
    }
  })

  it('handles an empty diff without throwing', () => {
    const svg = demolitionSvg(
      { kept: [], demolished: [], added: [], hackedLengthM: 0, addedLengthM: 0 },
      { palette: PALETTE },
    )
    expect(svg).toContain('<svg')
    // Only legend swatches, no wall lines.
    expect((svg.match(/<line /g) ?? []).length).toBe(3)
  })

  it('renders the concise SG permit-note block', () => {
    const svg = demolitionSvg(sampleDiff(), { palette: PALETTE })
    expect(svg).toContain('class="permit-notes"')
    expect(svg).toContain('HDB permit')
    expect(svg).toContain('load-bearing')
    expect(svg).toMatch(/Professional Engineer|PE endorsement/)
    expect(svg).toContain('user-declared')
  })

  describe('wall structural classification (G7)', () => {
    it('gives a load-bearing wall a heavy line + legend row, even when kept', () => {
      const diff: WallDiff = {
        kept: [wall('a', [0, 0], [4, 0], { structure: 'load-bearing' })],
        demolished: [],
        added: [],
        hackedLengthM: 0,
        addedLengthM: 0,
      }
      const svg = demolitionSvg(diff, { palette: PALETTE })
      expect(svg).toContain('stroke-width="5"')
      expect(svg).toContain('Load-bearing (heavy line)')
    })

    it('escalates a load-bearing wall marked for demolition to a danger treatment', () => {
      const diff: WallDiff = {
        kept: [],
        demolished: [wall('b', [4, 0], [4, 3], { structure: 'load-bearing' })],
        added: [],
        hackedLengthM: 3,
        addedLengthM: 0,
      }
      const svg = demolitionSvg(diff, { palette: PALETTE })
      expect(svg).toContain(PALETTE.danger)
      expect(svg).toContain('NOT PERMITTED')
      expect(svg).toContain('NOT PERMITTED — load-bearing (1)')
    })

    it('falls back to the demolished colour for danger when the palette omits it', () => {
      const noDangerPalette = {
        kept: '#11aa22',
        demolished: '#cc2233',
        added: '#2244ff',
        ink: '#101010',
      }
      const diff: WallDiff = {
        kept: [],
        demolished: [wall('b', [4, 0], [4, 3], { structure: 'load-bearing' })],
        added: [],
        hackedLengthM: 3,
        addedLengthM: 0,
      }
      const svg = demolitionSvg(diff, { palette: noDangerPalette })
      expect(svg).toContain('NOT PERMITTED')
      // No stray hex beyond the 4-colour palette (no separate danger colour injected).
      const hexes = new Set(svg.match(/#[0-9a-fA-F]{3,6}/g) ?? [])
      for (const h of hexes) {
        expect(Object.values(noDangerPalette)).toContain(h)
      }
    })

    it('warns on an unverified (unknown/absent) classification being demolished', () => {
      const diff: WallDiff = {
        kept: [],
        demolished: [wall('b', [4, 0], [4, 3])], // no `structure` — absent = unknown.
        added: [],
        hackedLengthM: 3,
        addedLengthM: 0,
      }
      const svg = demolitionSvg(diff, { palette: PALETTE })
      expect(svg).toContain('⚠')
      expect(svg).toContain('Structure unverified')
      expect(svg).toContain('confirm with HDB/PE before hacking (1)')
    })

    it('adds no classification rows when every wall is classified and none is load-bearing', () => {
      const svg = demolitionSvg(sampleDiff(), { palette: PALETTE })
      // The permit-note block always mentions "Load-bearing" generically — only
      // the classification-specific rows/markers should be absent.
      expect(svg).not.toContain('Load-bearing (heavy line)')
      expect(svg).not.toContain('NOT PERMITTED')
      expect(svg).not.toContain('⚠')
    })
  })
})
