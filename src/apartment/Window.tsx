import { useFrame } from '@react-three/fiber'
import { useRef } from 'react'
import {
  Color,
  type Group,
  Mesh,
  type MeshPhysicalMaterial,
  type MeshStandardMaterial,
} from 'three'
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

const GRILLE_T = 0.012 // bar thickness
const GRILLE_Z = 0.05 // interior offset, in front of the glass
const GRILLE_SPACING = 0.12 // gap between vertical bars
const grilleMat = { color: '#d9dadc', roughness: 0.45, metalness: 0.5 } as const

/** Slim vertical bar grille with a single horizontal rail, sized to the
 *  glazed opening. Bars sit just inside the glass so they read from the room
 *  and through the window from outside. */
function Grille({ w, h }: { w: number; h: number }) {
  const count = Math.max(2, Math.round(w / GRILLE_SPACING))
  const step = w / (count + 1)
  const bars: number[] = []
  for (let i = 1; i <= count; i++) bars.push(-w / 2 + i * step)
  return (
    <group position={[0, 0, GRILLE_Z]}>
      {bars.map((x, i) => (
        <mesh key={i} position={[x, 0, 0]}>
          <boxGeometry args={[GRILLE_T, h, GRILLE_T]} />
          <meshStandardMaterial {...grilleMat} />
        </mesh>
      ))}
      {/* horizontal rail at mid-height */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[w, GRILLE_T, GRILLE_T]} />
        <meshStandardMaterial {...grilleMat} />
      </mesh>
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
    // day, near-solid dark reflective pane at night (PHOTO-GLASS).
    const glassBase = glassPhysical ? 1 : 0.28 + d * 0.45
    if (glass) {
      glass.color.lerpColors(GLASS_DAY, GLASS_NIGHT, d)
      glass.emissiveIntensity = glassSkyCatchIntensity(1 - d)
      if (glassPhysical) (glass as MeshPhysicalMaterial).transmission = windowTransmission(1 - d)
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

  return (
    <group ref={groupRef} position={[midX, 0, midZ]} rotation={[0, -angle, 0]}>
      <group position={[localX, cy, 0]}>
        {/* Glass — real transmission on High/Maximum, cheap transparency below
            (PHOTO-GLASS). Both keep the sky-catch emissive + day/night blend +
            wall-fade opacity compose; only the see-through mechanism differs. */}
        <mesh>
          <boxGeometry args={[w - FRAME_T, h - FRAME_T, GLASS_D]} />
          {glassPhysical ? (
            <meshPhysicalMaterial
              ref={glassRef}
              color="#bcd4e6"
              emissive={GLASS_SKYCATCH_COLOR}
              emissiveIntensity={0.4}
              roughness={glassPhysical.roughness}
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
              color="#bcd4e6"
              emissive={GLASS_SKYCATCH_COLOR}
              emissiveIntensity={0.4}
              roughness={0.05}
              metalness={0.1}
              transparent
              opacity={0.28}
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
        {/* Safety grille — slim vertical bars on the interior side, a
            near-universal HDB window feature. */}
        <Grille w={w - FRAME_T} h={h - FRAME_T} />
      </group>
      {/* Interior sill ledge */}
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
