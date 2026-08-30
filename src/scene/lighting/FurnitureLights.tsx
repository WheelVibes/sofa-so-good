import { useEffect, useMemo } from 'react'
import { Object3D } from 'three'
import { useShallow } from 'zustand/react/shallow'
import { useFeature } from '../../features/useFeature'
import { useStore } from '../../state/store'
import { fixturesRender } from '../look'
import { useQuality } from '../useQuality'
import { daylightFromAltitude } from './altitudeCurve'
import { setFixtureGlow } from './fixtureGlow'
import { aggregateFixtureLights, type FixtureLight, fixtureLightsFor } from './fixtureLights'
import { useSunPosition } from './useSunPosition'

/**
 * Drives real point lights from light-emitting furniture (lamps, pendants).
 *
 * **`lightsMode` is one switch for the whole home: on lights every fixture, off
 * lights none.** No camera-proximity culling — this used to rank emitters by
 * distance and keep only the nearest `maxFixtureLights` (2 on the default
 * Performance tier, ×3 in orbit), which in a 19-emitter flat meant lamps
 * switching on and off around you as you walked. Selection + placement is the
 * pure `fixtureLights.ts`; the only remaining cap there is a GPU shader-uniform
 * guard far above any real design.
 *
 * A fixture's OWN switch still wins (`props.lightOn === 'no'`, the walk-mode
 * per-light toggle) — that item never enters the set, in either mode.
 *
 * While off, nothing renders (zero cost). Fixture lights cast no shadows.
 */
export function FurnitureLights() {
  const items = useStore(useShallow((s) => s.items))
  const lightsMode = useStore((s) => s.lightsMode)
  const iesEnabled = useFeature('iesLights')
  // Lighting mood presets (UX round-3 #3): composed on top of `lightsMode`,
  // never in place of it — see `lighting/moodPresets.ts` composition doc.
  // Forced to 'none' when the feature is off, so a stale persisted mood from
  // before the flag was disabled has no visual effect.
  const moodEnabled = useFeature('lightMoodPresets')
  const lightMoodRaw = useStore((s) => s.lightMood)
  const lightMood = moodEnabled ? lightMoodRaw : 'none'

  // Binary all-on / all-off (the sun-following 'auto' mode was removed), then
  // PHOTO-FILL-VIEW: `lightsMode` stays the USER's setting and is never written
  // here; `fixturesRender` decides whether THIS VIEW draws them. Off by default —
  // with `photographicFill` off it is exactly `lightsMode === 'on'`.
  const cameraMode = useStore((s) => s.cameraMode)
  const daylight = daylightFromAltitude(useSunPosition().altitude)
  const photoFill = useFeature('photographicFill')
  const level = fixturesRender(lightsMode === 'on', cameraMode, daylight, photoFill) ? 1 : 0

  // Shared "lights are on" factor the fixture primitives poll to glow their
  // emissive shades. It only changes with the switch, so it is written on
  // change rather than every frame (this component no longer has a per-frame
  // path at all).
  useEffect(() => {
    setFixtureGlow(level)
  }, [level])

  // Merge fixtures that read as one light (a downlight grid) on the tiers that
  // need the headroom — every light costs a full BRDF per fragment. Never on
  // High/Maximum, where the lighting design is rendered exactly as authored.
  const mergeLights = useQuality().mergeCoincidentLights

  // Nothing depends on the camera, so the set is a plain memo: it changes only
  // when the design, the mood, the IES flag or the tier does.
  const active = useMemo(() => {
    if (level <= 0) return []
    const lights = fixtureLightsFor(items, { lightMood, iesEnabled })
    return mergeLights ? aggregateFixtureLights(lights) : lights
  }, [level, items, lightMood, iesEnabled, mergeLights])

  if (active.length === 0) return null
  return (
    <>
      {active.map((l) =>
        l.spot ? (
          <IesSpotLight key={l.id} light={l} level={level} />
        ) : (
          <pointLight
            key={l.id}
            position={l.position}
            color={l.color}
            intensity={l.baseIntensity * level * l.moodMultiplier}
            distance={l.distance}
            decay={2}
          />
        ),
      )}
    </>
  )
}

/**
 * A photometric (IES) fixture rendered as a downward-pointing Three `SpotLight`.
 * The target sits directly below the bulb on the floor so the cone shines down;
 * `angle`/`penumbra` come from the parsed IES profile's field/beam geometry.
 */
function IesSpotLight({ light, level }: { light: FixtureLight; level: number }) {
  const [x, y, z] = light.position
  // A stable target object placed on the floor directly under the bulb → the cone
  // shines straight down. Created once and re-positioned when the bulb moves.
  const target = useMemo(() => new Object3D(), [])
  target.position.set(x, Math.max(0, y - 3), z)
  return (
    <>
      <spotLight
        position={light.position}
        target={target}
        color={light.color}
        intensity={light.baseIntensity * level * light.moodMultiplier}
        distance={light.distance}
        angle={light.spot!.angle}
        penumbra={light.spot!.penumbra}
        decay={2}
      />
      <primitive object={target} />
    </>
  )
}
