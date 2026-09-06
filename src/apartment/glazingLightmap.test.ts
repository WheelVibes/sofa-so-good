// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GLAZING-LIGHTMAP — a source-contract test, not a behavioural one.
 *
 * `markGlazing`/`isGlazing` are unit-tested indirectly through
 * `scene/applyVisibilityLightmaps.test.ts` (the exclusion behaviour), which is where the
 * mechanism is proven. What is not covered there is the CALL SITE: that the two pane meshes this
 * bug was actually found on — the window glass in `Window.tsx` and the plan-editor window glass
 * in `PlanShell.tsx` — are the ones carrying the mark, and neither of those component files is
 * reachable from a renderer-free unit test (real R3F meshes, `useFrame`, `useThree`), so this
 * reads the source instead, the same pattern `apartment/glassSkyCatchEstate.test.ts` uses for a
 * call site it cannot mount either.
 *
 * Only the PANE is marked — never the frame, mullions, grilles or sill — because those are
 * ordinary opaque geometry with real diffuse irradiance to bake; only the transmissive glass
 * itself has none.
 */

const APARTMENT_DIR = join(__dirname)

function readSource(file: string): string {
  return readFileSync(join(APARTMENT_DIR, file), 'utf8')
}

describe('GLAZING-LIGHTMAP call sites', () => {
  it('Window.tsx marks its pane mesh with markGlazing()', () => {
    const source = readSource('Window.tsx')
    // The pane mesh: the boxGeometry sized to the glass cavity (frame thickness subtracted),
    // holding the glassRef material — distinguishes it from the frame/mullion/grille meshes
    // around it, none of which use this geometry shape.
    expect(source).toMatch(
      /<mesh userData=\{markGlazing\(\)\}>\s*\n\s*<boxGeometry args=\{\[w - FRAME_T, h - FRAME_T, GLASS_D\]\}/,
    )
  })

  it('PlanShell.tsx marks its pane mesh with markGlazing()', () => {
    const source = readSource('PlanShell.tsx')
    // The pane mesh: `boxGeometry [0.03, win.height, win.width]`, the plan-editor's thin glass
    // slab, distinct from the frame/mullion/grille instances around it.
    expect(source).toMatch(
      /<mesh ref=\{ref\} userData=\{markGlazing\(\)\}>\s*\n\s*<boxGeometry args=\{\[0\.03, win\.height, win\.width\]\}/,
    )
  })

  it('both files import markGlazing from the wall-reveal module', () => {
    for (const file of ['Window.tsx', 'PlanShell.tsx']) {
      const source = readSource(file)
      expect(source).toMatch(/import\s*\{[^}]*\bmarkGlazing\b[^}]*\}\s*from\s*['"].*wallReveal['"]/)
    }
  })
})
