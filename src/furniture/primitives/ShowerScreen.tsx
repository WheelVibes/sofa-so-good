import { useMemo } from 'react'
import { getGlassMaterial } from '../../materials/furnitureMaterials'
import { useStore } from '../../state/store'
import type { ParamProps } from '../types'
import { type BoxInstance, InstancedBoxes, InstancedCylinders } from './InstancedBoxes'
import { metalLeg, readNum, readStr } from './shared'
import { battenCount, battenOffset, battenStep } from './slatLayout'

/**
 * Shower screen / glass enclosure (BSJ-6) — the SG wet-area staple missing from
 * the catalog (the `fluted-partition` is decor, not a bathroom screen). A slim
 * framed tempered-glass fixed panel with a floor track + head rail + two posts,
 * and an OPTIONAL perpendicular return panel (the L-wing that boxes in a corner
 * shower). Clear or fluted glazing. Wall-flush, floor-anchored, footprint-centred,
 * faces +Z, real metres.
 */
export function ShowerScreen({ props }: { props: ParamProps }) {
  const tier = useStore((s) => s.qualityTier)
  const width = readNum(props, 'width', 0.9)
  const height = readNum(props, 'height', 2.0)
  const frameColor = readStr(props, 'frameColor', '#c9ccd0')
  const glassColor = readStr(props, 'glassColor', '#d7e3e6')
  const glazing = readStr(props, 'glazing', 'clear') // 'clear' | 'fluted'
  const returnPanel = readStr(props, 'return', 'none') // 'none' | 'left' | 'right'
  const returnDepth = readNum(props, 'returnDepth', 0.4)

  const metal = metalLeg(frameColor, 'stainless')
  // Clear shower glass is more transparent than the frosted fluted partition.
  const clearOpacity = glazing === 'fluted' ? 0.5 : 0.22
  const glass = getGlassMaterial(tier, glassColor, clearOpacity, 0.04)

  const frameT = 0.035 // frame member thickness
  const depth = 0.05 // frame profile depth
  const trackH = 0.03 // floor track height
  const railH = frameT
  const innerW = Math.max(0.1, width - frameT * 2)
  const paneH = Math.max(0.1, height - trackH - railH)
  const paneCY = trackH + paneH / 2

  // Frame: two posts + head rail + floor track — one instanced draw call.
  const frame: BoxInstance[] = [
    { position: [-(width / 2 - frameT / 2), height / 2, 0], size: [frameT, height, depth] },
    { position: [width / 2 - frameT / 2, height / 2, 0], size: [frameT, height, depth] },
    { position: [0, height - railH / 2, 0], size: [innerW, railH, depth] },
    { position: [0, trackH / 2, 0], size: [width, trackH, depth] },
  ]

  // Optional return panel: a perpendicular glazed wing running back along −Z from
  // one post, with its own outer post + top rail + track (kept structurally sound).
  const sign = returnPanel === 'left' ? -1 : 1
  const postX = sign * (width / 2 - frameT / 2)
  const rd = Math.max(0.15, returnDepth)
  const retFrame: BoxInstance[] =
    returnPanel === 'none'
      ? []
      : [
          // outer post at the back end of the wing
          { position: [postX, height / 2, -rd + frameT / 2], size: [frameT, height, depth] },
          // head rail + floor track spanning the wing depth
          { position: [postX, height - railH / 2, -rd / 2], size: [depth, railH, rd] },
          { position: [postX, trackH / 2, -rd / 2], size: [depth, trackH, rd] },
        ]

  // Fluted ribs (only when glazing === 'fluted'): half-round vertical flutes over
  // the pane inner width, one InstancedCylinders draw call (same as FlutedPartition).
  const ribR = 0.014
  const ribInstances = useMemo<BoxInstance[]>(() => {
    if (glazing !== 'fluted') return []
    const n = battenCount(innerW, ribR * 2, 0.006)
    const step = battenStep(innerW, ribR * 2, n)
    return Array.from({ length: n }, (_, i) => ({
      position: [battenOffset(innerW, ribR * 2, step, i), paneCY, depth * 0.22],
      size: [ribR, paneH, ribR],
    }))
  }, [glazing, innerW, paneH, paneCY])

  return (
    <group>
      <InstancedBoxes instances={[...frame, ...retFrame]} castShadow receiveShadow>
        <primitive object={metal} attach="material" />
      </InstancedBoxes>
      {/* Main fixed glass pane */}
      <mesh position={[0, paneCY, 0]} material={glass} castShadow>
        <boxGeometry args={[innerW, paneH, depth * 0.3]} />
      </mesh>
      {/* Return-wing glass pane */}
      {returnPanel !== 'none' ? (
        <mesh position={[postX, paneCY, -rd / 2]} material={glass} castShadow>
          <boxGeometry args={[depth * 0.3, paneH, Math.max(0.05, rd - frameT)]} />
        </mesh>
      ) : null}
      {ribInstances.length > 0 ? (
        <InstancedCylinders
          instances={ribInstances}
          radialSegments={10}
          thetaLength={Math.PI}
          castShadow
        >
          <primitive object={glass} attach="material" />
        </InstancedCylinders>
      ) : null}
    </group>
  )
}
