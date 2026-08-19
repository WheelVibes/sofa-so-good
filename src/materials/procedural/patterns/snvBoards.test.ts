import { describe, expect, it } from 'vitest'
import { hexToRgb } from '../noise'
import { porcelainFields, porcelainStoneFields, stoneTileFields } from './tile'
import { vinylFields, woodFields } from './wood'

/**
 * SNV-BOARDS — the sample-board fidelity painters (v0.26.1.0), matched against
 * the user's photos of the actual Serangoon North Vista exhibition boards:
 *  - `vinyl`          = grey-washed rift-oak PRINT (fine straight striations,
 *                       staggered end joints, matte) — no longer the natural
 *                       wood painter's wavy cathedral bands.
 *  - `stoneTile`      = honed warm-greige stone-print porcelain, hairline
 *                       light rectified joints (kitchen 600 / HS-SY 300).
 *  - `porcelainStone` = mottled honed grey-green porcelain, running bond.
 *  - `porcelain`      = rectified glazed WALL tile — near-flat (no bevel
 *                       pillow), gentle joint relief, glossy face.
 * Pure painters (no DOM/three) → per-texel Fields inspected directly.
 */

const S = 64
const oak = hexToRgb('#d6c3ac')
const beige = hexToRgb('#cfc0a8')
const sage = hexToRgb('#a2a79a')
const cream = hexToRgb('#ede8dc')

function meanRough(rough: Float32Array): number {
  let s = 0
  for (const r of rough) s += r
  return s / rough.length
}

function heightRange(height: Float32Array): number {
  let lo = Infinity
  let hi = -Infinity
  for (const h of height) {
    if (h < lo) lo = h
    if (h > hi) hi = h
  }
  return hi - lo
}

function lumaAt(albedo: Uint8ClampedArray, i: number): number {
  return 0.2126 * albedo[i * 4] + 0.7152 * albedo[i * 4 + 1] + 0.0722 * albedo[i * 4 + 2]
}

function albedoLumaVariance(albedo: Uint8ClampedArray): number {
  const n = albedo.length / 4
  let mean = 0
  for (let i = 0; i < n; i++) mean += lumaAt(albedo, i)
  mean /= n
  let v = 0
  for (let i = 0; i < n; i++) v += (lumaAt(albedo, i) - mean) ** 2
  return v / n
}

/** Mean |Δluma| between horizontally vs vertically adjacent texels — a
 *  directional-grain signature (striations along x → much larger vertical
 *  gradient than horizontal). */
function directionalGradients(albedo: Uint8ClampedArray, size: number) {
  let dx = 0
  let dy = 0
  let n = 0
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const i = y * size + x
      const l = lumaAt(albedo, i)
      dx += Math.abs(lumaAt(albedo, i + 1) - l)
      dy += Math.abs(lumaAt(albedo, i + size) - l)
      n++
    }
  }
  return { dx: dx / n, dy: dy / n }
}

describe('vinyl painter (SNV rift-oak print)', () => {
  it('paints full-size buffers and is deterministic', () => {
    const a = vinylFields(oak, 7, S)
    const b = vinylFields(oak, 7, S)
    expect(a.albedo.length).toBe(S * S * 4)
    expect(Array.from(a.albedo)).toEqual(Array.from(b.albedo))
  })

  it('striations run ALONG the strip (cross-strip gradient dominates)', () => {
    const { dx, dy } = directionalGradients(vinylFields(oak, 7, 128).albedo, 128)
    // Fine grain lines are horizontal streaks → stepping vertically (across
    // them) changes luma much more than stepping along them.
    expect(dy).toBeGreaterThan(dx * 1.5)
  })

  it('is a uniform factory print — narrower tonal spread than natural wood boards', () => {
    const vinyl = albedoLumaVariance(vinylFields(oak, 7, 128).albedo)
    const wood = albedoLumaVariance(woodFields(oak, 7, 128).albedo)
    expect(vinyl).toBeLessThan(wood)
  })

  it('reads matte (laminate, not varnished timber)', () => {
    expect(meanRough(vinylFields(oak, 7, S).rough)).toBeGreaterThan(0.55)
  })

  it('has a shallow printed relief, not carved plank grain', () => {
    const vinyl = vinylFields(oak, 7, S)
    const wood = woodFields(oak, 7, S)
    expect(vinyl.normalStrength).toBeLessThan(wood.normalStrength)
  })
})

describe('stoneTile painter (SNV kitchen/HS/SY honed porcelain)', () => {
  it('paints full-size buffers and is deterministic', () => {
    const a = stoneTileFields(beige, 5, S)
    const b = stoneTileFields(beige, 5, S)
    expect(Array.from(a.albedo)).toEqual(Array.from(b.albedo))
    expect(Array.from(a.rough)).toEqual(Array.from(b.rough))
  })

  it('joints are LIGHT cement near the face tone (rectified), never the dark tile grout', () => {
    const f = stoneTileFields(beige, 5, S)
    // The joint runs along the tile boundary (x = S/2 column). Its luma must
    // stay within ~20% of the face mean — the old `tile` painter's 0.62
    // darkening is exactly what the boards do NOT show.
    const jointLuma = lumaAt(f.albedo, Math.floor(S / 4) * S + S / 2)
    const faceLuma = lumaAt(f.albedo, Math.floor(S / 4) * S + S / 8)
    expect(jointLuma).toBeGreaterThan(faceLuma * 0.8)
  })

  it('reads honed satin — rougher than a glossy glaze, smoother than raw cement', () => {
    const m = meanRough(stoneTileFields(beige, 5, S).rough)
    expect(m).toBeGreaterThan(0.35)
    expect(m).toBeLessThan(0.65)
  })

  it('has soft tonal variation (striations + clouds), not a flat print', () => {
    expect(albedoLumaVariance(stoneTileFields(beige, 5, 128).albedo)).toBeGreaterThan(4)
  })
})

describe('porcelainStone painter (SNV bathroom floor mottle)', () => {
  it('paints full-size buffers and is deterministic', () => {
    const a = porcelainStoneFields(sage, 9, S)
    const b = porcelainStoneFields(sage, 9, S)
    expect(Array.from(a.albedo)).toEqual(Array.from(b.albedo))
  })

  it('is strongly mottled — broader tonal clouds on the tile FACE than the wall porcelain', () => {
    // Compare a joint-free tile-interior window (first bond tile) so the
    // grout-vs-face contrast doesn't pollute the variance.
    const size = 128
    const faceVariance = (albedo: Uint8ClampedArray): number => {
      const lums: number[] = []
      for (let y = 6; y < size / 4 - 6; y++) {
        for (let x = 6; x < size / 2 - 6; x++) lums.push(lumaAt(albedo, y * size + x))
      }
      const mean = lums.reduce((a, b) => a + b, 0) / lums.length
      return lums.reduce((a, b) => a + (b - mean) ** 2, 0) / lums.length
    }
    const mottled = faceVariance(porcelainStoneFields(sage, 9, size).albedo)
    const plain = faceVariance(porcelainFields(sage, 9, size).albedo)
    expect(mottled).toBeGreaterThan(plain * 1.5)
  })

  it('reads honed (satin), not the glossy wall glaze', () => {
    const stone = meanRough(porcelainStoneFields(sage, 9, S).rough)
    const glazed = meanRough(porcelainFields(sage, 9, S).rough)
    expect(stone).toBeGreaterThan(glazed)
  })
})

describe('porcelain wall painter (SNV rectified glazed tile)', () => {
  it('is near-flat: total height relief far below the bevelled metro subway tile', () => {
    const wall = heightRange(porcelainFields(cream, 3, S).height)
    // The metro tile's proud pillow spans ~0.9 of the height range; the
    // rectified SNV wall tile must stay a gentle seam (< half of that).
    expect(wall).toBeLessThan(0.45)
  })

  it('keeps the glossy glaze face (roughness well below the honed floors)', () => {
    expect(meanRough(porcelainFields(cream, 3, S).rough)).toBeLessThan(0.4)
  })
})
