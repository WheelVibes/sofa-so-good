import { useFrame, useThree } from '@react-three/fiber'
import { useRef } from 'react'
import type { Mesh } from 'three'
import { getFabricMaterial } from '../../materials/furnitureMaterials'
import { registerAnimatedSource } from '../../scene/animatedSources'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/** Number of pleats modelled along the rod (constant so they can be animated by
 *  re-positioning rather than re-creating geometry). */
const PLEATS = 14
/** How fast the draw animation eases (≈ this fraction of the gap per second·dt). */
const DRAW_SPEED = 3.2

/**
 * Pleated floor-length curtains on a rod with a **smooth draw animation**
 * (CURTAIN-DRAW). `drawAmount` 1 = fully drawn (evenly-gathered pleats cover the
 * window), 0 = open (pleats bunch into two tied-back panels at the ends, centre
 * clear). The primitive eases the rendered pleat positions toward `drawAmount`
 * each frame (holding the demand render-loop open only while moving), so toggling
 * open/closed animates. Legacy `style: 'open'|'drawn'` maps to drawAmount 0/1 for
 * back-compat. Light filtering through the window is graduated by the same
 * `drawAmount` (`windowLightModifiers.curtainDrawAmount`). Mounted against a wall
 * (faces +Z).
 */
export function Curtain({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 1.8)
  const height = readNum(props, 'height', 2.3)
  const color = readStr(props, 'color', '#c4b9a6')
  const pattern = readStr(props, 'pattern', 'plain')
  // Target draw: explicit `drawAmount` wins; else the legacy `style` flag.
  const drawAmountProp = props.drawAmount
  const target =
    typeof drawAmountProp === 'number'
      ? Math.min(1, Math.max(0, drawAmountProp))
      : readStr(props, 'style', 'drawn') === 'open'
        ? 0
        : 1
  const fabricMat = getFabricMaterial(color, 0.95, pattern)

  const panelW = width * 0.18
  const step = width / PLEATS
  // Closed (draw=1) and open (draw=0) X for each pleat, precomputed.
  const layout = Array.from({ length: PLEATS }, (_, i) => {
    const t = (i + 0.5) / PLEATS
    const closedX = -width / 2 + t * width
    const openX =
      t < 0.5 ? -width / 2 + (t / 0.5) * panelW : width / 2 - panelW + ((t - 0.5) / 0.5) * panelW
    return { closedX, openX, wrinkle: Math.sin(i * 1.7) * 0.035, gather: Math.sin(i * 1.9) * 0.045 }
  })

  const pleatRefs = useRef<(Mesh | null)[]>([])
  const tiebackRefs = useRef<(Mesh | null)[]>([])
  const drawRef = useRef(target)
  const holdRef = useRef<null | (() => void)>(null)
  const invalidate = useThree((s) => s.invalidate)

  const applyDraw = (d: number) => {
    for (let i = 0; i < PLEATS; i++) {
      const m = pleatRefs.current[i]
      if (!m) continue
      const l = layout[i]
      m.position.x = l.openX + (l.closedX - l.openX) * d
      // Deeper gather wrinkle when open (1-d), settling flat-ish when drawn.
      m.position.z = 0.04 + l.wrinkle + (1 - d) * l.gather
    }
    // Tiebacks fade out (scale→0) as the curtain draws closed.
    const tb = Math.max(0, 1 - d * 1.4)
    for (const t of tiebackRefs.current) if (t) t.scale.setScalar(tb)
  }

  // Position from the eased value each frame; hold the render loop only while
  // the draw is actually moving (demand-mode friendly — no idle battery cost).
  useFrame((_, dt) => {
    const cur = drawRef.current
    if (Math.abs(cur - target) < 0.004) {
      if (cur !== target) {
        drawRef.current = target
        applyDraw(target)
        invalidate()
      }
      if (holdRef.current) {
        holdRef.current()
        holdRef.current = null
      }
      return
    }
    if (!holdRef.current) holdRef.current = registerAnimatedSource()
    const k = Math.min(1, dt * DRAW_SPEED)
    drawRef.current = cur + (target - cur) * k
    applyDraw(drawRef.current)
    invalidate()
  })

  const rod = (
    <>
      <mesh position={[0, height + 0.04, 0.02]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.015, 0.015, width + 0.2, 10]} />
        <meshStandardMaterial color="#54585e" roughness={0.4} metalness={0.6} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (width / 2 + 0.1), height + 0.04, 0.02]}>
          <sphereGeometry args={[0.025, 12, 8]} />
          <meshStandardMaterial color="#54585e" roughness={0.4} metalness={0.6} />
        </mesh>
      ))}
    </>
  )

  return (
    <group>
      {rod}
      {layout.map((l, i) => {
        const x0 = l.openX + (l.closedX - l.openX) * target
        return (
          <mesh
            key={`pleat-${i}`}
            ref={(m) => {
              pleatRefs.current[i] = m
            }}
            castShadow
            position={[x0, height / 2, 0.04 + l.wrinkle + (1 - target) * l.gather]}
            material={fabricMat}
          >
            <boxGeometry args={[step * 1.25, height, 0.04]} />
          </mesh>
        )
      })}
      {/* Tieback bands at each end (visible when open, scaled out when drawn). */}
      {[-1, 1].map((s, i) => (
        <mesh
          key={`tieback-${i}`}
          ref={(m) => {
            tiebackRefs.current[i] = m
          }}
          position={[s * (width / 2 - panelW / 2), height * 0.42, 0.1]}
          scale={Math.max(0, 1 - target * 1.4)}
          material={fabricMat}
        >
          <boxGeometry args={[panelW * 0.9, 0.08, 0.14]} />
        </mesh>
      ))}
    </group>
  )
}
