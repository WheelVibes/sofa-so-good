import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Source-level guards on the post-processing stack (same spirit as
 * `moduleCasingGuard.test.ts`): two invariants that are invisible to `tsc` and
 * to every render test, cost a real user-visible regression when broken, and are
 * each a one-token edit away from breaking.
 *
 * Both were live bugs, diagnosed on a Mac mini M4 with
 * `scripts/dev-probes/blank-cause.mjs` + `tier-look.mjs`:
 *
 *  1. **TONE-POST** — the stack had no `ToneMapping` effect. three applies
 *     `renderer.toneMapping` only when rendering to the default framebuffer, so
 *     under the composer High/Maximum ran with NO view transform: 31.8% of the
 *     frame clipped to flat white vs 3.4% on Performance/Medium, and the whole
 *     `grade()`/exposure/`toneExposureBias` model was dead code on exactly the
 *     tiers meant to look best.
 *  2. **BLOOM-MIP-FLASH** — `<Bloom mipmapBlur>` intermittently blanked whole
 *     frames on ANGLE/Metal during an orbit drag (4–7 per 78 frames at Maximum,
 *     0 with it off), which is the reported "white flashes when rotating the
 *     view in orbit mode" on the higher tiers.
 *
 * Asserted against the source text rather than a mounted tree because the thing
 * that matters is the prop as written — `@react-three/postprocessing` types every
 * effect's props as `[x: string]: any`, so a typo or a removed prop typechecks
 * clean and only shows up as an artifact on a real GPU.
 */

const SRC = readFileSync(join(__dirname, 'EffectsImpl.tsx'), 'utf8')
/** Source with `//` comments stripped — the prose below deliberately names the
 *  props these guards forbid, so a raw text match would flag its own docs. */
const CODE = SRC.replace(/^\s*\/\/.*$/gm, '')

describe('post-processing stack guards', () => {
  it('mounts a ToneMapping effect (TONE-POST)', () => {
    expect(SRC).toContain('<ToneMapping')
    expect(SRC).toContain('TONE_MAPPING_POST[toneMode]')
  })

  it('drives the tone mapper from the same resolver as Lighting', () => {
    // A hardcoded operator here would silently diverge from the direct-to-canvas
    // tiers and ignore the user's Graphics-panel "look" + the `'auto'` context.
    expect(SRC).toContain('resolveToneMapping(')
  })

  it('tone-maps AFTER the HDR passes and BEFORE the display-referred ones', () => {
    const at = (needle: string) => SRC.indexOf(needle)
    expect(at('<N8AO')).toBeGreaterThan(-1)
    expect(at('<ToneMapping')).toBeGreaterThan(at('<N8AO'))
    expect(at('<ToneMapping')).toBeGreaterThan(at('<Bloom'))
    expect(at('<ToneMapping')).toBeGreaterThan(at('<DepthOfField'))
    expect(at('<ToneMapping')).toBeLessThan(at('<HueSaturation'))
    expect(at('<ToneMapping')).toBeLessThan(at('<Vignette'))
    expect(at('<ToneMapping')).toBeLessThan(at('<SMAA'))
  })

  it('keeps Bloom mipmapBlur OFF (BLOOM-MIP-FLASH)', () => {
    expect(CODE).toContain('mipmapBlur={false}')
    // `mipmapBlur` as a bare boolean prop (`mipmapBlur` / `mipmapBlur={true}`)
    // re-enables the blanking mip chain.
    expect(CODE).not.toMatch(/mipmapBlur(?!=\{false\})/)
  })

  it('gates Bloom on the day ramp so daylight mounts no bloom pass at all', () => {
    expect(SRC).toContain('bloomActiveForDay(dayLevel)')
  })

  it('keeps the tone mapper in AO-ONLY mode too, and the full-stack gates on SMAA (TIER-AO)', () => {
    // Mounting ANY composer disables three's own view transform, so the AO-only
    // path must still tone-map or it would blow its highlights exactly the way
    // High/Maximum used to. The ToneMapping push must therefore NOT be gated on
    // `full`, while bloom / grain / SMAA must be.
    // `\s*` after `push(` as of `v0.31.7.289`: `(z12)` gave the mode a conditional, biome wrapped
    // the call across lines, and the guard failed on FORMATTING while the invariant it protects was
    // intact. Same correction as the vignette clause below — a code-shape guard should pin the
    // shape that matters, not the line breaks.
    expect(CODE).toMatch(/effects\.push\(\s*<ToneMapping/)
    expect(CODE).not.toMatch(/if \(full\)\s*effects\.push\(\s*<ToneMapping/)
    expect(CODE).toMatch(/if \(full\) effects\.push\(<SMAA/)
    // VIGNETTE DELIBERATELY ABSENT FROM THIS LIST as of `v0.31.7.117`. This test used to assert
    // `if (full) effects.push(<Vignette`, and it failed when `(z)`12 moved the vignette to every
    // tier — correctly, which is the point of a code-shape guard. The clause was incidental
    // corroboration of a test whose subject is the TONE MAPPER; dropping it does not weaken that,
    // and the ordering guard above still pins the vignette after `<ToneMapping>`.
    expect(CODE).not.toMatch(/if \(full\) effects\.push\(<Vignette/)
  })

  it('replaces antialiasing rather than dropping it in AO-only mode', () => {
    // A composer renders to its own off-screen target, so the Canvas' MSAA no
    // longer applies. Without SMAA (full-stack only) the AO-only path needs real
    // multisampling, or Medium's edges would get WORSE than before it had AO.
    expect(CODE).toContain('multisampling={full ? 0 : 4}')
  })
})
