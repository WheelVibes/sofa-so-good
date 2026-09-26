/**
 * AO-GLAZING-OPAQUE (R7-AE) — keep window glass out of N8AO's transparency redraws.
 *
 * **What N8AO does.** `N8AOPostPass` (the `n8ao` 1.10.1 build bundled by
 * `@react-three/postprocessing`) auto-enables `transparencyAware` the moment the scene holds any
 * `transparent` material, which this flat always does. Every frame `renderTransparency` then
 * renders the scene twice more — once with only the transparent meshes that do not write depth,
 * once with only those that do — using each mesh's OWN material. The compositor reads only the
 * alpha (and the second target's depth) to fade the AO toward 1 under a see-through surface.
 *
 * **Why that was the 5.9 ms.** The glass panes are transmissive `MeshPhysicalMaterial`s, so each
 * redraw ran the full unrolled point-light loop plus a transmission pass over every glass pixel
 * (`docs/research/lights-gpu-bound-2026-09-25.md` §9.3: the lights × AO interaction).
 *
 * **What this does.** For the duration of `renderTransparency` only, every glazing mesh
 * (`markGlazing`) whose material is at full opacity gets N8AO's own opt-out,
 * `userData.treatAsOpaque = true` (both of N8AO's filters honour it), and is restored afterwards.
 *
 * **Why it does not change the AO, measured rather than argued** (§10.4): at full opacity the
 * pane's redraw leaves the AO where it was — frames with and without it differ at the noise floor
 * (0.12–0.27 % of pixels vs 0.02–0.26 % for the same arm twice), at 13:00, 21:00 and 13:00 in
 * rain (wet glass), living room and main bedroom. The full-opacity condition keeps the redraw for
 * a pane that is genuinely see-through in alpha: a window fading with its wall in orbit, and the
 * alpha-blended panes of the tiers without transmission.
 *
 * The two alternatives the brief listed were measured too. `transparencyAware = false` saves
 * ~0.4 ms more but also drops the contact-shadow planes and the orbit wall-reveal fade out of the
 * AO's transparency handling, for nothing visible at the measured poses. An unlit stand-in material
 * for the redraws (same alpha, no light loop) costs the same as this but did NOT match: it lifted
 * the AO off the glass (up to 5.3 % of pixels brighter) — the lit pane's alpha inside that pass is
 * not what the transmission shader model predicts, so it is not reproducible generically.
 *
 * It wraps the pass's own method rather than copying it, so an n8ao update that changes the redraw
 * logic keeps working.
 */
import type { Material, Object3D, Scene, WebGLRenderer } from 'three'
import { isGlazing } from '../apartment/walls/wallReveal'

/** The part of `N8AOPostPass` this relies on (n8ao ships no types). */
export interface TransparencyAwarePass {
  scene: Scene
  renderTransparency: (renderer: WebGLRenderer) => void
}

/** Opacity at or above which a pane is opaque in alpha (transmission carries the see-through). */
const FULL_OPACITY = 0.999

/** Should this object sit out N8AO's transparency redraws? Pure, unit-tested. */
export function glazingSitsOut(o: Object3D): boolean {
  const m = (o as Object3D & { material?: Material | Material[] }).material
  if (!m || Array.isArray(m) || !isGlazing(o.userData)) return false
  return m.opacity >= FULL_OPACITY && o.userData.treatAsOpaque !== true
}

const WRAPPED = Symbol('aoGlazingOpaque')
type Render = ((renderer: WebGLRenderer) => void) & { [WRAPPED]?: Render }

/**
 * Wrap `pass.renderTransparency`; returns the uninstaller. Idempotent: installing over one of its
 * own wrappers (React may attach a callback ref twice) wraps the pass's real method, never a
 * wrapper, so one uninstall always gets back to N8AO's own method.
 */
export function installGlazingOpaque(pass: TransparencyAwarePass): () => void {
  let original = pass.renderTransparency as Render
  while (original[WRAPPED]) original = original[WRAPPED] as Render
  const marked: Object3D[] = []
  const wrapped: Render = (renderer: WebGLRenderer) => {
    pass.scene.traverse((o) => {
      if (!glazingSitsOut(o)) return
      o.userData.treatAsOpaque = true
      marked.push(o)
    })
    try {
      original.call(pass, renderer)
    } finally {
      for (const o of marked) delete o.userData.treatAsOpaque
      marked.length = 0
    }
  }
  wrapped[WRAPPED] = original
  pass.renderTransparency = wrapped
  return () => {
    const current = pass.renderTransparency as Render
    if (!current[WRAPPED]) return
    // Back to exactly what N8AO had: its prototype method (drop the own property) or its own.
    const proto = Object.getPrototypeOf(pass) as Partial<TransparencyAwarePass> | null
    if (proto?.renderTransparency === original) {
      delete (pass as Partial<TransparencyAwarePass>).renderTransparency
    } else pass.renderTransparency = original
  }
}
