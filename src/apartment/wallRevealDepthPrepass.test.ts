// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * WALL-REVEAL-DEPTH-PREPASS — a source-contract test over the THREE shells that fade walls,
 * mirroring `wallRevealSingleLayer.test.ts`. The mechanism itself is unit-tested in
 * `walls/wallRevealPrepass.test.ts`; what that cannot cover is whether each fade loop actually
 * runs it, since none of these shells is mountable without the R3F/renderer stack. The corner
 * band appears in all three (the orbit corner, the kitchen/yard walls, the editor's cut-away
 * pair), so all three must (a) build the depth twin, (b) put the colour draw on the pre-pass
 * depth state, and (c) gate both on the flag so the off arm is byte-identical to before.
 */
const SHELLS = [
  ['WallSegment (default flat)', 'walls/WallSegment.tsx'],
  ['useWallReveal (room editor)', 'walls/useWallReveal.ts'],
  ['PlanShell (custom plans)', 'PlanShell.tsx'],
] as const

function readSource(file: string): string {
  return readFileSync(join(__dirname, file), 'utf8')
}

describe('WALL-REVEAL-DEPTH-PREPASS call sites', () => {
  for (const [label, file] of SHELLS) {
    it(`${label} builds the depth twin and puts the colour draw on EqualDepth`, () => {
      const source = readSource(file)
      expect(source).toMatch(/from '[./]*(walls\/)?wallRevealPrepass'/)
      expect(source).toMatch(/syncRevealPrepass\(/)
      expect(source).toMatch(/applyRevealColourDepth\(/)
      // The retired unconditional `depthWrite = true` on a FADED wall material is gone: it is
      // the pre-pass that writes depth now, and a colour draw that also wrote it would
      // re-admit the second layer this fix removes.
      expect(source).not.toMatch(/^\s*(mat|m|cm)\.depthWrite = true$/m)
    })

    it(`${label} gates the pre-pass on the wallRevealDepthPrepass flag`, () => {
      const source = readSource(file)
      expect(source).toContain("useFeature('wallRevealDepthPrepass')")
    })

    it(`${label} never folds a depth twin back into the fade traverse`, () => {
      // Twins carry a MeshBasicMaterial (no `emissive`), keep REVEAL_PREPASS_ORDER rather than
      // the wall's colour order, and must not be cloned/tinted/re-twinned.
      expect(readSource(file)).toMatch(/isRevealPrepass\(/)
    })

    it(`${label} disposes its twins on unmount`, () => {
      expect(readSource(file)).toMatch(/disposeRevealPrepass\(/)
    })
  }

  it('PlanWallFace keeps the twin out of the finish-face fade sync', () => {
    // `syncFaceFade` walks the wall box's children and would otherwise flip the twin's
    // `transparent` flag, moving it into the OPAQUE pass — where it would occlude the very
    // interior the reveal exists to show.
    expect(readSource('walls/PlanWallFace.tsx')).toMatch(/isRevealPrepass\(child\)/)
  })
})
