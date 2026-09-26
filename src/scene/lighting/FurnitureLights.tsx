import { useEffect, useMemo } from 'react'
import { Object3D } from 'three'
import { useShallow } from 'zustand/react/shallow'
import { useFeature } from '../../features/useFeature'
import { useStore } from '../../state/store'
import { fixturesLevel } from '../look'
import { useQuality } from '../useQuality'
import { lampDaylightWeight, lightingFromAltitude } from './altitudeCurve'
import { daylitRoomIds, fixtureSurvivesDaylight } from './daylitRooms'
import { setFixtureGlow } from './fixtureGlow'
import { aggregateFixtureLights, type FixtureLight, fixtureLightsFor } from './fixtureLights'
import { PooledFixtureLights } from './PooledFixtureLights'
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
 *
 * **Unless `roomScopedLights` is on (the default since R7-AE):** then the point lights are a
 * CONSTANT pool (`PooledFixtureLights.tsx`), mounted dark while the switch is off so the light
 * count — and every lit program — never changes in walk mode, and scoped to the camera's room and
 * the rooms visible from it (`lightRooms.ts`). That is a room rule, not the camera-distance cap
 * described above: nothing changes as the camera walks or turns inside a room.
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
  // Sun STRENGTH, not the night ramp — see `fixturesRender`.
  const sunStrength = lightingFromAltitude(useSunPosition().altitude).sun
  const photoFlag = useFeature('photographicFill')
  const photoSetting = useStore((s) => s.photographicLook)
  const photoFill = photoFlag && photoSetting
  const level = fixturesLevel(lightsMode === 'on', cameraMode, sunStrength, photoFill)
  // LIGHTS-DAYLIGHT-ADDITIVE (W1). `level` above is the bare switch in the shipped configuration
  // (`photographicLook` is off by default, so `fixturesLevel` returns 1 whenever the lights are
  // on) and the lamp flux behind it was calibrated at NIGHT. At 13:00 that made one lamp worth
  // about as much as the whole sky: the review measured five rooms spanning a 9x daylight range
  // all landing at floor luma 147-176 with the lights on, i.e. additive but with an addend that
  // erased the daylight gradient rather than sitting on top of it.
  //
  // `lampDaylightWeight` restores the RATIO without touching the flux, so the calibrated 21:00
  // frames are byte-identical (it returns the literal 1.0 at every altitude the clear-sky curve
  // reads 0 at) and a noon room with the lamps on is still brighter than noon alone. It rides the
  // SKY curve, not the night ramp, so 18:30 -- sun 7.3 degrees up, an hour from dark -- keeps its
  // lamps at 0.92 rather than being treated as full daylight.
  //
  // The `lampBounce` half of the same lamp takes the same weight in `VisibilityLightmaps.tsx`.
  // `setFixtureGlow` below deliberately does NOT: a switched-on lamp SHADE reads lit at every
  // hour, and that signal also drives the fixture emissives and the Fireplace.
  const lampsRelative = useFeature('lampsDaylightRelative')
  const sunAltitude = useSunPosition().altitude
  const renderLevel = lampsRelative ? level * lampDaylightWeight(sunAltitude) : level
  // PHOTO-FILL-WINDOWLESS: the rule above is view-wide, but a room with no window
  // gets nearly all its light from these fixtures — measured, the bathroom fell to
  // mean 94.6 and the corridor put 31 % of its pixels below 64. So when the rule
  // fires, fixtures in rooms daylight cannot reach are kept.
  const plan = useStore((s) => s.floorPlan)
  const keepWindowless = lightsMode === 'on' && level < 1
  const daylit = useMemo(
    () => (keepWindowless ? daylitRoomIds(plan) : null),
    [keepWindowless, plan],
  )

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
    if (level <= 0 && !daylit) return []
    let lights = fixtureLightsFor(items, { lightMood, iesEnabled })
    if (daylit) {
      // A windowless room keeps FULL fixture light; everywhere else fades with
      // the sun. Encoded on the light so the two can coexist in one pass.
      lights = lights
        .map((l) => {
          const keep = fixtureSurvivesDaylight(plan, daylit, l.position[0], l.position[2])
          const k = keep ? renderLevel : level * renderLevel
          return k > 0 ? { ...l, moodMultiplier: l.moodMultiplier * k } : null
        })
        .filter((l): l is (typeof lights)[number] => l !== null)
    } else if (renderLevel < 1) {
      lights = lights.map((l) => ({ ...l, moodMultiplier: l.moodMultiplier * renderLevel }))
    }
    return mergeLights ? aggregateFixtureLights(lights) : lights
  }, [level, renderLevel, daylit, plan, items, lightMood, iesEnabled, mergeLights])

  // ROOM-SCOPED-LIGHTS: the point lights become a constant pool that stays mounted (dark) while
  // the lights are off, so this branch must render even with an empty set.
  const pooled = useFeature('roomScopedLights')
  const pointLights = useMemo(() => active.filter((l) => !l.spot), [active])
  if (pooled) {
    return (
      <>
        <PooledFixtureLights lights={pointLights} />
        {active.map((l) => (l.spot ? <IesSpotLight key={l.id} light={l} level={1} /> : null))}
      </>
    )
  }
  if (active.length === 0) return null
  return (
    <>
      {active.map((l) =>
        l.spot ? (
          <IesSpotLight key={l.id} light={l} level={1} />
        ) : (
          <pointLight
            key={l.id}
            position={l.position}
            color={l.color}
            intensity={l.baseIntensity * l.moodMultiplier}
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
