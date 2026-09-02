import { describe, expect, it } from 'vitest'
import type { FloorPlan } from '../../floorplan/types'
import type { PlanLight } from '../../lighting2d/lightingPlan'
import type { RoomLuxEstimate } from '../../lighting2d/roomLux'
import { type LightingPalette, lightingPlanSvg, roomLuxTableHtml } from './lightingPlanSvg'

const palette: LightingPalette = { wall: '#333', ink: '#222', coverage: '#fb0' }

const plan = {
  id: 'p',
  name: 'P',
  ceilingHeight: 2.8,
  extent: [5, 4],
  walls: [{ id: 'w', start: [0, 0], end: [5, 0], thickness: 'internal' }],
  openings: [],
  rooms: [],
} as unknown as FloorPlan

const light: PlanLight = {
  id: 'l1',
  type: 'ceiling-light',
  label: 'Ceiling light',
  x: 2,
  z: 1.5,
  height: 2.05,
  intensity: 9,
  distance: 3,
  color: '#fff0d4',
}

describe('lightingPlanSvg', () => {
  it('draws wall context, a coverage circle and a fixture glyph at the bulb position', () => {
    const svg = lightingPlanSvg(plan, [light], { palette })
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('lighting plan, 1 fixtures')
    // viewBox spans the bounds (5×4) + 0.4 margins.
    expect(svg).toContain('viewBox="-0.400 -0.400 5.800 4.800"')
    // Wall line.
    expect(svg).toContain('x1="0.000" y1="0.000" x2="5.000" y2="0.000"')
    // Coverage circle at the light, radius = distance.
    expect(svg).toContain('cx="2.000" cy="1.500" r="3.000"')
    // Bulb dot in the fixture's warm colour.
    expect(svg).toContain('fill="#fff0d4"')
  })

  it('labels rooms (escaping user-entered names)', () => {
    const withRoom = {
      ...plan,
      rooms: [{ id: 'r', name: '<b>Kitchen</b>', origin: [0, 0], width: 3, depth: 3 }],
    } as unknown as FloorPlan
    const svg = lightingPlanSvg(withRoom, [light], { palette })
    expect(svg).toContain('&lt;b&gt;Kitchen&lt;/b&gt;')
    expect(svg).not.toContain('<b>Kitchen')
  })

  it('omits coverage circles when disabled', () => {
    const svg = lightingPlanSvg(plan, [light], { palette, coverage: false })
    expect(svg).not.toContain('r="3.000"')
    // The glyph is still drawn.
    expect(svg).toContain('fill="#fff0d4"')
  })

  it('returns a benign empty svg for a degenerate plan', () => {
    expect(lightingPlanSvg({ ...plan, extent: [0, 0], walls: [] }, [], { palette })).toContain(
      'empty lighting plan',
    )
  })
})

describe('roomLuxTableHtml', () => {
  const row: RoomLuxEstimate = {
    roomId: 'lv',
    roomName: '<Living>',
    kind: 'living',
    area: 20,
    lumens: 4000,
    lux: 123.4,
    borrowedLux: 0,
    recommended: { min: 100, max: 200 },
    status: 'ok',
  }

  it('renders rounded lux, the recommended band, the status and escapes names', () => {
    const html = roomLuxTableHtml([row], 'metric', { header: 'cat', num: 'num', table: 'sched' })
    expect(html).toContain('<table class="sched"')
    expect(html).toContain('&lt;Living&gt;')
    expect(html).not.toContain('<Living>')
    expect(html).toContain('123 lx')
    expect(html).toContain('100–200 lx')
    expect(html).toContain('OK')
    // Low rooms get the amber Low chip.
    expect(
      roomLuxTableHtml([{ ...row, lux: 12, status: 'low' }], 'metric', {
        header: 'cat',
        num: 'num',
      }),
    ).toContain('Low')
  })

  it('is empty for no rows', () => {
    expect(roomLuxTableHtml([], 'metric', { header: 'cat', num: 'num' })).toBe('')
  })
})

describe('roomLuxTableHtml — uniformity column (G4)', () => {
  const row = {
    roomId: 'r1',
    roomName: 'Kitchen',
    area: 8,
    lumens: 3000,
    lux: 350,
    borrowedLux: 0,
    recommended: { min: 300, max: 600 },
    status: 'ok' as const,
    kind: 'kitchen' as const,
  }

  it('keeps the previous 5-column table when no uniformity is supplied', () => {
    const html = roomLuxTableHtml([row], 'metric', { header: 'cat', num: 'num' })
    expect(html).not.toContain('U0 / min')
  })

  it('adds a U0 column when uniformity IS supplied', () => {
    const html = roomLuxTableHtml(
      [row],
      'metric',
      { header: 'cat', num: 'num' },
      new Map([['r1', { u0: 0.72, minU0: 0.6, pass: true }]]),
    )
    expect(html).toContain('U0 / min')
    expect(html).toContain('0.72 / 0.60')
  })

  it('colours a failing uniformity differently from a passing one', () => {
    const pass = roomLuxTableHtml(
      [row],
      'metric',
      { header: 'cat', num: 'num' },
      new Map([['r1', { u0: 0.72, minU0: 0.6, pass: true }]]),
    )
    const fail = roomLuxTableHtml(
      [row],
      'metric',
      { header: 'cat', num: 'num' },
      new Map([['r1', { u0: 0.31, minU0: 0.6, pass: false }]]),
    )
    expect(pass).not.toBe(fail)
    expect(fail).toContain('0.31 / 0.60')
  })

  it('renders an em dash for a room with no grid, not a blank or a zero', () => {
    const html = roomLuxTableHtml(
      [row],
      'metric',
      { header: 'cat', num: 'num' },
      new Map([['other', { u0: 0.5, minU0: 0.4, pass: true }]]),
    )
    expect(html).toContain('U0 / min')
    expect(html).toContain('—')
  })

  it('an average can pass while its uniformity fails — the whole point', () => {
    const html = roomLuxTableHtml(
      [row],
      'metric',
      { header: 'cat', num: 'num' },
      new Map([['r1', { u0: 0.2, minU0: 0.6, pass: false }]]),
    )
    // Status still reads ok (350 lx is inside 300–600) while U0 is reported bad.
    expect(html).toContain('0.20 / 0.60')
  })
})
