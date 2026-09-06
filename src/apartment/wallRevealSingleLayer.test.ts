// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * WALL-REVEAL-SINGLE-LAYER — a source-contract test over the THREE shells that fade walls.
 *
 * The ordering rule itself is proven in `walls/wallRevealMath.test.ts` (`revealRenderOrder`:
 * strictly negative, rising with depth, 0 when opaque). What that cannot cover is the CALL
 * SITES — `WallSegment.tsx` (default flat), `walls/useWallReveal.ts` (room editor, used by both
 * `RoomShell` and `PlanRoomShell`) and `PlanShell.tsx` (custom plans, wall + trim) — none of
 * which is mountable without the R3F/renderer stack. The defect was found in all three (the
 * orbit corner, the kitchen/yard walls, the editor's cut-away walls), so all three must set
 * `renderOrder` inside their fade loop, and all three must gate it on the flag so the off arm is
 * byte-identical to the pre-fix render.
 */

const APARTMENT_DIR = join(__dirname)

function readSource(file: string): string {
  return readFileSync(join(APARTMENT_DIR, file), 'utf8')
}

const SHELLS = [
  ['WallSegment (default flat)', 'walls/WallSegment.tsx'],
  ['useWallReveal (room editor)', 'walls/useWallReveal.ts'],
  ['PlanShell (custom plans)', 'PlanShell.tsx'],
] as const

describe('WALL-REVEAL-SINGLE-LAYER call sites', () => {
  for (const [label, file] of SHELLS) {
    it(`${label} derives its renderOrder from revealRenderOrder`, () => {
      const source = readSource(file)
      expect(source).toMatch(/from '[./]*(walls\/)?wallRevealMath'/)
      expect(source).toMatch(/revealRenderOrder\(/)
      // The value is ASSIGNED to a renderOrder, not merely computed.
      expect(source).toMatch(/renderOrder = /)
    })

    it(`${label} gates the ordering on the wallRevealSingleLayer flag`, () => {
      const source = readSource(file)
      expect(source).toContain("useFeature('wallRevealSingleLayer')")
      // Flag off (or wall opaque) ⇒ three's default order, i.e. the pre-fix render.
      expect(source).toContain('REVEAL_ORDER_OPAQUE')
    })

    it(`${label} orders by VIEW-SPACE DEPTH (camera forward), not by raw distance`, () => {
      const source = readSource(file)
      // `(mid − cameraPosition) · forward` — the same quantity three's own depth sort uses, so
      // the ordering matches what the depth buffer will resolve.
      expect(source).toMatch(/getWorldDirection\(FWD\)/)
      expect(source).toMatch(/\* FWD\.x \+ \(/)
    })
  }

  it('PlanShell orders the wall BODY, its finish FACES and the trim alike', () => {
    const source = readSource('PlanShell.tsx')
    // The faces are children of the body mesh and carry their own materials, so they need the
    // wall-level order too — otherwise the 1 mm-proud face composites over its own body.
    expect(source).toContain('for (const child of mesh.children) child.renderOrder = order')
    // Two fade loops set it: FadeWall and useTrimFade.
    expect(source.match(/revealRenderOrder\(/g)?.length).toBe(2)
  })

  it('WallSegment applies ONE wall-level order to every mesh in the wall group', () => {
    const source = readSource('walls/WallSegment.tsx')
    // Inside the group traverse, beside the visibility/overlay cull — body, face planes, trim
    // and the ORBIT-CLEAN-CUT section cap all share it and resolve among themselves by depth.
    expect(source).toMatch(
      /o\.visible = visible && !\(transparent && isWallOverlay\(o\.userData\)\)\s*\n\s*o\.renderOrder = order/,
    )
  })
})
