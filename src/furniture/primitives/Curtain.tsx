import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { type BufferGeometry, type Group, PlaneGeometry } from 'three'
import { useFeature } from '../../features/useFeature'
import { draperyOpacityLevel, draperyVisualOpacity } from '../../materials/draperyOpacity'
import { getDraperyMaterial } from '../../materials/furnitureMaterials'
import { registerAnimatedSource } from '../../scene/animatedSources'
import { pulseShadowRefreshForMotion } from '../../scene/shadowRefreshSignal'
import { CURTAIN_PANEL_BASE_Z, CURTAIN_ROD_PANEL_OFFSET } from '../placement/curtainStandoff'
import { CURTAIN_FLUSH_DEFAULT_STANDOFF, CURTAIN_SILL_STANDOFF } from '../placement/windowSnap'
import type { ParamProps } from '../types'
import { MetalMaterial } from './MetalMaterial'
import { readNum, readStr } from './shared'

/** How fast the draw animation eases (≈ this fraction of the gap per second·dt). */
const DRAW_SPEED = 3.2
/** Vertical folds modelled per panel (drape into soft waves, not a flat sheet). */
const FOLDS = 6
/** Z-depth (m) of the fabric waves at the hem — the wave amplitude. */
const FOLD_DEPTH = 0.05
/** Plane subdivisions: enough across the width to render smooth folds, and
 *  enough DOWN the drop to render the fold drift (CURTAIN-DRIFT) — at the old
 *  `SEG_Y = 5` a wandering fold renders as five straight facets. 48x12 quads is
 *  still trivial next to any furniture piece. */
const SEG_X = FOLDS * 8
const SEG_Y = 12

/**
 * The +Z displacement of the fabric at local `(x, y)`, where `x` runs −0.5…0.5
 * across the panel and `y` runs 0 (hem) … `panelHeight` (rod).
 *
 * CURTAIN-DRIFT. The original profile was a pure sine in `x` with no `y` term,
 * which makes the panel a literal EXTRUSION: every horizontal cross-section
 * identical, so it renders as flat parallel ribbons of constant width — the same
 * "corrugated card" tell the furniture grain had. Real drapery is pinned at the
 * rod and free at the hem, so its folds *wander* as they fall.
 *
 * Two terms add that, both smooth and deterministic (no RNG — the geometry is
 * built once and shared by both panels):
 *  - a **phase drift** that grows from 0 at the rod toward the hem, so the folds
 *    lean and meander instead of dropping plumb;
 *  - a small **per-fold amplitude variation**, so neighbouring folds are not
 *    identical twins.
 *
 * Depth is deliberately NOT increased: `windowSnap`'s standoff is sized against
 * the current amplitude, and a deeper wave would poke the fabric through the
 * window sill.
 */
export function curtainFoldZ(
  x: number,
  y: number,
  panelHeight: number,
  folds = FOLDS,
  depth = FOLD_DEPTH,
): number {
  const h = panelHeight > 0 ? panelHeight : 1
  const t = Math.max(0, Math.min(1, y / h)) // 0 hem … 1 rod
  // Gathered (shallower folds) at the rod, fuller toward the hem.
  const taper = 0.5 + 0.5 * (1 - t)
  // Pinned at the rod (drift → 0 at t = 1), free at the hem.
  const drift = 1.8 * (1 - t) * Math.sin(t * Math.PI * 1.6 + 0.7)
  const u = (x + 0.5) * folds * Math.PI * 2
  const amp = 1 + 0.18 * Math.sin(u * 0.5 + 1.3)
  return depth * amp * taper * Math.sin(u + drift)
}

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
    pos.setZ(i, curtainFoldZ(pos.getX(i), pos.getY(i), panelHeight))
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
  // Weave (cotton/linen/velvet); a legacy `material: 'sheer'` is a cotton weave
  // whose translucency now comes from the opacity axis below.
  const rawWeave = readStr(props, 'material', 'cotton')
  const fabric = rawWeave === 'sheer' ? 'cotton' : rawWeave
  // Opacity / light-blocking (sheer → blackout) drives the see-through look.
  const opacityLevel = draperyOpacityLevel(props)
  const visualOpacity = draperyVisualOpacity(opacityLevel)
  // Target draw: explicit `drawAmount` wins; else the legacy `style` flag.
  const drawAmountProp = props.drawAmount
  const target =
    typeof drawAmountProp === 'number'
      ? Math.min(1, Math.max(0, drawAmountProp))
      : readStr(props, 'style', 'drawn') === 'open'
        ? 0
        : 1
  // Fabric-only weave honouring the tone-on-tone pattern + the opacity level;
  // double-sided so the draped sheet reads from inside AND through glass.
  const fabricMat = getDraperyMaterial(fabric, color, pattern, true, visualOpacity)

  // Hem (bottom of the drop): floor-to-ceiling reaches the floor (0); sill-length
  // stops just below the window sill (`sillY`, set by placement; ~0.9 fallback).
  // `height` is always the rod (top), so both lengths hang from the same rod.
  const lengthMode = readStr(props, 'length', 'floor')
  const sillY = readNum(props, 'sillY', 0.9)
  const bottom = lengthMode === 'sill' ? Math.max(0.1, sillY - 0.1) : 0
  const panelHeight = Math.max(0.4, height - bottom)
  // Standoff from the wall (m): the snap plants the origin on the wall CENTRE-line,
  // and a typical HDB window has an interior sill that projects past the face into
  // the room (see `apartment/windowProjection.ts`), which would otherwise poke
  // through the fabric's fold troughs. Placement sets a standoff (via
  // `windowFixtureProps`); the DEFAULT for an item with no `standoff` prop (a
  // legacy save from before the prop existed) is the same clearing value —
  // curtains are window-bound, so there is no "free-placed against a bare wall"
  // case where flush would be safe; a 0 default left legacy curtains' folds
  // embedded in the wall/sill (the living-room bug). The rod/finials shift with
  // the panels so the drape hangs plumb.
  // (CURTAIN-FLUSH) derives it from the host wall's FACE + the window's real
  // interior projection (`placement/curtainStandoff.ts`); with the flag off the
  // old fixed centre-line value is used, byte-identically.
  const flush = useFeature('curtainFlush')
  const standoff = readNum(
    props,
    'standoff',
    flush ? CURTAIN_FLUSH_DEFAULT_STANDOFF : CURTAIN_SILL_STANDOFF,
  )
  const panelZ = CURTAIN_PANEL_BASE_Z + standoff
  const rodZ = panelZ + CURTAIN_ROD_PANEL_OFFSET

  const geo = useMemo(() => buildWavyPanel(panelHeight), [panelHeight])
  useEffect(() => () => geo.dispose(), [geo])

  // Each open panel bunches to this width — small enough to clear the window.
  const bunchW = Math.max(0.12, width * 0.07)

  const leftRef = useRef<Group>(null)
  const rightRef = useRef<Group>(null)
  const drawRef = useRef(target)
  const holdRef = useRef<null | (() => void)>(null)
  const invalidate = useThree((s) => s.invalidate)

  // Release the animated-source hold if we unmount mid-draw — otherwise a curtain
  // removed/hidden while easing leaks a RenderPump registration.
  useEffect(
    () => () => {
      holdRef.current?.()
      holdRef.current = null
    },
    [],
  )

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
    // The draped panels cast sun shadows and are moving this frame → keep the
    // frozen shadow map refreshing through the draw animation (PERF-MAX-1).
    pulseShadowRefreshForMotion()
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
      <mesh position={[0, height + 0.04, rodZ]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.015, 0.015, width + 0.2, 10]} />
        <MetalMaterial color="#54585e" roughness={0.4} metalness={0.6} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (width / 2 + 0.1), height + 0.04, rodZ]}>
          <sphereGeometry args={[0.025, 12, 8]} />
          <MetalMaterial color="#54585e" roughness={0.4} metalness={0.6} />
        </mesh>
      ))}
      {/* Two draped panels (gather to the sides when open), hung from the rod
          down to the hem (`bottom`). */}
      <group ref={leftRef} position={[left0.centreX, bottom, panelZ]} scale={[left0.covered, 1, 1]}>
        <mesh geometry={geo} material={fabricMat} castShadow />
      </group>
      <group
        ref={rightRef}
        position={[right0.centreX, bottom, panelZ]}
        scale={[right0.covered, 1, 1]}
      >
        <mesh geometry={geo} material={fabricMat} castShadow />
      </group>
    </group>
  )
}
