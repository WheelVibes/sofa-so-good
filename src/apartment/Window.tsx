import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  Color,
  type Group,
  Mesh,
  type MeshPhysicalMaterial,
  type MeshStandardMaterial,
} from 'three'
import { useFeature } from '../features/useFeature'
import {
  type GrilleMemberInstance,
  glassBlockInstances,
  grilleBarInstances,
  invisibleGrilleCableInstances,
  louvreSlatInstances,
  sashFrameInstances,
  sashOpenTilt,
  windowGlassKindParams,
} from '../floorplan/windowGrilleLayout'
import { InstancedBoxes, InstancedCylinders } from '../furniture/primitives/InstancedBoxes'
import { MetalMaterial } from '../furniture/primitives/MetalMaterial'
import {
  GLASS_SKYCATCH_COLOR,
  glassSkyCatchIntensity,
  grilleGlareIntensity,
  windowGlassPhysical,
  windowTransmission,
  windowTransmissionRealView,
} from '../materials/materialRealism'
import { estateVisibleNow } from '../scene/estate/estateSignal'
import { daylightFromAltitude } from '../scene/lighting/altitudeCurve'
import { useSunPosition } from '../scene/lighting/useSunPosition'
import { backdropVisibleNow } from '../scene/SceneBackdrop'
import { useStore } from '../state/store'
import { WALLS, WINDOWS } from './constants'
import type { WallSpec, WindowSpec } from './types'
import { getWallOpacity, isWallOverlay, markGlazing, markWallOverlay } from './walls/wallReveal'
import {
  WINDOW_FRAME_DEPTH,
  WINDOW_GRILLE_Z,
  WINDOW_SILL_LEDGE_DEPTH,
  WINDOW_SILL_LEDGE_Z,
} from './windowProjection'

function findWall(wallId: string): WallSpec | undefined {
  return WALLS.find((w) => w.id === wallId)
}

const FRAME_T = 0.05 // frame bar thickness

// Glass tint by daylight: a clear cool pane in daytime → a dark reflective pane
// at night (so windows read as real glass — bright by day, near-black at night).
// Lerped each frame from the shared darkness signal; allocation-free.
const GLASS_DAY = new Color('#bcd4e6')
const GLASS_NIGHT = new Color('#20272f')
// Frame/grille/sill depths live in `windowProjection.ts` — the ONE module that
// also derives how far each layer reaches past a wall face, which is what
// `furniture/placement/curtainStandoff.ts` clears a curtain against.
const FRAME_D = WINDOW_FRAME_DEPTH // frame depth (across the wall)
const GLASS_D = 0.02

const frameMat = { color: '#e6e7e4', roughness: 0.45, metalness: 0.35 } as const

function Bar({
  w,
  h,
  x,
  y,
  detail,
}: {
  w: number
  h: number
  x: number
  y: number
  detail?: boolean
}) {
  return (
    <mesh position={[x, y, 0]} castShadow userData={detail ? markWallOverlay() : undefined}>
      <boxGeometry args={[w, h, FRAME_D]} />
      <meshStandardMaterial {...frameMat} />
    </mesh>
  )
}

const GRILLE_Z = WINDOW_GRILLE_Z // interior offset, in front of the glass
const grilleMat = { color: '#d9dadc', roughness: 0.45, metalness: 0.5 } as const
/** Glare colour for the bars: the sky's own near-white, not the frame's grey. */
const GRILLE_GLARE_COLOR = '#eef4ff'

/** Safety grille sized to the glazed opening — the approved SNV GRID design
 *  (vertical bars + evenly spaced horizontal rails,
 *  assets/guidelines/approved_grille_design.png), built by the ONE shared
 *  layout builder (`windowGrilleLayout.ts:grilleBarInstances`) so the curated
 *  flat and custom plans (`PlanShell`'s `FadeWindow`) render the identical
 *  design as one `InstancedBoxes` draw call. The helper is fixed to
 *  `PlanShell`'s native x=depth/z=width frame, so its x/z are swapped here
 *  (same remap the louvre/cable helpers below use). Bars sit just inside the
 *  glass so they read from the room and through the window from outside. */
function Grille({ w, h }: { w: number; h: number }) {
  // Daylight-keyed glare on the bars — see `grilleGlareIntensity`. `useSunPosition` re-renders
  // only when the HOUR changes (60 s in system mode, on demand in manual) and returns a cached
  // stable object, so this costs nothing per frame; that is why it is a prop rather than a
  // per-frame material mutation like the glass.
  const daylight = daylightFromAltitude(useSunPosition().altitude)
  const members: GrilleMemberInstance[] = grilleBarInstances(w, h).map((m) => ({
    position: [m.position[2], m.position[1], m.position[0]],
    size: [m.size[2], m.size[1], m.size[0]],
  }))
  return (
    <group position={[0, 0, GRILLE_Z]}>
      <InstancedBoxes instances={members} userData={markWallOverlay()}>
        <MetalMaterial
          {...grilleMat}
          emissive={GRILLE_GLARE_COLOR}
          emissiveIntensity={grilleGlareIntensity(daylight)}
        />
      </InstancedBoxes>
    </group>
  )
}

export function WindowPane({ spec }: { spec: WindowSpec }) {
  const wall = findWall(spec.wallId)
  const groupRef = useRef<Group>(null)
  const glassRef = useRef<MeshStandardMaterial>(null)
  // PHOTO-GLASS: High/Maximum render the pane as real refractive glass
  // (transmission + ior 1.5 + thin volume); Performance/Medium keep the cheap
  // transparent pane byte-identical (`windowGlassPhysical` returns null there).
  const glassPhysical = windowGlassPhysical(useStore((s) => s.qualityTier))
  // GLASS-NIGHT-VEIL: with a real view behind the pane the night pane keeps near-full transmission,
  // so its diffuse lobe stops veiling the dark neighbour block (`windowTransmissionRealView`).
  const nightVeilFix = useFeature('glassNightVeil')
  // Last-applied `transparent` flag for the opaque (non-glass) parts — toggling
  // it at runtime needs a `needsUpdate` to actually blend (see WallSegment).
  const opaqueTransparentRef = useRef(false)
  // Window style (`plain` by default — the safety grille is now opt-in via
  // `style: 'grille'`, GLASS-KINDS) and GLASS kind (same vocab as
  // `PlanOpening.style`/`material` on a plan window). Only `clear` (default)
  // tells the day/night story with colour — a non-clear kind shouldn't turn
  // dark blue at night, so it keeps a static params colour instead.
  const style = spec.style ?? 'plain'
  const isClearGlass = !spec.glass || spec.glass === 'clear'
  const isGlassBlock = spec.glass === 'glass-block'
  const glassParams = useMemo(() => windowGlassKindParams(spec.glass), [spec.glass])
  // GLASS-CLARITY: on the transmission tier the pane's colour IS the shader's transmittance
  // and its roughness IS real blur of the view behind it, so both come from the kind's
  // transmission-tier fields (`transmissionColor`/`transmissionRoughness`, floored by the
  // physical baseline). The cheap tier keeps `color`/`roughness`/`opacityCheap` byte-identical
  // — there the hex is an opacity-blended tint over the wall, which reads correctly as is.
  const paneColor = glassPhysical ? glassParams.transmissionColor : glassParams.color
  const paneRoughness = glassPhysical
    ? Math.max(glassPhysical.roughness, glassParams.transmissionRoughness)
    : glassParams.roughness
  // Daylight end of the clear pane's day/night colour blend. The night end (GLASS_NIGHT) and
  // the `dn` ramp — including ESTATE-NIGHT-GLASS — are untouched.
  const dayColor = useMemo(
    () => (glassPhysical ? new Color(paneColor) : GLASS_DAY),
    [glassPhysical, paneColor],
  )
  // Fade the whole window (frame, grille, sill + glass) WITH its host wall during
  // the orbit dollhouse reveal — otherwise an opaque frame/grille floats in a
  // translucent wall. Glass also tints by daylight (clear by day → dark at night).
  // Read once per render and held in a ref: `useFrame` must not call a hook, and
  // `useSunPosition` is memoised per (minute, location) so this is not a cost.
  const sunAltRef = useRef(0)
  sunAltRef.current = useSunPosition().altitude

  useFrame(() => {
    const g = groupRef.current
    if (!g) return
    const wallOp = getWallOpacity(spec.wallId)
    g.visible = wallOp > 0.02
    if (!g.visible) return
    // DAYLIGHT-GLASS: 1 at night, 0 in daylight — from the SUN, not the lamps.
    // This used to read `getFixtureGlow()`, which is exactly `lightsMode === 'on'`,
    // so the glass went to its night look at midday for every new visitor (the
    // lamps are on by default at every hour). See `daylightFromAltitude`.
    const d = 1 - daylightFromAltitude(sunAltRef.current)
    const glass = glassRef.current
    // Cheap tiers tell the day/night story with opacity (more opaque at night);
    // transmission tiers keep alpha at 1 (opacity is reserved for the wall-fade
    // compose) and tell it with transmission instead — clear refractive pane by
    // day, near-solid dark reflective pane at night (PHOTO-GLASS). Glass-block
    // glazing reads via its own block grid, not this backing pane, so it
    // shrinks to near-invisible instead of the normal opacity story.
    // ESTATE-NIGHT-GLASS: with a real, lit exterior mounted (`estateSignal.ts`) the pane
    // must not go dark and opaque at dusk — a real pane is as clear at night as by day,
    // and the darkness belongs to the outside. So the night ramp `dn` is held near zero
    // while the estate is present; every other path keeps PHOTO-GLASS's `d` unchanged.
    const dn = estateVisibleNow() ? d * 0.15 : d
    const glassBase = isGlassBlock ? 0.12 : glassPhysical ? 1 : 0.28 + dn * 0.45
    if (glass) {
      if (isClearGlass) {
        glass.color.lerpColors(dayColor, GLASS_NIGHT, dn)
      } else {
        glass.color.set(paneColor)
      }
      // GLASS-SKYCATCH-VEIL — see `PlanShell`'s pane and `glassSkyCatchIntensity`. The
      // ESTATE is the SECOND real view behind the pane (ESTATE-SKYCATCH-VEIL): `<Estate>`
      // renders whenever `estateVisibleNow()` is true, independently of the PHOTO backdrop
      // `backdropVisibleNow()` tracks — e.g. `backdrop: 'none'` still shows the estate
      // (`Estate.tsx`'s gate excludes only a chosen photo preset, not `'none'`), and there
      // `backdropVisibleNow()` reads false while a real, lit neighbour block sits right
      // behind the glass. Either signal retires the stand-in.
      const realView = backdropVisibleNow() || estateVisibleNow()
      glass.emissiveIntensity = glassSkyCatchIntensity(1 - d, realView)
      if (glassPhysical) {
        // GLASS-NIGHT-VEIL. The kind's own factor multiplies LAST, so a frosted or reeded pane
        // keeps its relative opacity — the correction is to the clear-glass baseline, not a
        // flat override that would turn every kind into clear glass at night.
        const base = windowTransmission(1 - dn)
        const lifted = nightVeilFix && realView ? windowTransmissionRealView(base, d) : base
        ;(glass as MeshPhysicalMaterial).transmission = lifted * (glassParams.transmission / 0.9)
      }
    }
    const fading = wallOp < 0.985
    const opaqueChanged = fading !== opaqueTransparentRef.current
    opaqueTransparentRef.current = fading
    g.traverse((o) => {
      if (!(o instanceof Mesh)) return
      // A revealed wall shows FRAME + GLASS only. Every other member of the
      // window — mullions, safety grille, louvre slats, invisible-grille cables,
      // sash bars, the interior sill — is another translucent layer composited
      // over the wall behind it, and the stack is what reads as vertical density
      // banding through a faded wall (the wall's own overlays are culled the
      // same way, see `markWallOverlay`). They come back the moment the wall is
      // opaque, where depth testing resolves them instead of blending.
      if (isWallOverlay(o.userData)) {
        o.visible = !fading
        if (fading) return
      }
      const m = o.material as MeshStandardMaterial
      const isGlass = m === glass
      const base = isGlass ? glassBase : 1
      m.transparent = isGlass || fading
      m.opacity = base * wallOp
      // depthWrite stays ON at all times (WALL-FADE-DEPTHWRITE, matching the host
      // wall + WallSegment + door) — including the glass, so every transparent
      // surface writes depth and sorts consistently. Flipping it (the old
      // `!isGlass && !fading`) snapped the frame's thickness from a see-through
      // blend to solid 3D mid-fade (the "pops between 2D and 3D" bug) and left the
      // frame (dw off while fading) sorting inconsistently against the glass and
      // the host wall, bleeding the backdrop through their overlap.
      m.depthWrite = true
      // Non-glass parts flip transparent on/off with the wall fade; recompile
      // on the transition so the blend actually engages (glass is always
      // transparent, so it never needs this).
      if (!isGlass && opaqueChanged) m.needsUpdate = true
    })
  })
  if (!wall) return null
  const dx = wall.end[0] - wall.start[0]
  const dz = wall.end[1] - wall.start[1]
  const length = Math.hypot(dx, dz)
  const angle = Math.atan2(dz, dx)
  const midX = (wall.start[0] + wall.end[0]) / 2
  const midZ = (wall.start[1] + wall.end[1]) / 2
  const localX = spec.offset + spec.width / 2 - length / 2
  const h = spec.head - spec.sill
  const w = spec.width
  const cy = spec.sill + h / 2

  // Mullions: wide windows get a vertical divider (sliding-window style),
  // tall ones a horizontal transom.
  const verticalMullion = w > 1.2
  const horizontalMullion = h > 1.5

  // Sash-type additions (casement/awning/hopper/transom): `sashFrameInstances`
  // already uses this component's own `x=width, y=height, z=depth` frame (see
  // `windowGrilleLayout.ts` header), so no remap is needed here (unlike the
  // louvre/cable helpers below, which are fixed to `PlanShell`'s native
  // x=depth/z=width frame and DO need their x/z swapped).
  const sashMembers = sashFrameInstances(w - FRAME_T, h - FRAME_T, style)
  const louvreSlats: GrilleMemberInstance[] =
    style === 'louvre'
      ? louvreSlatInstances(w - FRAME_T, h - FRAME_T).map((m) => ({
          position: [m.position[2], m.position[1], m.position[0]],
          size: [m.size[2], m.size[1], m.size[0]],
        }))
      : []
  const invisibleCables: GrilleMemberInstance[] =
    style === 'invisible-grille'
      ? invisibleGrilleCableInstances(w - FRAME_T, h - FRAME_T).map((m) => ({
          position: [m.position[2], m.position[1], m.position[0]],
          size: [m.size[2], m.size[1], m.size[0]],
        }))
      : []
  const glassBlocks: GrilleMemberInstance[] = isGlassBlock
    ? glassBlockInstances(w - FRAME_T, h - FRAME_T)
    : []
  const tilt = sashOpenTilt(style)

  const glazingContent = (
    <>
      {/* Glass — real transmission on High/Maximum, cheap transparency below
          (PHOTO-GLASS). Both keep the sky-catch emissive + day/night blend +
          wall-fade opacity compose; only the see-through mechanism differs. */}
      <mesh userData={markGlazing()}>
        <boxGeometry args={[w - FRAME_T, h - FRAME_T, GLASS_D]} />
        {glassPhysical ? (
          <meshPhysicalMaterial
            ref={glassRef}
            color={paneColor}
            emissive={GLASS_SKYCATCH_COLOR}
            emissiveIntensity={0.4}
            roughness={paneRoughness}
            metalness={glassPhysical.metalness}
            transmission={0.9}
            ior={glassPhysical.ior}
            thickness={glassPhysical.thickness}
            attenuationColor={glassPhysical.attenuationColor}
            attenuationDistance={glassPhysical.attenuationDistance}
            transparent
            opacity={1}
          />
        ) : (
          <meshStandardMaterial
            ref={glassRef}
            color={glassParams.color}
            emissive={GLASS_SKYCATCH_COLOR}
            emissiveIntensity={0.4}
            roughness={glassParams.roughness}
            metalness={0.1}
            transparent
            opacity={glassParams.opacityCheap}
          />
        )}
      </mesh>
      {/* Outer frame */}
      <Bar w={w} h={FRAME_T} x={0} y={h / 2 - FRAME_T / 2} />
      <Bar w={w} h={FRAME_T} x={0} y={-h / 2 + FRAME_T / 2} />
      <Bar w={FRAME_T} h={h} x={-w / 2 + FRAME_T / 2} y={0} />
      <Bar w={FRAME_T} h={h} x={w / 2 - FRAME_T / 2} y={0} />
      {/* Mullions */}
      {verticalMullion && <Bar w={FRAME_T * 0.8} h={h} x={0} y={0} detail />}
      {horizontalMullion && <Bar w={w} h={FRAME_T * 0.8} x={0} y={0} detail />}
      {/* Safety grille — slim vertical bars on the interior side, now opt-in
          via `style: 'grille'` (GLASS-KINDS) rather than always-on. */}
      {style === 'grille' && <Grille w={w - FRAME_T} h={h - FRAME_T} />}
      {louvreSlats.length > 0 && (
        <InstancedBoxes instances={louvreSlats} castShadow userData={markWallOverlay()}>
          <meshStandardMaterial color="#cfd2d4" roughness={0.5} metalness={0.4} />
        </InstancedBoxes>
      )}
      {invisibleCables.length > 0 && (
        <InstancedCylinders
          instances={invisibleCables}
          radialSegments={6}
          userData={markWallOverlay()}
        >
          <MetalMaterial
            color="#d7dade"
            roughness={0.3}
            metalness={0.7}
            transparent
            opacity={0.4}
          />
        </InstancedCylinders>
      )}
      {sashMembers.length > 0 && (
        <InstancedBoxes instances={sashMembers} castShadow userData={markWallOverlay()}>
          <meshStandardMaterial color="#e6e7e4" roughness={0.45} metalness={0.35} />
        </InstancedBoxes>
      )}
      {glassBlocks.length > 0 && (
        <InstancedBoxes instances={glassBlocks} castShadow>
          <meshStandardMaterial
            color={glassParams.color}
            roughness={glassParams.roughness}
            transparent
            opacity={0.75}
          />
        </InstancedBoxes>
      )}
    </>
  )

  return (
    <group ref={groupRef} position={[midX, 0, midZ]} rotation={[0, -angle, 0]}>
      <group position={[localX, cy, 0]}>
        {tilt ? (
          <group
            position={[0, (tilt.pivotY * h) / 2, 0]}
            rotation={[tilt.pivotY * tilt.angleRad * -1, 0, 0]}
          >
            <group position={[0, (-tilt.pivotY * h) / 2, 0]}>{glazingContent}</group>
          </group>
        ) : (
          glazingContent
        )}
      </group>
      {/* Interior sill ledge (kept OUTSIDE the hinge-tilt group — a real sill
          doesn't tilt with an open awning/hopper sash). */}
      <mesh
        position={[localX, spec.sill - 0.02, WINDOW_SILL_LEDGE_Z]}
        castShadow
        receiveShadow
        userData={markWallOverlay()}
      >
        <boxGeometry args={[w + 0.1, 0.04, WINDOW_SILL_LEDGE_DEPTH]} />
        <meshStandardMaterial color="#eceae4" roughness={0.7} />
      </mesh>
    </group>
  )
}

export function Windows() {
  return (
    <group>
      {WINDOWS.map((w) => (
        <WindowPane key={w.id} spec={w} />
      ))}
    </group>
  )
}
