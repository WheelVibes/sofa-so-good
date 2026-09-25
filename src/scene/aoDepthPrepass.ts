/**
 * AO-DEPTH-ISOLATION — the one place that decides whether N8AO and hardware MSAA
 * may run on the same composer, and the record of why that answer changed.
 *
 * ## The bug (MSAA-DEPTH-BLIT, `z22`)
 *
 * `ao=true` mounts `N8AO`, which sets `needsDepthTexture = true`
 * (`node_modules/n8ao/dist/N8AO.js`). `postprocessing`'s `EffectComposer` answers that
 * by allocating a **stable depth target** — a depth texture that is never a render
 * output, so it cannot alias the ping-pong buffers — and `blitFramebuffer`-ing the
 * scene depth into it once per frame (`EffectComposer.createDepthTexture` /
 * `blitDepthBuffer`). Turning `mobileMsaa` on flooded a real Metal browser with
 *
 *     GL_INVALID_OPERATION: glBlitFramebuffer:
 *     Depth/stencil buffer format combination not allowed for blit.
 *
 * and produced the ~20% mid-tone dimming, the clipped night kitchen ceiling
 * (200 → 254) and intermittent fully-black canvases that made the flag ship OFF.
 *
 * **The repo's original diagnosis named the wrong illegal operation.** WebGL2 does
 * *not* forbid resolving a multisample depth plane into a single-sample one — WebGL
 * 2.0 §4.7.4 defines exactly that downsample, deferring the error list to OpenGL ES
 * 3.0.6 §4.3.3. What §4.3.3 forbids is a **format mismatch**: `INVALID_OPERATION` when
 * `mask` includes `DEPTH_BUFFER_BIT`/`STENCIL_BUFFER_BIT` and the read and draw depth
 * formats differ. That is what was happening:
 *
 *   - `postprocessing` v6.39.0 changed the stable depth texture's type to `FloatType`
 *     → `DEPTH_COMPONENT32F` on the draw side.
 *   - The composer's multisampled *input buffer* had already been allocated by then, so
 *     three sized its MSAA depth renderbuffer from `getInternalDepthFormat(false, null)`
 *     → `DEPTH_COMPONENT24` on the read side
 *     (`three/src/renderers/webgl/WebGLTextures.js`).
 *   - 24-bit unorm ≠ 32-bit float ⇒ every depth blit failed, every frame.
 *
 * With `@react-three/postprocessing` the mismatch is guaranteed rather than occasional:
 * effects mount declaratively, so a depth-requiring pass is routinely added *after* the
 * composer has already rendered once and fixed its renderbuffer formats.
 *
 * ## The fix is upstream, not local
 *
 * This is pmndrs/postprocessing **issue #745**, fixed in **v6.39.3** (2026-07-18):
 * "EffectComposer: fix depth buffer format mismatch when depth-aware passes are added
 * after the composer has already rendered". `createDepthTexture()` now assigns
 * matching-format depth textures to *both* ping-pong buffers and `dispose()`s them so
 * three rebuilds the MSAA renderbuffers at the matching format — verified by reading
 * `node_modules/postprocessing/build/index.js` after the upgrade, not taken on trust.
 *
 * So the "private non-multisampled depth pre-pass" the research doc sketched
 * (`docs/research/sota-2026-09-25.md` #2, after Primozic's recursive-depth note) is
 * **already what the composer does** — the stable depth target *is* that pre-pass. The
 * only thing missing was that its format did not match the MSAA side. Re-implementing a
 * second copy locally would pay for an extra full-screen depth copy every frame to
 * duplicate machinery that now works, so this module does the other half: it owns the
 * gate, and {@link postprocessingSatisfiesDepthFix} + `aoDepthPrepass.test.ts` fail the
 * build if anyone downgrades `postprocessing` back under the fix.
 *
 * ## Not covered by the upstream fix
 *
 *  - **N8AO issue #53** (`Read and write depth stencil attachments cannot be the same
 *    image`) is a *different*, still-open complaint — console spam with correct
 *    rendering. Do not expect it to disappear here.
 *  - **pmndrs #412** — an iOS-only WebGL2 driver defect with multisampled
 *    depth/stencil, closed upstream as "external bug". It is a reason to keep the
 *    `mobileMsaa` flag opt-in, and it is the reason `z21` BATHROOM-BLACK-BLOB is worth
 *    re-checking on a device; it is NOT the mechanism fixed above.
 *  - **SwiftShader.** Excluded on its own merits (REALISTIC-SOFTWARE-FALLBACK): a
 *    software rasteriser has no tile memory, so every sample is real ALU work on the
 *    tier with the least headroom. Nothing about the depth format changes that.
 */

/**
 * First `postprocessing` release whose `EffectComposer` allocates the multisampled
 * depth renderbuffer with the SAME format as the stable depth texture it blits into
 * (pmndrs/postprocessing #745). Below this, `multisampling > 0` plus any depth-aware
 * pass is a per-frame `GL_INVALID_OPERATION`.
 */
export const AO_DEPTH_FIX_MIN_POSTPROCESSING = '6.39.3'

/** `1.2.3` / `1.2.3-beta.4` → `[1, 2, 3]`; `null` when it is not a plain semver. */
function parseSemver(version: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

/**
 * Does the installed `postprocessing` carry the #745 depth-format fix?
 *
 * Deliberately conservative: an unparseable version reads as NOT fixed, so a weird
 * pin can only cost antialiasing, never correctness.
 */
export function postprocessingSatisfiesDepthFix(
  installed: string,
  min: string = AO_DEPTH_FIX_MIN_POSTPROCESSING,
): boolean {
  const a = parseSemver(installed)
  const b = parseSemver(min)
  if (a === null || b === null) return false
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i]
  }
  return true
}

/** Why the composer ended up with the sample count it did — the diagnostic half of
 *  {@link aoMsaaDecision}, so a probe or a test can assert the REASON and not just the
 *  number (a 0 for the right reason and a 0 for the wrong one look identical). */
type AoMsaaReason =
  | 'off:not-full-stack'
  | 'off:flag-off'
  | 'off:software-rasteriser'
  | 'off:device-class'
  | 'on:composer-depth-format-matched'

export interface AoMsaaDecision {
  /** Samples to hand `<EffectComposer multisampling>`. 0 = no hardware MSAA. */
  samples: number
  reason: AoMsaaReason
}

/**
 * Resolve the FULL-stack composer's sample count.
 *
 * Pure, so the whole policy is unit-testable without a GPU — same spirit as
 * `composerPlan`. `ao` is deliberately **not** an input any more: it was the
 * MSAA-DEPTH-BLIT mitigation, and because `ao` is true on every tier that runs the full
 * stack (`quality.ts`: `postprocessing: true` ⇒ `ao: true` at both device classes) it
 * made `mobileMsaa` unreachable dead configuration rather than a flag. With the
 * upstream format fix in place the two can coexist, which is the entire point.
 */
export function aoMsaaDecision(o: {
  /** Full post stack (vs the AO-only / minimal composer). */
  full: boolean
  deviceClass: string
  softwareRenderer: boolean
  flagOn: boolean
  /** Samples to use when nothing vetoes MSAA. */
  samples: number
}): AoMsaaDecision {
  if (!o.full) return { samples: 0, reason: 'off:not-full-stack' }
  if (!o.flagOn) return { samples: 0, reason: 'off:flag-off' }
  if (o.softwareRenderer) return { samples: 0, reason: 'off:software-rasteriser' }
  if (o.deviceClass !== 'weak') return { samples: 0, reason: 'off:device-class' }
  return { samples: o.samples, reason: 'on:composer-depth-format-matched' }
}
