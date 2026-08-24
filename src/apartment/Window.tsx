import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  Color,
  type Group,
  Mesh,
  type MeshPhysicalMaterial,
  type MeshStandardMaterial,
} from 'three'
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
  windowGlassPhysical,
  windowTransmission,
} from '../materials/materialRealism'
import { getFixtureGlow } from '../scene/lighting/fixtureGlow'
import { useStore } from '../state/store'
import { WALLS, WINDOWS } from './constants'
import type { WallSpec, WindowSpec } from './types'
import { getWallOpacity } from './walls/wallReveal'

function findWall(wallId: string): WallSpec | undefined {
  return WALLS.find((w) => w.id === wallId)
}

const FRAME_T = 0.05 // frame bar thickness

// Glass tint by daylight: a clear cool pane in daytime → a dark reflective pane
// at night (so windows read as real glass — bright by day, near-black at night).
// Lerped each frame from the shared darkness signal; allocation-free.
const GLASS_DAY = new Color('#bcd4e6')
const GLASS_NIGHT = new Color('#20272f')
const FRAME_D = 0.08 // frame depth (across the wall)
const GLASS_D = 0.02

const frameMat = { color: '#e6e7e4', roughness: 0.45, metalness: 0.35 } as const

function Bar({ w, h, x, y }: { w: number; h: number; x: number; y: number }) {
  return (
    <mesh position={[x, y, 0]} castShadow>
      <boxGeometry args={[w, h, FRAME_D]} />
      <meshStandardMaterial {...frameMat} />
    </mesh>
  )
}

const GRILLE_Z = 0.05 // interior offset, in front of the glass
const grilleMat = { color: '#d9dadc', roughness: 0.45, metalness: 0.5 } as const

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
  const members: GrilleMemberInstance[] = grilleBarInstances(w, h).map((m) => ({
    position: [m.position[2], m.position[1], m.position[0]],
    size: [m.size[2], m.size[1], m.size[0]],
  }))
  return (
    <group position={[0, 0, GRILLE_Z]}>
      <InstancedBoxes instances={members}>
        <MetalMaterial {...grilleMat} />
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
  // Fade the whole window (frame, grille, sill + glass) WITH its host wall during
  // the orbit dollhouse reveal — otherwise an opaque frame/grille floats in a
  // translucent wall. Glass also tints by daylight (clear by day → dark at night).
  useFrame(() => {
    const g = groupRef.current
    if (!g) return
    const wallOp = getWallOpacity(spec.wallId)
    g.visible = wallOp > 0.02
    if (!g.visible) return
    const d = getFixtureGlow() // 1 at night, 0 in daylight
    const glass = glassRef.current
    // Cheap tiers tell the day/night story with opacity (more opaque at night);
    // transmission tiers keep alpha at 1 (opacity is reserved for the wall-fade
    // compose) and tell it with transmission instead — clear refractive pane by
    // day, near-solid dark reflective pane at night (PHOTO-GLASS). Glass-block
    // glazing reads via its own block grid, not this backing pane, so it
    // shrinks to near-invisible instead of the normal opacity story.
    const glassBase = isGlassBlock ? 0.12 : glassPhysical ? 1 : 0.28 + d * 0.45
    if (glass) {
      if (isClearGlass) {
        glass.color.lerpColors(GLASS_DAY, GLASS_NIGHT, d)
      } else {
        glass.color.set(glassParams.color)
      }
      glass.emissiveIntensity = glassSkyCatchIntensity(1 - d)
      if (glassPhysical) {
        ;(glass as MeshPhysicalMaterial).transmission =
          windowTransmission(1 - d) * (glassParams.transmission / 0.9)
      }
    }
    const fading = wallOp < 0.985
    const opaqueChanged = fading !== opaqueTransparentRef.current
    opaqueTransparentRef.current = fading
    g.traverse((o) => {
      if (!(o instanceof Mesh)) return
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
      <mesh>
        <boxGeometry args={[w - FRAME_T, h - FRAME_T, GLASS_D]} />
        {glassPhysical ? (
          <meshPhysicalMaterial
            ref={glassRef}
            color={glassParams.color}
            emissive={GLASS_SKYCATCH_COLOR}
            emissiveIntensity={0.4}
            roughness={Math.max(glassPhysical.roughness, glassParams.roughness)}
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
      {verticalMullion && <Bar w={FRAME_T * 0.8} h={h} x={0} y={0} />}
      {horizontalMullion && <Bar w={w} h={FRAME_T * 0.8} x={0} y={0} />}
      {/* Safety grille — slim vertical bars on the interior side, now opt-in
          via `style: 'grille'` (GLASS-KINDS) rather than always-on. */}
      {style === 'grille' && <Grille w={w - FRAME_T} h={h - FRAME_T} />}
      {louvreSlats.length > 0 && (
        <InstancedBoxes instances={louvreSlats} castShadow>
          <meshStandardMaterial color="#cfd2d4" roughness={0.5} metalness={0.4} />
        </InstancedBoxes>
      )}
      {invisibleCables.length > 0 && (
        <InstancedCylinders instances={invisibleCables} radialSegments={6}>
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
        <InstancedBoxes instances={sashMembers} castShadow>
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
      <mesh position={[localX, spec.sill - 0.02, 0.06]} castShadow receiveShadow>
        <boxGeometry args={[w + 0.1, 0.04, 0.16]} />
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
