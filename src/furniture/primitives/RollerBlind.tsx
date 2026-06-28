import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import type { Group, Mesh } from 'three'
import { draperyOpacityLevel, draperyVisualOpacity } from '../../materials/draperyOpacity'
import { getDraperyMaterial } from '../../materials/furnitureMaterials'
import { registerAnimatedSource } from '../../scene/animatedSources'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/** How fast the raise/lower animation eases (fraction of the gap per second·dt). */
const LOWER_SPEED = 3.0
/** Drop left showing when fully raised (just the roll under the cassette). */
const MIN_DROP = 0.05

/**
 * Roller / venetian blind that **raises and lowers with a smooth animation**
 * (BLIND-LOWER). A top cassette stays fixed at `height`; the fabric (or slat
 * stack) lowers from it by `lower` × `drop` — `lower` 1 = closed (covers the
 * window), 0 = raised (rolled up under the cassette, window exposed). The
 * primitive eases the rendered drop toward `lower` each frame (holding the demand
 * render-loop open only while moving). Placement sizes a blind slightly wider
 * than its window with a full drop that covers it (see `placement/windowSnap.ts`).
 * Hangs against the wall (faces +Z). Legacy plans (no `lower`) read as fully
 * lowered to their `drop`.
 */
export function RollerBlind({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.3)
  const height = readNum(props, 'height', 2.3)
  const maxDrop = readNum(props, 'drop', 1.7)
  const color = readStr(props, 'color', '#d8d2c4')
  const kind = readStr(props, 'kind', 'roller')
  const pattern = readStr(props, 'pattern', 'plain')
  const rawWeave = readStr(props, 'material', 'cotton')
  const fabric = rawWeave === 'sheer' ? 'cotton' : rawWeave
  const visualOpacity = draperyVisualOpacity(draperyOpacityLevel(props))
  // Target lower fraction: explicit `lower` wins; legacy plans default to 1
  // (fully lowered to their stored `drop`).
  const lowerProp = props.lower
  const target = typeof lowerProp === 'number' ? Math.min(1, Math.max(0, lowerProp)) : 1

  // Fabric-only weave with the tone-on-tone pattern + opacity level; the roller
  // panel is a box (visible both sides) so it needn't be double-sided.
  const fabricMat = getDraperyMaterial(fabric, color, pattern, false, visualOpacity)
  const cassetteY = height - 0.04
  const fabricTop = cassetteY - 0.04
  const metal = { color: '#9a9da2', roughness: 0.4, metalness: 0.6 } as const
  const slatMat = { color, roughness: 0.5, metalness: 0.15 } as const

  // A venetian blind models a fixed stack of slats revealed progressively (they
  // bunch toward the cassette when raised); the roller is a single fabric panel
  // whose height scales with the current drop.
  const SLATS = Math.max(4, Math.round(maxDrop / 0.08))

  const fabricRef = useRef<Mesh>(null)
  const railRef = useRef<Group>(null)
  const slatsRef = useRef<Group>(null)
  const drawRef = useRef(target)
  const holdRef = useRef<null | (() => void)>(null)
  const invalidate = useThree((s) => s.invalidate)

  const applyLower = (l: number) => {
    const drop = MIN_DROP + (maxDrop - MIN_DROP) * l
    const fabric = fabricRef.current
    if (fabric) {
      // Unit-height box (built 1 m tall) scaled to the current drop.
      fabric.scale.y = drop
      fabric.position.y = fabricTop - drop / 2
    }
    const rail = railRef.current
    if (rail) rail.position.y = fabricTop - drop
    const slats = slatsRef.current
    if (slats) {
      // Slats fill [fabricTop-drop, fabricTop]; scaling Y spreads/bunches them.
      slats.scale.y = drop / maxDrop
    }
  }

  useFrame((_, dt) => {
    const cur = drawRef.current
    if (Math.abs(cur - target) < 0.004) {
      if (cur !== target) {
        drawRef.current = target
        applyLower(target)
        invalidate()
      }
      if (holdRef.current) {
        holdRef.current()
        holdRef.current = null
      }
      return
    }
    if (!holdRef.current) holdRef.current = registerAnimatedSource()
    const k = Math.min(1, dt * LOWER_SPEED)
    drawRef.current = cur + (target - cur) * k
    applyLower(drawRef.current)
    invalidate()
  })

  const drop0 = MIN_DROP + (maxDrop - MIN_DROP) * target

  return (
    <group>
      {/* Top cassette / headrail (fixed). */}
      <mesh castShadow position={[0, cassetteY, 0.02]}>
        <boxGeometry args={[width + 0.04, 0.08, 0.1]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      {kind === 'venetian' ? (
        // Slat stack anchored at the cassette top, scaled down toward it as raised.
        <group ref={slatsRef} position={[0, fabricTop, 0]} scale={[1, drop0 / maxDrop, 1]}>
          {Array.from({ length: SLATS }, (_, i) => (
            <mesh
              key={i}
              castShadow
              position={[0, -(maxDrop / SLATS) * (i + 0.5), 0.045]}
              rotation={[0.5, 0, 0]}
            >
              <boxGeometry args={[width, 0.006, 0.06]} />
              <meshStandardMaterial {...slatMat} />
            </mesh>
          ))}
        </group>
      ) : (
        // Single fabric panel: a unit-height (1 m) box scaled to the drop.
        <mesh
          ref={fabricRef}
          castShadow
          position={[0, fabricTop - drop0 / 2, 0.04]}
          scale={[1, drop0, 1]}
          material={fabricMat}
        >
          <boxGeometry args={[width, 1, 0.012]} />
        </mesh>
      )}
      {/* Weighted bottom rail — follows the lowered edge. */}
      <group ref={railRef} position={[0, fabricTop - drop0, 0]}>
        <mesh castShadow position={[0, 0, 0.04]}>
          <boxGeometry args={[width + 0.02, 0.03, 0.03]} />
          <meshStandardMaterial {...metal} />
        </mesh>
      </group>
      {/* Side chain / tilt cord. */}
      <mesh position={[width / 2 + 0.03, cassetteY - 0.35, 0.04]}>
        <cylinderGeometry args={[0.004, 0.004, 0.7, 6]} />
        <meshStandardMaterial color="#b8bcc0" roughness={0.5} metalness={0.4} />
      </mesh>
    </group>
  )
}
