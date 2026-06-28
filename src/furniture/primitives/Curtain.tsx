import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { type BufferGeometry, type Group, PlaneGeometry } from 'three'
import { getDraperyMaterial } from '../../materials/furnitureMaterials'
import { registerAnimatedSource } from '../../scene/animatedSources'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'

/** How fast the draw animation eases (≈ this fraction of the gap per second·dt). */
const DRAW_SPEED = 3.2
/** Vertical folds modelled per panel (drape into soft waves, not a flat sheet). */
const FOLDS = 6
/** Z-depth (m) of the fabric waves at the hem — the wave amplitude. */
const FOLD_DEPTH = 0.05
/** Plane subdivisions: enough across the width to render smooth folds. */
const SEG_X = FOLDS * 8
const SEG_Y = 5

/**
 * Build one wavy curtain panel: a vertical fabric sheet spanning local X
 * [-0.5, 0.5] and Y [0, height], displaced in +Z by `FOLDS` sinusoidal vertical
 * folds (gathered tighter at the rod, fuller at the hem) so it reads as soft
 * draped fabric rather than a straight board. Both panels share this one
 * geometry; the draw animation scales/positions them (the folds compress into a
 * gather as a panel bunches to the side).
 */
function buildWavyPanel(panelHeight: number): BufferGeometry {
  const geo = new PlaneGeometry(1, panelHeight, SEG_X, SEG_Y)
  geo.translate(0, panelHeight / 2, 0) // anchor the hem at local y=0
  const pos = geo.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    // Gathered (shallower folds) at the rod, fuller toward the hem.
    const taper = 0.5 + 0.5 * (1 - y / panelHeight)
    pos.setZ(i, FOLD_DEPTH * Math.sin((x + 0.5) * FOLDS * Math.PI * 2) * taper)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

/** Panel centre-X + width + fold-depth scale for a given draw amount `d`
 *  (0 = open/bunched to the sides, 1 = drawn/meeting in the middle). The `side`
 *  is −1 for the left panel, +1 for the right. */
function panelTransform(d: number, width: number, bunchW: number, side: number) {
  const halfClosed = width / 2
  const covered = bunchW + (halfClosed - bunchW) * d
  // Closed: panel centred over its half. Open: bunched against the outer edge.
  const closedC = (side * halfClosed) / 2
  const openC = side * (halfClosed - bunchW / 2)
  const centreX = openC + (closedC - openC) * d
  // Fuller (deeper) folds when bunched open, settling flatter when drawn.
  const depthScale = 1.8 - 0.8 * d
  return { centreX, covered, depthScale }
}

/**
 * Floor-to-ceiling pleated curtains on a rod, with a **smooth draw animation**
 * (CURTAIN-DRAW) and **soft wavy folds** (not a flat sheet). Two fabric panels
 * hang from the rod: `drawAmount` 1 = drawn (the panels meet in the middle and
 * cover the window), 0 = open (each panel gathers into a narrow bunch at its end,
 * leaving the **whole window exposed**). The primitive eases the rendered panels
 * toward `drawAmount` each frame (holding the demand render-loop open only while
 * moving). `length` picks the drop: `floor` (floor-to-ceiling, default) or `sill`
 * (ceiling to just below the window sill, using the placement-stored `sillY`).
 * Placement sizes a curtain to its window (wider than the glass — see
 * `placement/windowSnap.ts`). Legacy
 * `style: 'open'|'drawn'` maps to drawAmount 0/1. Light filtering through the
 * window is graduated by the same `drawAmount`. Mounted against a wall (faces +Z).
 */
export function Curtain({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 2.0)
  const height = readNum(props, 'height', 2.75)
  const color = readStr(props, 'color', '#c4b9a6')
  const pattern = readStr(props, 'pattern', 'plain')
  const fabric = readStr(props, 'material', 'cotton')
  // Target draw: explicit `drawAmount` wins; else the legacy `style` flag.
  const drawAmountProp = props.drawAmount
  const target =
    typeof drawAmountProp === 'number'
      ? Math.min(1, Math.max(0, drawAmountProp))
      : readStr(props, 'style', 'drawn') === 'open'
        ? 0
        : 1
  // Fabric-only weave (cotton/linen/sheer/velvet) honouring the tone-on-tone
  // pattern; double-sided so the draped sheet reads from inside AND through glass.
  const fabricMat = getDraperyMaterial(fabric, color, pattern, true)

  // Hem (bottom of the drop): floor-to-ceiling reaches the floor (0); sill-length
  // stops just below the window sill (`sillY`, set by placement; ~0.9 fallback).
  // `height` is always the rod (top), so both lengths hang from the same rod.
  const lengthMode = readStr(props, 'length', 'floor')
  const sillY = readNum(props, 'sillY', 0.9)
  const bottom = lengthMode === 'sill' ? Math.max(0.1, sillY - 0.1) : 0
  const panelHeight = Math.max(0.4, height - bottom)

  const geo = useMemo(() => buildWavyPanel(panelHeight), [panelHeight])
  useEffect(() => () => geo.dispose(), [geo])

  // Each open panel bunches to this width — small enough to clear the window.
  const bunchW = Math.max(0.12, width * 0.07)

  const leftRef = useRef<Group>(null)
  const rightRef = useRef<Group>(null)
  const drawRef = useRef(target)
  const holdRef = useRef<null | (() => void)>(null)
  const invalidate = useThree((s) => s.invalidate)

  const applyDraw = (d: number) => {
    for (const [ref, side] of [
      [leftRef, -1],
      [rightRef, 1],
    ] as const) {
      const g = ref.current
      if (!g) continue
      const t = panelTransform(d, width, bunchW, side)
      g.position.x = t.centreX
      g.scale.set(t.covered, 1, t.depthScale)
    }
  }

  // Ease the rendered draw toward the target each frame; hold the render loop
  // only while moving (demand-mode friendly — no idle battery cost).
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

  const left0 = panelTransform(target, width, bunchW, -1)
  const right0 = panelTransform(target, width, bunchW, 1)

  return (
    <group>
      {/* Rod + finials, just above the drop. */}
      <mesh position={[0, height + 0.04, 0.04]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.015, 0.015, width + 0.2, 10]} />
        <meshStandardMaterial color="#54585e" roughness={0.4} metalness={0.6} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (width / 2 + 0.1), height + 0.04, 0.04]}>
          <sphereGeometry args={[0.025, 12, 8]} />
          <meshStandardMaterial color="#54585e" roughness={0.4} metalness={0.6} />
        </mesh>
      ))}
      {/* Two draped panels (gather to the sides when open), hung from the rod
          down to the hem (`bottom`). */}
      <group ref={leftRef} position={[left0.centreX, bottom, 0.05]} scale={[left0.covered, 1, 1]}>
        <mesh geometry={geo} material={fabricMat} castShadow />
      </group>
      <group
        ref={rightRef}
        position={[right0.centreX, bottom, 0.05]}
        scale={[right0.covered, 1, 1]}
      >
        <mesh geometry={geo} material={fabricMat} castShadow />
      </group>
    </group>
  )
}
