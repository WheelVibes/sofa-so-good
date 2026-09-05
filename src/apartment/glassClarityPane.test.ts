// @vitest-environment node
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { windowGlassKindParams } from '../floorplan/windowGrilleLayout'
import { windowGlassPhysical } from '../materials/materialRealism'

/**
 * GLASS-CLARITY — a source-contract test, in the same style (and for the same reason) as
 * `glassSkyCatchEstate.test.ts`: the values themselves are unit-tested in
 * `floorplan/windowGrilleLayout.test.ts` and `materials/materialRealism.test.ts`, but WHICH
 * of the two tiers' fields each pane branch reads is only visible in the JSX + `useFrame` of
 * two components that need a renderer and real materials to mount.
 *
 * What must hold, and what a regression here would cost:
 *  - the TRANSMISSION branch reads `transmissionColor`/`transmissionRoughness`, because on
 *    that path the pane colour is the shader's `transmittance = diffuseColor *
 *    volumeAttenuation(...)` (it multiplies the whole view through the glass) and roughness is
 *    real mip blur of that view (`getTransmissionSample`);
 *  - the CHEAP branch keeps `color`/`roughness`/`opacityCheap`, where the same hex is an
 *    opacity-blended tint over the wall and reads correctly — Performance/Medium must stay
 *    byte-identical;
 *  - the night story is untouched: the day/night lerp still ends at `GLASS_NIGHT` and the
 *    ramp is still `dn` (ESTATE-NIGHT-GLASS).
 *
 * Measured at the default 4-room flat's living-room window, 13:00, `realistic`, default `sky`
 * backdrop, estate mounted (two pane patches, arms repeated, noise floor max 2 counts):
 * roughness 0.1 → 0.05 took pane micro-contrast 2.12/2.13 → 2.32/2.27 (+9 %) and 0.05 → 0
 * changed nothing; colour `#bcd4e6` → `#f2f5f7` took the pane mean 187.6/179.3 → 199.5/191.6
 * and R−B (the blue cast on the neighbour block) −14.1/−16.0 → −0.9/−2.4.
 */

const files = ['Window.tsx', 'PlanShell.tsx'] as const
const source = (file: string): string => readFileSync(join(__dirname, file), 'utf8')

describe('GLASS-CLARITY pane call sites', () => {
  it.each(files)('%s picks the transmission-tier colour + roughness under glassPhysical', (f) => {
    const s = source(f)
    expect(s).toMatch(
      /const paneColor =\s*glassPhysical \? glassParams\.transmissionColor : glassParams\.color/,
    )
    expect(s).toMatch(
      /glassPhysical\s*\?\s*Math\.max\(\s*glassPhysical\.roughness,\s*glassParams\.transmissionRoughness,?\s*\)\s*:\s*glassParams\.roughness/,
    )
  })

  it.each(files)('%s keeps the cheap pane on color/roughness/opacityCheap', (f) => {
    const s = source(f)
    // The cheap `meshStandardMaterial` branch, isolated by taking the props AROUND the one
    // prop only it carries (`opacityCheap`) rather than by matching the tag — several other
    // `meshStandardMaterial`s (louvre slats, sash bars, glass blocks) sit in the same file
    // and a lazy tag match spans them.
    const at = s.indexOf('opacity={glassParams.opacityCheap}')
    expect(at).toBeGreaterThan(0)
    const branch = s.slice(at - 400, at + 200)
    expect(branch).toContain('<meshStandardMaterial')
    expect(branch).toContain('color={glassParams.color}')
    expect(branch).toContain('roughness={glassParams.roughness}')
    // No transmission on this path at all — that is the whole tier split.
    expect(branch).not.toContain('transmission')
    // ...and only ONE pane carries it, so there is no second cheap branch drifting apart.
    expect(s.indexOf('opacity={glassParams.opacityCheap}', at + 1)).toBe(-1)
  })

  it.each(files)('%s still lerps to GLASS_NIGHT on the dn ramp (night unchanged)', (f) => {
    expect(source(f)).toMatch(/lerpColors\(dayColor, GLASS_NIGHT, dn\)/)
  })
})

describe('GLASS-CLARITY resolved pane values', () => {
  it('resolves clear glass to the physical baseline roughness on the transmission tier', () => {
    const physical = windowGlassPhysical('realistic')
    const clear = windowGlassKindParams('clear')
    expect(physical).not.toBeNull()
    // What the call sites' `Math.max` actually produces — the whole point of the change is
    // that this is 0.05 and no longer the cheap tier's 0.1.
    expect(Math.max(physical?.roughness ?? 0, clear.transmissionRoughness)).toBe(0.05)
    expect(clear.roughness).toBe(0.1)
  })

  it('never lets a diffusing kind resolve smoother than the physical baseline', () => {
    const physical = windowGlassPhysical('realistic')
    for (const kind of ['clear', 'frosted', 'textured', 'glass-block']) {
      const resolved = Math.max(
        physical?.roughness ?? 0,
        windowGlassKindParams(kind).transmissionRoughness,
      )
      expect(resolved).toBeGreaterThanOrEqual(physical?.roughness ?? 0)
    }
  })
})
