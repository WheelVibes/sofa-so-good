import { describe, expect, it } from 'vitest'
import { buildReflectedCeilingPlan, type RcpFixtureInput } from './rcp'
import { rcpSvg } from './rcpSvg'
import type { FloorPlan, PlanElectricalPoint, PlanRoom } from './types'

const palette = { wall: '#111', ink: '#222', symbol: '#c33', zone: '#4c1', dim: '#06c' }

const box: FloorPlan['walls'] = [
  { id: 'a', start: [0, 0], end: [4, 0], thickness: 'external' },
  { id: 'b', start: [4, 0], end: [4, 4], thickness: 'external' },
  { id: 'c', start: [4, 4], end: [0, 4], thickness: 'external' },
  { id: 'd', start: [0, 4], end: [0, 0], thickness: 'external' },
]

function plan(rooms: PlanRoom[]): FloorPlan {
  return {
    id: 'p',
    name: 'Test',
    ceilingHeight: 2.6,
    extent: [4, 4],
    walls: box,
    openings: [],
    rooms,
  }
}

const trayRoom: PlanRoom = {
  id: 'r1',
  name: 'Living',
  origin: [0, 0],
  width: 4,
  depth: 4,
  ceiling: { style: 'tray', drop: 0.15, margin: 0.3 },
}

const fixtures: RcpFixtureInput[] = [
  { id: 'f1', type: 'ceiling-light', label: 'Flush mount', x: 1, z: 0.5 },
  { id: 'f2', type: 'ceiling-fan', label: 'Ceiling fan', x: 2, z: 2 },
]
const aircon: PlanElectricalPoint[] = [{ id: 'e1', x: 3.8, z: 0.2, kind: 'aircon' }]

describe('rcpSvg', () => {
  it('emits an svg root, wall lines, the tray treatment rect, fixture symbols, and a legend', () => {
    const testPlan = plan([trayRoom])
    const rcp = buildReflectedCeilingPlan(testPlan, fixtures, aircon)
    const svg = rcpSvg(testPlan, rcp, { palette })

    expect(svg).toContain('<svg')
    expect(svg).toContain('viewBox="0 0')
    expect(svg).toContain('<line')
    expect(svg).toContain('class="legend"')
    // Zone note text.
    expect(svg).toContain('FFL to false ceiling: 2450mm (Tray)')
    // Dashed inset rect for the tray's raised centre panel.
    expect(svg).toContain('stroke-dasharray="4 3"')
    // Fixture glyphs.
    expect(svg).toContain('class="rcp-fixture"')
    expect(svg).toContain('>CL<')
    expect(svg).toContain('>CF<')
    // Aircon glyph.
    expect(svg).toContain('class="rcp-aircon"')
    expect(svg).toContain('>AC<')
    // Wall-offset dimension labels (mm).
    expect(svg).toContain('1000mm')
    expect(svg).toContain('500mm')
  })

  it('injects palette colours and nothing hardcoded', () => {
    const testPlan = plan([trayRoom])
    const rcp = buildReflectedCeilingPlan(testPlan, fixtures, aircon)
    const svg = rcpSvg(testPlan, rcp, { palette })
    expect(svg).toContain(palette.wall)
    expect(svg).toContain(palette.symbol)
    expect(svg).toContain(palette.zone)
    expect(svg).toContain(palette.dim)
  })

  it('handles an empty plan without throwing', () => {
    const testPlan: FloorPlan = { ...plan([]), walls: [] }
    const rcp = buildReflectedCeilingPlan(testPlan, [], [])
    const svg = rcpSvg(testPlan, rcp, { palette })
    expect(svg).toContain('<svg')
    expect(svg).toContain('No ceiling fixtures or aircon points')
  })

  it('sizes the svg in mm when printMmPerM is set', () => {
    const testPlan = plan([trayRoom])
    const rcp = buildReflectedCeilingPlan(testPlan, fixtures, aircon)
    const svg = rcpSvg(testPlan, rcp, { palette, printMmPerM: 20 })
    expect(svg).toContain('mm;height:')
  })
})
