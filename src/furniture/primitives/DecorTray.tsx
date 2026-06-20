import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import { hexToRgb } from '../../materials/procedural/noise'
import type { ParamProps } from '../types'
import { readNum, readStr } from './shared'
import { seg, useDetail } from './useDetail'

/**
 * Decorative tray — a shallow rectangular tray (flat base, low bevelled rim)
 * resting on `surfaceHeight`, holding a tasteful little vignette of 2–3 small
 * objects: a stubby pillar candle, a small round bowl/vase, and a folded
 * book / coaster stack. A styling staple for coffee-tables, consoles,
 * sideboards and ottomans — distinct from `CandleCluster` (just candles on a
 * plate) and `TabletopDecor` (a taller books-and-vase set).
 *
 * Rests at `surfaceHeight` (self-lifts in local space). Footprint-centred,
 * facing +Z, built in real metres with real three `Material`s. The object set
 * varies by `style`/`fullness`, and per-slot colours/sizes are derived
 * deterministically from the slot index (no RNG) so the vignette reads as a
 * curated mix yet stays pure. Everything sits ON the tray base (offset above
 * `surfaceHeight`), and the tray base sits just above the surface — so nothing
 * floats, clips or z-fights.
 */
export function DecorTray({ props }: { props: ParamProps }) {
  const surfaceH = readNum(props, 'surfaceHeight', 0.42)
  const trayColor = readStr(props, 'trayColor', '#b8987a')
  const trayFinish = readStr(props, 'trayFinish', 'wood')
  const accentColor = readStr(props, 'accentColor', '#7a8a7c')
  const style = readStr(props, 'style', 'mixed') // 'mixed' | 'candles' | 'minimal'
  const fullness = readStr(props, 'fullness', 'full') // 'full' | 'sparse'

  const trayMat = getSurfaceMaterial(trayFinish, trayColor, 1, 0.15)
  const r = seg(16, useDetail())

  // ── Tray geometry (real metres) ──────────────────────────────────────────
  const trayW = 0.34 // long axis (X)
  const trayD = 0.22 // short axis (Z)
  const baseH = 0.014 // thin flat base slab
  const rimH = 0.026 // low rim wall height above the base top
  const rimT = 0.012 // rim wall thickness
  const lift = 0.004 // tray sits just clear of the surface (avoids z-fight)

  const baseTopY = lift + baseH // top face of the base, where objects rest
  const innerW = trayW - rimT * 2
  const innerD = trayD - rimT * 2

  // Seeded-by-index tint helper around the accent colour (deterministic, no RNG).
  const [ar, ag, ab] = hexToRgb(accentColor)
  const tint = (f: number) =>
    `rgb(${Math.round(Math.min(255, ar * f))},${Math.round(Math.min(255, ag * f))},${Math.round(
      Math.min(255, ab * f),
    )})`

  // ── Object set (varies by style/fullness) ─────────────────────────────────
  // Each entry is a small primitive placed within the tray's inner footprint.
  // Slots are laid out along the long axis; sizes/colours derive from the slot
  // index so the vignette varies without any RNG.
  type Obj = 'candle' | 'bowl' | 'books' | 'coasters'
  let objs: Obj[]
  if (style === 'candles')
    objs = fullness === 'sparse' ? ['candle', 'candle'] : ['candle', 'candle', 'candle']
  else if (style === 'minimal') objs = fullness === 'sparse' ? ['bowl'] : ['bowl', 'candle']
  else objs = fullness === 'sparse' ? ['candle', 'bowl'] : ['candle', 'bowl', 'books']

  const n = objs.length
  // X positions evenly across the inner long axis, inset from the rims.
  const usable = innerW * 0.74
  const xAt = (i: number) => (n === 1 ? 0 : (i / (n - 1) - 0.5) * usable)
  // Alternate a small near/far Z offset so objects don't sit in one dead line.
  const zAt = (i: number) => (n === 1 ? 0 : (i % 2 === 0 ? -1 : 1) * innerD * 0.12)

  return (
    <group position={[0, surfaceH, 0]}>
      {/* Tray base — a thin flat slab, very slightly clear of the surface */}
      <mesh castShadow receiveShadow position={[0, lift + baseH / 2, 0]} material={trayMat}>
        <boxGeometry args={[trayW, baseH, trayD]} />
      </mesh>

      {/* Rim walls — four low, thin walls sitting on the base perimeter */}
      {/* Long walls (front/back, along X) */}
      {[-1, 1].map((s) => (
        <mesh
          key={`rimZ${s}`}
          castShadow
          receiveShadow
          position={[0, baseTopY + rimH / 2, (s * (trayD - rimT)) / 2]}
          material={trayMat}
        >
          <boxGeometry args={[trayW, rimH, rimT]} />
        </mesh>
      ))}
      {/* Short walls (left/right, along Z) */}
      {[-1, 1].map((s) => (
        <mesh
          key={`rimX${s}`}
          castShadow
          receiveShadow
          position={[(s * (trayW - rimT)) / 2, baseTopY + rimH / 2, 0]}
          material={trayMat}
        >
          <boxGeometry args={[rimT, rimH, trayD - rimT * 2]} />
        </mesh>
      ))}

      {/* Objects — each sits ON the base top (y = baseTopY) within the rim */}
      {objs.map((kind, i) => {
        const x = xAt(i)
        const z = zAt(i)
        return (
          <group key={`o${i}`} position={[x, baseTopY, z]}>
            {kind === 'candle' && <TrayCandle i={i} tint={tint} segs={r} />}
            {kind === 'bowl' && <TrayBowl i={i} color={trayColor} segs={r} />}
            {kind === 'books' && <TrayBooks i={i} tint={tint} />}
            {kind === 'coasters' && <TrayCoasters i={i} tint={tint} segs={r} />}
          </group>
        )
      })}
    </group>
  )
}

/** A stubby pillar candle on the tray base. Height varies by slot index. */
function TrayCandle({ i, tint, segs }: { i: number; tint: (f: number) => string; segs: number }) {
  const h = 0.06 + (i % 3) * 0.018 // 0.06..0.096
  const rad = 0.022 - (i % 2) * 0.004
  return (
    <group>
      <mesh castShadow receiveShadow position={[0, h / 2, 0]}>
        <cylinderGeometry args={[rad, rad, h, segs]} />
        <meshStandardMaterial
          color={tint(1.35 + (i % 3) * 0.05)}
          roughness={0.55}
          metalness={0.02}
        />
      </mesh>
      {/* Wick */}
      <mesh position={[0, h + 0.005, 0]}>
        <cylinderGeometry args={[0.0016, 0.0016, 0.01, 4]} />
        <meshStandardMaterial color="#2a1a08" roughness={1} />
      </mesh>
    </group>
  )
}

/** A small round bowl/vase. Subtle wall via a slightly inset, recessed rim. */
function TrayBowl({ i, color, segs }: { i: number; color: string; segs: number }) {
  const rTop = 0.05 - (i % 2) * 0.006
  const rBot = rTop * 0.66
  const h = 0.05 + (i % 2) * 0.012
  const bowlMat = getSurfaceMaterial('gloss', color, 1, 0.55)
  return (
    <group>
      {/* Outer body */}
      <mesh castShadow receiveShadow position={[0, h / 2, 0]} material={bowlMat}>
        <cylinderGeometry args={[rTop, rBot, h, segs]} />
      </mesh>
      {/* Recessed inner hollow so it reads as an open bowl, not a solid puck */}
      <mesh position={[0, h - 0.006, 0]}>
        <cylinderGeometry args={[rTop - 0.008, rBot - 0.006, 0.012, segs]} />
        <meshStandardMaterial color="#2c2620" roughness={0.9} />
      </mesh>
    </group>
  )
}

/** A small folded-book pair (two thin slabs of slightly different size). */
function TrayBooks({ i, tint }: { i: number; tint: (f: number) => string }) {
  const w = 0.11
  const d = 0.08
  const t = 0.018
  return (
    <group rotation={[0, (i % 2 === 0 ? 1 : -1) * 0.12, 0]}>
      {/* Bottom (larger) book */}
      <mesh castShadow receiveShadow position={[0, t / 2, 0]}>
        <boxGeometry args={[w, t, d]} />
        <meshStandardMaterial color={tint(0.85)} roughness={0.75} />
      </mesh>
      {/* Top (smaller) book, sitting flush on the lower one */}
      <mesh castShadow receiveShadow position={[0.008, t + 0.014 / 2, 0.006]}>
        <boxGeometry args={[w * 0.84, 0.014, d * 0.84]} />
        <meshStandardMaterial color={tint(1.15)} roughness={0.75} />
      </mesh>
    </group>
  )
}

/** A short stack of round coasters. */
function TrayCoasters({ i, tint, segs }: { i: number; tint: (f: number) => string; segs: number }) {
  const rad = 0.04
  const count = 3 + (i % 2)
  const t = 0.006
  return (
    <group>
      {Array.from({ length: count }, (_, k) => (
        <mesh key={k} castShadow receiveShadow position={[0, t / 2 + k * t, 0]}>
          <cylinderGeometry args={[rad, rad, t, segs]} />
          <meshStandardMaterial color={tint(0.95 + (k % 2) * 0.18)} roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}
