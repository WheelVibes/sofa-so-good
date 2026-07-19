import { useMemo } from 'react'
import { getGlassMaterial, getSurfaceMaterial } from '../../materials/furnitureMaterials'
import { useStore } from '../../state/store'
import type { ParamProps } from '../types'
import { type BoxInstance, InstancedBoxes, InstancedCylinders } from './InstancedBoxes'
import { readNum, readStr } from './shared'
import { battenCount, battenOffset, battenStep } from './slatLayout'

/**
 * Fluted glass partition — a floor-standing framed screen glazed with fluted
 * (vertically ribbed) translucent glass, the modern SG zoning staple (entry
 * foyer / living-dining split). A slim framed carcass (two posts + top/bottom
 * rails) holds a translucent backing pane fronted by a run of half-round glass
 * ribs (the flutes). Parametric width/height. Thin footprint, tall; a real
 * obstacle (collides). Faces +Z, real metres.
 */
export function FlutedPartition({ props }: { props: ParamProps }) {
  const tier = useStore((s) => s.qualityTier)
  const width = readNum(props, 'width', 1.2)
  const height = readNum(props, 'height', 2.1)
  const frameColor = readStr(props, 'frameColor', '#2b2b2b')
  const frameFinish = readStr(props, 'frameFinish', 'painted')
  const glassColor = readStr(props, 'glassColor', '#dfe7e6')
  const sheen = readNum(props, 'sheen', 0.2)

  const frameMat = getSurfaceMaterial(frameFinish, frameColor, 1.2, sheen)
  // Frosted fluted glass reads less clear than window glass → a higher opacity
  // fallback on the cheap tier and a bit of volume tint under transmission.
  const glass = getGlassMaterial(tier, glassColor, 0.55, 0.08)

  const frameT = 0.05
  const depth = 0.06
  const innerW = width - frameT * 2
  const innerH = height - frameT * 2

  // Frame: two posts + top/bottom rails, collapsed to one instanced draw call.
  const frameBoxes: BoxInstance[] = [
    { position: [-(width / 2 - frameT / 2), height / 2, 0], size: [frameT, height, depth] },
    { position: [width / 2 - frameT / 2, height / 2, 0], size: [frameT, height, depth] },
    { position: [0, frameT / 2, 0], size: [width - frameT * 2, frameT, depth] },
    { position: [0, height - frameT / 2, 0], size: [width - frameT * 2, frameT, depth] },
  ]

  // Rib layout (half-round vertical flutes) across the inner width. Every rib is
  // an identical half-cylinder (radius ribR, height innerH) sharing ONE glass
  // material → one `InstancedCylinders` draw call, exactly like the drying-rack
  // rods (previously one mesh per rib — a wide screen ran to ~30 draw calls).
  // A unit cylinder scaled `[ribR, innerH, ribR]` with `thetaLength={PI}` is the
  // byte-exact equivalent of the old `cylinderGeometry(ribR, ribR, innerH, 10, 1,
  // false, 0, PI)` mesh at `position={[x, height/2, depth*0.22]}` (no rotation,
  // uniform radius scale preserves the half-round cross-section).
  const ribR = 0.016
  const gap = 0.006
  const ribInstances = useMemo<BoxInstance[]>(() => {
    const n = battenCount(innerW, ribR * 2, gap)
    const step = battenStep(innerW, ribR * 2, n)
    return Array.from({ length: n }, (_, i) => ({
      position: [battenOffset(innerW, ribR * 2, step, i), height / 2, depth * 0.22],
      size: [ribR, innerH, ribR],
    }))
  }, [innerW, innerH, height])

  return (
    <group>
      <InstancedBoxes instances={frameBoxes} castShadow receiveShadow>
        <primitive object={frameMat} attach="material" />
      </InstancedBoxes>
      {/* Translucent backing pane (thin, centred in the frame depth). */}
      <mesh position={[0, height / 2, 0]} material={glass}>
        <boxGeometry args={[innerW, innerH, depth * 0.45]} />
      </mesh>
      {/* Half-round glass ribs proud of the pane front (the flutes) — one draw call. */}
      <InstancedCylinders
        instances={ribInstances}
        radialSegments={10}
        thetaLength={Math.PI}
        castShadow
      >
        <primitive object={glass} attach="material" />
      </InstancedCylinders>
    </group>
  )
}
