import { describe, expect, it } from 'vitest'
// @ts-expect-error — dev probes are plain .mjs with no type declarations (see probeImports.test.ts).
import { ARMS, armTotal } from './fill-chroma-ab.mjs'

/**
 * FILL-CHROMA-AB — the arm table.
 *
 * The whole experiment rests on one property: every arm carries the SAME total fill, so a
 * difference between them is redistribution and can never be a gain. If that slipped, the probe
 * would report a brightness change as a chroma finding — and `docs/skills/blender.md` records that
 * an absolute level difference is exactly what this arc cannot interpret, because the app's sun is
 * artistic rather than physical.
 */
describe('ARMS', () => {
  it('holds the total fill CONSTANT across every arm', () => {
    const totals = ARMS.map(armTotal)
    for (const t of totals) expect(t).toBeCloseTo(totals[0], 6)
  })

  it('starts from the shipped 1.1 / 0.35 split', () => {
    // Reading the constants out of Lighting.tsx is what makes arm A a real control rather than
    // another arm; the probe also asserts the live ratio (3.143) before it changes anything.
    const shipped = ARMS.find((a: { name: string }) => a.name === 'A-shipped')
    expect(shipped.hemi).toBeCloseTo(1.1, 6)
    expect(shipped.amb).toBeCloseTo(0.35, 6)
  })

  it('sweeps BOTH directions, so a trend cannot be an endpoint artefact', () => {
    const shipped = ARMS.find((a: { name: string }) => a.name === 'A-shipped')
    expect(ARMS.some((a: { amb: number }) => a.amb < shipped.amb)).toBe(true)
    expect(ARMS.some((a: { amb: number }) => a.amb > shipped.amb)).toBe(true)
  })

  it('includes a fully-chromatic endpoint (ambient driven to zero)', () => {
    expect(ARMS.some((a: { amb: number }) => a.amb === 0)).toBe(true)
  })
})
