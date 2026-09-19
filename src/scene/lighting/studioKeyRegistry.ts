import type { DirectionalLight } from 'three'

/**
 * Registry for the orbit studio key light (ORBIT-STUDIO-LOOK, `Lighting.tsx`),
 * so code outside that component — namely `ShaderWarmup.tsx`'s
 * WALK-LIGHT-CENSUS-WARMUP — can reach the live light instance without a
 * `scene.traverse` by name or tag.
 *
 * `Lighting.tsx` populates this from the same callback ref (`attachStudio`)
 * it already uses to tag the light's shadow camera with
 * `STUDIO_KEY_SHADOW_TAG` — a callback ref, not a `useEffect`, because the
 * light remounts (a fresh instance + shadow camera) whenever its React `key`
 * changes (map size / frustum extent / filter), and only a ref fires on that
 * new instance. React calls the ref with `null` on unmount (flag off, tier
 * too weak, or leaving orbit mode), which this module treats as "no light to
 * warm around" rather than a stale pointer.
 */
let studioKeyLight: DirectionalLight | null = null

/** Register (or, passed `null`, clear) the currently mounted orbit studio
 *  key light. Call from `Lighting.tsx`'s ref callback only. */
export function registerOrbitStudioKey(light: DirectionalLight | null): void {
  studioKeyLight = light
}

/** The currently mounted orbit studio key light, or `null` when it is not
 *  mounted (walk mode, `orbitStudioLook` off, or a device class too weak to
 *  run it — see `orbitStudioActive`). */
export function getOrbitStudioKey(): DirectionalLight | null {
  return studioKeyLight
}
