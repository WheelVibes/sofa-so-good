/**
 * DEV-only LINEAR view transform, for measurement rather than for looking.
 *
 * **Why this exists (item `(z12)`).** Blender can be measured in linear light —
 * `render_still.py --view-transform Standard` is the sRGB OETF alone, so it inverts exactly, and
 * `patch-read LINEAR=1` decodes it per pixel. The app could not, and that asymmetry silently
 * mis-framed three separate findings in this arc: `(z11)` concluded the baked GI fell off too fast
 * toward room edges when in LINEAR terms it falls off too gently (0.8216 against physics' 0.750);
 * `(l)`'s "AgX shoulder" theory; and `v0.31.7.280`'s bar-versus-glass conflation. A ratio of
 * tone-mapped bytes is not a ratio of light, and near the AgX shoulder it understates differences.
 *
 * **Why a flag and not a fourth tone mode.** `ToneMappingMode` is user-facing — it appears in the
 * Scene menu, the graphics settings and the mobile sheet — and a linear passthrough is not a look
 * anyone should be offered: over-1.0 values clip flat and the image is objectively worse. So this
 * is deliberately out-of-band and DEV-only.
 *
 * **Both sites, or neither.** The curve is applied in TWO places and bypassing one is worse than
 * bypassing none, because the result looks plausible and is wrong. `Lighting` writes
 * `gl.toneMapping` every frame, and on Medium+ tiers `EffectsImpl` also puts a `ToneMappingEffect`
 * in the post stack — three skips `renderer.toneMapping` entirely when rendering to a render
 * target, which is the whole reason TONE-POST exists. Read from localStorage so a probe can set it
 * with `evaluateOnNewDocument` BEFORE the first frame, and cached so the per-frame path in
 * `Lighting` does not touch storage 60 times a second.
 *
 * `LinearToneMapping`, NOT `NoToneMapping`: three's `NoToneMapping` skips the exposure multiply, so
 * a frame captured that way would silently lose `grade(altitude).exposure` and every level would be
 * wrong by the day grade.
 */
export const LINEAR_VIEW_KEY = 'ssg_linear_view'

let cached: boolean | null = null

export function isLinearView(): boolean {
  if (!import.meta.env.DEV) return false
  if (cached === null) {
    try {
      cached = localStorage.getItem(LINEAR_VIEW_KEY) === '1'
    } catch {
      cached = false
    }
  }
  return cached
}

/** Test-only: clear the memo so a fresh read sees a changed key. */
export function __resetLinearViewForTest(): void {
  cached = null
}
