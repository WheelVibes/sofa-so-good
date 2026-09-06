// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * ESTATE-SKYCATCH-VEIL — a source-contract test, not a behavioural one.
 *
 * `glassSkyCatchIntensity`'s own retirement logic is unit-tested in
 * `materials/materialRealism.test.ts` against a plain boolean, so there is nothing left to
 * assert about the FUNCTION. What is not covered anywhere else is the CALL SITE: that both
 * window paths actually pass `estateVisibleNow()` alongside `backdropVisibleNow()`, so the
 * sky-catch also retires when the estate (not a photo backdrop) is the real view behind the
 * pane — e.g. `backdrop: 'none'` still mounts `<Estate>` (`Estate.tsx`'s gate excludes only a
 * chosen photo preset), and there `backdropVisibleNow()` alone reads false while the pane still
 * has a lit neighbour block right behind it. Neither call site is reachable from a renderer-free
 * unit test (`useFrame` + real materials), so this reads the source instead, the same pattern
 * `scene/visibilityLightmap.test.ts` uses for a shader string it cannot mount either.
 *
 * Measured on the default 4-room flat's living-room window, 13:00, `realistic`, `backdrop: 'none'`
 * (the config that reaches this gap — the default `sky` backdrop already reads
 * `backdropVisibleNow() === true` via `proceduralSky`, so it never needed the estate signal):
 * pane mean 233.5 → 183.6, sd 25.4 → 28.2, spread p95−p05 64 → 96, %>240 61.2% → 0.3%.
 */

const APARTMENT_DIR = join(__dirname)

function readSource(file: string): string {
  return readFileSync(join(APARTMENT_DIR, file), 'utf8')
}

/** The `glassSkyCatchIntensity(...)` call, arguments included, as one string — tolerant of the
 *  call being wrapped across lines and of the second argument being a local BINDING rather than
 *  the expression itself.
 *
 *  GLASS-NIGHT-VEIL made that binding necessary: the pane's transmission now needs the same
 *  "is a real view behind this pane?" answer, and computing `backdropVisibleNow() ||
 *  estateVisibleNow()` twice per frame per pane would be both wasteful and a place for the two
 *  reads to drift apart. So an identifier argument is resolved back to its `const <name> = …`
 *  initialiser and THAT is what the contract is asserted against — which keeps the test about the
 *  signals reaching the call rather than about how the line happens to be written. */
function skyCatchCallSite(source: string): string {
  const m = source.match(/glassSkyCatchIntensity\(\s*1 - d,[\s\S]*?\n?\s*\)/)
  if (!m) throw new Error('glassSkyCatchIntensity(1 - d, …) call site not found')
  const call = m[0]
  const alias = call.match(/glassSkyCatchIntensity\(\s*1 - d,\s*([A-Za-z_$][\w$]*)\s*\)/)
  if (!alias) return call
  const decl = source.match(new RegExp(`const ${alias[1]} =([\\s\\S]*?)\n`))
  if (!decl) throw new Error(`second argument \`${alias[1]}\` has no const initialiser`)
  return `${call}\n${decl[0]}`
}

describe('ESTATE-SKYCATCH-VEIL call sites', () => {
  it('Window.tsx retires the sky-catch on backdrop OR estate visibility', () => {
    const call = skyCatchCallSite(readSource('Window.tsx'))
    expect(call).toContain('backdropVisibleNow()')
    expect(call).toContain('estateVisibleNow()')
    expect(call).toMatch(/backdropVisibleNow\(\)\s*\|\|\s*estateVisibleNow\(\)/)
  })

  it('PlanShell.tsx retires the sky-catch on backdrop OR estate visibility', () => {
    const call = skyCatchCallSite(readSource('PlanShell.tsx'))
    expect(call).toContain('backdropVisibleNow()')
    expect(call).toContain('estateVisibleNow()')
    expect(call).toMatch(/backdropVisibleNow\(\)\s*\|\|\s*estateVisibleNow\(\)/)
  })

  it('both files import estateVisibleNow from the estate signal module', () => {
    for (const file of ['Window.tsx', 'PlanShell.tsx']) {
      const source = readSource(file)
      expect(source).toMatch(/import\s*\{\s*estateVisibleNow\s*\}\s*from\s*['"].*estateSignal['"]/)
    }
  })
})
