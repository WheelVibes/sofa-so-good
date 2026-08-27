/**
 * Maps the pure {@link ToneMappingMode} look (from `look.ts`) to the concrete
 * `postprocessing` `ToneMappingMode` constant — the post-stack twin of
 * `toneMappingThree.ts`, kept in its own module for the same reason (`look.ts`
 * stays pure and unit-testable; the library constant is resolved in one place).
 *
 * ## Why the post stack needs its OWN tone mapper (TONE-POST)
 *
 * three applies `renderer.toneMapping` **only when rendering to the default
 * framebuffer**. From `WebGLRenderer.getProgram`:
 *
 * ```js
 * let toneMapping = NoToneMapping
 * if ( material.toneMapped ) {
 *   if ( _currentRenderTarget === null || _currentRenderTarget.isXRRenderTarget === true ) {
 *     toneMapping = _this.toneMapping
 *   }
 * }
 * ```
 *
 * Under `<EffectComposer>` the scene is rendered into an off-screen HalfFloat
 * render target, so `_currentRenderTarget !== null` and the view transform is
 * skipped — and `postprocessing`'s own `EffectMaterial` sets `toneMapped: false`,
 * so the final blit doesn't apply it either. The net effect on High/Maximum was
 * that **no tone mapping ran at all**: linear HDR went straight to the display
 * with only an sRGB encode, so everything over 1.0 clipped flat, and
 * `Lighting`'s per-frame `gl.toneMapping` / `gl.toneMappingExposure` writes (the
 * whole `grade()` + user-exposure + `toneExposureBias` model) were dead code.
 * Measured on a Mac mini M4 at 13:00, fraction of pure-white pixels in the
 * canvas: Performance/Medium **3.4%** vs High/Maximum **31.8%** — the reported
 * "lighting is too aggressive / washed out on the higher tiers", and the reason
 * the *best* tiers looked less real than the flat one.
 *
 * The fix is the library's documented contract: put a `ToneMappingEffect` in the
 * stack. Exposure needs no new plumbing — `postprocessing`'s tone-mapping shader
 * `#include`s three's own `<tonemapping_pars_fragment>` chunk, whose operators
 * all multiply by the `toneMappingExposure` uniform that `WebGLRenderer` already
 * uploads from `gl.toneMappingExposure`. So the exposure `Lighting` writes every
 * frame finally takes effect on the post tiers too, and the look stays in step
 * with Performance/Medium instead of diverging from it.
 */
import { ToneMappingMode as PostToneMappingMode } from 'postprocessing'
import type { ToneMappingMode } from './look'

export const TONE_MAPPING_POST: Record<ToneMappingMode, PostToneMappingMode> = {
  filmic: PostToneMappingMode.ACES_FILMIC,
  agx: PostToneMappingMode.AGX,
  neutral: PostToneMappingMode.NEUTRAL,
}
