import { describe, expect, it } from 'vitest'
import { addPart, addPartGroup, createEmptySpec, partGroupForPart, updatePart } from './editSpec'
import {
  addPiping,
  buildPipingPart,
  canPipe,
  PIPING_DEFAULTS,
  roundedRectPathPoints,
} from './piping'

function boxSpec(size: [number, number, number] = [1.2, 0.15, 0.6]) {
  let s = addPart(createEmptySpec(), 'box')
  const id = s.parts[0].id
  s = updatePart(s, id, { size, position: [0, 0.2, 0], color: '#8a6f4a' })
  return { spec: s, partId: id }
}

describe('roundedRectPathPoints', () => {
  it('returns a closed loop of points within the rectangle bounds', () => {
    const pts = roundedRectPathPoints(1.0, 0.6, 0.08)
    expect(pts.length).toBeGreaterThan(8)
    for (const [x, y, z] of pts) {
      expect(y).toBe(0)
      expect(Math.abs(x)).toBeLessThanOrEqual(0.5 + 1e-9)
      expect(Math.abs(z)).toBeLessThanOrEqual(0.3 + 1e-9)
    }
  })

  it('reaches near each rectangle corner (traces the full perimeter)', () => {
    const pts = roundedRectPathPoints(1.0, 0.6, 0.05)
    const near = (sx: number, sz: number) =>
      pts.some((p) => Math.abs(p[0] - sx * 0.5) < 0.08 && Math.abs(p[2] - sz * 0.3) < 0.08)
    expect(near(1, 1)).toBe(true)
    expect(near(-1, 1)).toBe(true)
    expect(near(-1, -1)).toBe(true)
    expect(near(1, -1)).toBe(true)
  })

  it('clamps the radius to half the smaller side', () => {
    const pts = roundedRectPathPoints(0.4, 0.4, 10)
    for (const [x, , z] of pts) {
      expect(Math.abs(x)).toBeLessThanOrEqual(0.2 + 1e-9)
      expect(Math.abs(z)).toBeLessThanOrEqual(0.2 + 1e-9)
    }
  })

  it('handles a square (zero radius) corner without NaN', () => {
    const pts = roundedRectPathPoints(0.5, 0.5, 0)
    expect(pts).toHaveLength(4)
    for (const [x, , z] of pts) {
      expect(Number.isFinite(x)).toBe(true)
      expect(Number.isFinite(z)).toBe(true)
    }
  })
})

describe('canPipe', () => {
  it('accepts box + extrude, rejects everything else', () => {
    expect(canPipe({ kind: 'box' } as never)).toBe(true)
    expect(canPipe({ kind: 'extrude' } as never)).toBe(true)
    expect(canPipe({ kind: 'sphere' } as never)).toBe(false)
    expect(canPipe(null)).toBe(false)
  })
})

describe('buildPipingPart', () => {
  it('is a sweep with an explicit closed path at the host top face, darker colour', () => {
    const { spec, partId } = boxSpec([1.2, 0.15, 0.6])
    const host = spec.parts.find((p) => p.id === partId)!
    const welt = buildPipingPart(host, PIPING_DEFAULTS)
    expect(welt.kind).toBe('sweep')
    expect(welt.sweepProfile).toBe('circle')
    expect(welt.sweepPoints?.length).toBeGreaterThan(8)
    // Path sits on the host top face (part-local +h/2 = 0.075).
    for (const p of welt.sweepPoints!) expect(p[1]).toBeCloseTo(0.075, 6)
    // Inset keeps the welt inside the host footprint (host half-width 0.6).
    for (const p of welt.sweepPoints!) expect(Math.abs(p[0])).toBeLessThan(0.6)
    // Tube thickness is the size[1] the sweep builder reads.
    expect(welt.size[1]).toBe(PIPING_DEFAULTS.tubeDiameter)
    // Darkened from the host colour (not identical).
    expect(welt.color).not.toBe(host.color)
    // Shares the host origin so grouping keeps them registered.
    expect(welt.position).toEqual(host.position)
  })

  it('honours the edge inset', () => {
    const { spec, partId } = boxSpec([1.0, 0.15, 1.0])
    const host = spec.parts.find((p) => p.id === partId)!
    const tight = buildPipingPart(host, { tubeDiameter: 0.012, edgeInset: 0.1 })
    const loose = buildPipingPart(host, { tubeDiameter: 0.012, edgeInset: 0 })
    const maxX = (pts: [number, number, number][]) => Math.max(...pts.map((p) => Math.abs(p[0])))
    expect(maxX(tight.sweepPoints!)).toBeLessThan(maxX(loose.sweepPoints!))
  })
})

describe('addPiping', () => {
  it('appends the welt + groups it with the host', () => {
    const { spec, partId } = boxSpec()
    const { spec: next, groupId, pipingId } = addPiping(spec, partId, PIPING_DEFAULTS)
    expect(groupId).toBeTruthy()
    expect(pipingId).toBeTruthy()
    expect(next.parts).toHaveLength(2)
    const group = partGroupForPart(next, partId)
    expect(group?.id).toBe(groupId)
    expect(group?.partIds).toContain(pipingId)
    expect(group?.partIds).toContain(partId)
  })

  it('joins the host existing transform group when it has one', () => {
    const base = boxSpec()
    const partId = base.partId
    // Put the host + a second part into a group first.
    const spec = addPart(base.spec, 'box')
    const secondId = spec.parts[1].id
    const grouped = addPartGroup(spec, [partId, secondId])
    const existingGroupId = grouped.groupId
    const { spec: next, groupId } = addPiping(grouped.spec, partId, PIPING_DEFAULTS)
    expect(groupId).toBe(existingGroupId)
    const group = partGroupForPart(next, partId)
    expect(group?.partIds).toHaveLength(3)
  })

  it('rejects a non-pipeable host', () => {
    const s = addPart(createEmptySpec(), 'sphere')
    const id = s.parts[0].id
    const { groupId, pipingId } = addPiping(s, id, PIPING_DEFAULTS)
    expect(groupId).toBeNull()
    expect(pipingId).toBeNull()
  })
})
