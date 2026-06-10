import { describe, expect, it } from 'vitest'
import type { WallDiff } from './demolitionPlan'
import { demolitionSvg } from './demolitionPlanSvg'
import type { PlanWall } from './types'

function wall(id: string, start: [number, number], end: [number, number]): PlanWall {
  return { id, start, end, thickness: 'internal' }
}

const PALETTE = {
  kept: '#11aa22',
  demolished: '#cc2233',
  added: '#2244ff',
  ink: '#101010',
}

function sampleDiff(): WallDiff {
  return {
    kept: [wall('a', [0, 0], [4, 0])],
    demolished: [wall('b', [4, 0], [4, 3])],
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

  it('draws a line per wall plus legend swatches', () => {
    const svg = demolitionSvg(sampleDiff(), { palette: PALETTE })
    const lineCount = (svg.match(/<line /g) ?? []).length
    // 3 wall lines + 3 legend swatch lines.
    expect(lineCount).toBe(6)
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
})
