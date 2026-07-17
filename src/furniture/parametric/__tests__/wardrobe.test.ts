/**
 * Modular wardrobe (E4 Batch B, row 26) — structural connectivity of the
 * generated part model, checked directly with the render-agnostic
 * structural-soundness helper (`connectedComponents`) on the parts' AABBs.
 *
 * The parametric generator bakes to a user GLB, so it is NOT covered by the
 * primitive-sweeping `structuralSoundness.test.tsx` harness. Instead we assert
 * the same invariant (one connected component + floor contact) on the pure
 * box list `buildWardrobe` emits, across every front × fit-out × bay-count
 * combination. ε matches the harness (8 mm).
 */

import { describe, expect, it } from 'vitest'
import { type AABB, connectedComponents } from '../../primitives/structuralSoundness'
import { buildWardrobe, type ParametricModel } from '../buildParts'
import {
  clampSpec,
  defaultSpec,
  WARDROBE_FIT_OUTS,
  WARDROBE_FRONTS,
  type WardrobeFitOut,
  type WardrobeFront,
} from '../spec'

const EPS = 0.008 // 8 mm, matching structuralSoundness.test.tsx

/** ParametricPart boxes → world-space AABBs (already world-space here — the
 *  model is built in the primitive's own floor-anchored, centred frame). */
function toBoxes(model: ParametricModel): AABB[] {
  return model.parts.map((p) => {
    const [x, y, z] = p.position
    const [w, h, d] = p.size
    return {
      min: [x - w / 2, y - h / 2, z - d / 2],
      max: [x + w / 2, y + h / 2, z + d / 2],
    }
  })
}

function minY(model: ParametricModel): number {
  return Math.min(...model.parts.map((p) => p.position[1] - p.size[1] / 2))
}

describe('buildWardrobe — structural connectivity', () => {
  it('every front × single fit-out × bay-count is one connected component + floor-anchored', () => {
    for (const front of WARDROBE_FRONTS as readonly WardrobeFront[]) {
      for (const fit of WARDROBE_FIT_OUTS as readonly WardrobeFitOut[]) {
        for (const bays of [1, 2, 4]) {
          const spec = clampSpec({
            ...defaultSpec('wardrobe'),
            width: 2.4,
            height: 2.36,
            depth: 0.58,
            bays,
            wardrobeFront: front,
            wardrobeFitOuts: Array.from({ length: bays }, () => fit),
          })
          const model = buildWardrobe(spec)
          const comps = connectedComponents(toBoxes(model), EPS)
          expect(
            comps.length,
            `front=${front} fit=${fit} bays=${bays} → ${comps.length} components`,
          ).toBe(1)
          // Floor-anchored: the lowest part touches y=0.
          expect(minY(model)).toBeCloseTo(0, 6)
        }
      }
    }
  })

  it('a mixed per-bay fit-out layout stays one connected component', () => {
    const spec = clampSpec({
      ...defaultSpec('wardrobe'),
      width: 2.5,
      height: 2.36,
      depth: 0.58,
      bays: 5,
      wardrobeFront: 'open',
      wardrobeFitOuts: ['hang', 'double-hang', 'shelves', 'drawers', 'shoe'],
    })
    const model = buildWardrobe(spec)
    const comps = connectedComponents(toBoxes(model), EPS)
    expect(comps.length).toBe(1)
    expect(minY(model)).toBeCloseTo(0, 6)
  })

  it('the smallest wardrobe (single narrow bay) is still connected', () => {
    const spec = clampSpec({
      ...defaultSpec('wardrobe'),
      width: 0.5,
      height: 1.8,
      depth: 0.55,
      bays: 1,
      wardrobeFront: 'sliding',
    })
    const model = buildWardrobe(spec)
    expect(connectedComponents(toBoxes(model), EPS).length).toBe(1)
  })
})
