import { describe, expect, it } from 'vitest'
import { SKY_REBUILD, type SkyState, shouldRebuildSky } from './skyRebuild'

const base: SkyState = {
  sunDir: [0, 1, 0],
  turbidity: 4,
  orientationDeg: 0,
}

describe('shouldRebuildSky', () => {
  it('always rebuilds when there is no previous bake', () => {
    expect(shouldRebuildSky(null, base)).toBe(true)
  })

  it('does not rebuild for an identical state', () => {
    expect(shouldRebuildSky(base, { ...base })).toBe(false)
  })

  it('does not rebuild for sub-threshold changes', () => {
    const tiny: SkyState = {
      sunDir: [Math.sin(0.01), Math.cos(0.01), 0], // ~0.6° move
      turbidity: base.turbidity + SKY_REBUILD.turbidity / 2,
      orientationDeg: base.orientationDeg + SKY_REBUILD.orientationDeg / 2,
    }
    expect(shouldRebuildSky(base, tiny)).toBe(false)
  })

  it('rebuilds when the sun direction moves past the angular threshold', () => {
    const a = SKY_REBUILD.sunAngleRad * 2
    const moved: SkyState = { ...base, sunDir: [Math.sin(a), Math.cos(a), 0] }
    expect(shouldRebuildSky(base, moved)).toBe(true)
  })

  it('rebuilds when turbidity changes past the threshold', () => {
    expect(
      shouldRebuildSky(base, { ...base, turbidity: base.turbidity + SKY_REBUILD.turbidity }),
    ).toBe(true)
  })

  it('rebuilds when orientation changes past the threshold', () => {
    expect(
      shouldRebuildSky(base, {
        ...base,
        orientationDeg: base.orientationDeg + SKY_REBUILD.orientationDeg,
      }),
    ).toBe(true)
  })

  it('honours custom thresholds', () => {
    const moved: SkyState = { ...base, turbidity: base.turbidity + 0.1 }
    expect(shouldRebuildSky(base, moved, { ...SKY_REBUILD, turbidity: 0.05 })).toBe(true)
    expect(shouldRebuildSky(base, moved, { ...SKY_REBUILD, turbidity: 0.5 })).toBe(false)
  })
})
