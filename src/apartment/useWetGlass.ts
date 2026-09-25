/**
 * WET-GLASS — the ONE place a window pane learns it is raining.
 *
 * Both pane implementations use it (`Window.tsx`'s `WindowPane` for the shipped default flat and
 * `PlanShell.tsx`'s pane for a loaded plan), for the same reason every other glass behaviour in
 * this app is written twice with a "parity with `Window.tsx`" comment and then drifts: there is no
 * reason for two copies of it. The policy, the textures and the per-frame write all live here; the
 * call sites contribute only the two facts the hook cannot know — the pane's size and its dry
 * roughness.
 *
 * Why the maps are bound in the frame loop rather than in JSX: binding a `normalMap` changes the
 * material's program key, so a pane that declared the slots unconditionally would pay for the
 * droplet shader permutation in every weather. Bound on the transition instead, the `clear` pane
 * compiles and runs exactly the shipped program, and the one-off compile lands on a deliberate
 * picker click.
 *
 * See `scene/lighting/wetGlass.ts` for what "wet" means here and what it deliberately does not do.
 */
import { useEffect, useMemo, useRef } from 'react'
import type { MeshPhysicalMaterial, MeshStandardMaterial } from 'three'
import { useFeature } from '../features/useFeature'
import {
  type WetGlassGrade,
  wetGlassAnimates,
  wetGlassGrade,
  wetGlassLevel,
} from '../scene/lighting/wetGlass'
import { type WetGlassMaps, wetGlassMaps } from '../scene/lighting/wetGlassTexture'
import { useAnimatedSource } from '../scene/useAnimatedSource'
import { useStore } from '../state/store'
import { reduceMotionFor } from '../ui/motionPreference'

export interface WetGlass {
  grade: WetGlassGrade
  /**
   * Per-frame write. Call from the pane's existing `useFrame` AFTER its own colour / transmission
   * / opacity work — it only touches `roughness`, the two map slots and `normalScale`, none of
   * which the existing pane code writes.
   *
   * `dryRoughness` is what the pane runs at when it is not raining; passing it in (rather than
   * having the hook remember the first value it saw) keeps the hook stateless about the pane's own
   * material story, which changes with the glass kind and the tier.
   */
  apply: (mat: MeshStandardMaterial, dryRoughness: number, delta: number) => void
}

export function useWetGlass(width: number, height: number): WetGlass {
  const weather = useStore((s) => s.weather)
  const weatherFlag = useFeature('weatherConditions')
  const wetFlag = useFeature('weatherWetGlass')
  const tier = useStore((s) => s.qualityTier)
  const deviceClass = useStore((s) => s.deviceClass)
  // Selected, not read through `shouldReduceMotion()`: the in-app tri-state has to take effect
  // the moment the user flips it, and `motionPreference.ts` records that a call site needing a
  // live re-render must subscribe itself. `reduceMotionFor` resolves the SELECTED value, so the
  // memo below is a real function of it rather than of a `getState()` read nothing can track.
  const reduceMotionPref = useStore((s) => s.reduceMotion)

  const grade = useMemo(() => {
    const opts = {
      // `weatherConditions` is the parent gate: with the weather feature off there is no condition
      // to be wet for, and the same two-flag resolution `SkyBackdrop` uses keeps the pane and the
      // sky from ever disagreeing about what the weather is.
      condition: weatherFlag ? weather : ('clear' as const),
      tier,
      enabled: weatherFlag && wetFlag,
      reduceMotion: reduceMotionFor(reduceMotionPref),
      weakDevice: deviceClass === 'weak',
    }
    return wetGlassGrade(wetGlassLevel(opts), opts)
  }, [weather, weatherFlag, wetFlag, tier, deviceClass, reduceMotionPref])

  const maps = useMemo<WetGlassMaps | null>(
    () => (grade.maps ? wetGlassMaps(width, height) : null),
    [grade.maps, width, height],
  )
  // The material `apply` last wrote to, so the cleanup below can UNBIND before it disposes. A
  // dispose alone would leave the pane's material pointing at a released texture until the next
  // frame's `apply` cleared it — self-correcting, but a frame drawn in that window re-uploads the
  // texture it just freed, and on unmount there is no next frame to correct anything at all.
  const boundTo = useRef<MeshStandardMaterial | null>(null)
  useEffect(() => {
    if (!maps) return
    return () => {
      const mat = boundTo.current as MeshPhysicalMaterial | null
      if (mat?.normalMap === maps.beads) {
        mat.normalMap = null
        mat.roughnessMap = null
        mat.needsUpdate = true
      }
      maps.beads.dispose()
      maps.tracks.dispose()
    }
  }, [maps])

  // Hold the demand-mode loop open only while something is actually moving — so a frozen wet pane
  // (reduce-motion, or a weak device) costs the render loop nothing at all.
  useAnimatedSource(wetGlassAnimates(grade))

  const phase = useRef(0)
  const bound = useRef<WetGlassMaps | null>(null)

  const apply = (mat: MeshStandardMaterial, dryRoughness: number, delta: number) => {
    const physical = mat as MeshPhysicalMaterial
    if (maps) {
      if (bound.current !== maps) {
        physical.normalMap = maps.beads
        physical.roughnessMap = maps.tracks
        physical.needsUpdate = true
        bound.current = maps
        boundTo.current = mat
      }
      physical.normalScale.set(grade.normalScale, grade.normalScale)
      if (grade.trailSpeed > 0) {
        // POSITIVE offset scrolls the painted content DOWN the pane. `flipY` puts canvas row 0 at
        // `v = 1`, so raising `offset.y` samples further up the canvas at a fixed point on the
        // glass, i.e. what was above arrives here — which is a drop running down, not up.
        phase.current = (phase.current + delta * grade.trailSpeed) % 1
        maps.tracks.offset.y = phase.current
      }
    } else if (bound.current) {
      physical.normalMap = null
      physical.roughnessMap = null
      physical.needsUpdate = true
      bound.current = null
    }
    mat.roughness = grade.roughness > 0 ? Math.max(grade.roughness, dryRoughness) : dryRoughness
  }

  return { grade, apply }
}
