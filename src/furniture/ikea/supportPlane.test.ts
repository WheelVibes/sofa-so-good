import { describe, expect, it } from 'vitest'
import { detectSupportPlaneY, type HorizontalBand } from './supportPlane'

// Synthetic bed-frame-like distribution: a big horizontal surface (slat plane)
// at Y=0.25 inside the footprint, a tall headboard top at Y=1.0 (small area),
// and a footboard rail band at Y=0.36 (medium). Bands carry summed horizontal
// triangle area inside the interior footprint, per 2cm Y bin.
const bedBands: HorizontalBand[] = [
  { y: 0.0, area: 0.02 },
  { y: 0.25, area: 1.6 },
  { y: 0.36, area: 0.3 },
  { y: 1.0, area: 0.25 },
]

describe('detectSupportPlaneY', () => {
  it('picks the dominant interior horizontal surface below the head/footboard region', () => {
    expect(detectSupportPlaneY(bedBands, 1.0)).toBeCloseTo(0.25, 2)
  })

  it('ignores the tall headboard top even though it is horizontal', () => {
    expect(detectSupportPlaneY(bedBands, 1.0)).not.toBeCloseTo(1.0, 1)
  })

  it('returns null when there is no horizontal area at all', () => {
    expect(detectSupportPlaneY([], 1.0)).toBeNull()
    expect(detectSupportPlaneY([{ y: 0.1, area: 0 }], 1.0)).toBeNull()
  })

  it('prefers the highest qualifying surface when two comparable bands exist', () => {
    const bands: HorizontalBand[] = [
      { y: 0.1, area: 1.2 },
      { y: 0.25, area: 1.5 },
    ]
    expect(detectSupportPlaneY(bands, 1.0)).toBeCloseTo(0.25, 2)
  })

  it('uses a RELATIVE threshold so a sparse (low-LOD) mesh still resolves', () => {
    // Real decimated MALM bands: tiny absolute areas, but 0.22/0.24 are the
    // dominant interior surface. An absolute m^2 floor would wrongly reject them.
    const lod: HorizontalBand[] = [
      { y: 0.22, area: 0.036 },
      { y: 0.24, area: 0.027 },
    ]
    expect(detectSupportPlaneY(lod, 1.0)).toBeCloseTo(0.24, 2)
  })

  it('rejects a negligible band that is a tiny fraction of the dominant surface', () => {
    // a stray speck above the real plane must not win
    const bands: HorizontalBand[] = [
      { y: 0.25, area: 1.5 },
      { y: 0.5, area: 0.001 },
    ]
    expect(detectSupportPlaneY(bands, 1.0)).toBeCloseTo(0.25, 2)
  })
})
