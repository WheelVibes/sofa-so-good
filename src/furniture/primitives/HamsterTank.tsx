import type { ReactNode } from 'react'
import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { metalLeg, readStr } from './shared'
import { seg, useDetail } from './useDetail'

/**
 * Hamster enclosure (parametric) — a glass tank (≥100×50 cm base, the modern
 * "bin cage"/tank standard) with a black frame, a wire-mesh lid, a bedding line
 * and a little interior life: a running wheel and a dome hideout. `size` picks
 * S/M base dims; `base` sits it on the floor or on a low metal stand. Glass reads
 * via transparent panels over the tinted bedding. Floor-anchored, footprint-
 * centred, faces +Z. Real metres; the stand legs reach the floor.
 */
export const HAMSTER_TANK_SIZES: Record<string, { w: number; d: number; h: number }> = {
  S: { w: 0.8, d: 0.4, h: 0.4 },
  M: { w: 1.0, d: 0.5, h: 0.45 },
}

export function HamsterTank({ props }: { props: ParamProps }) {
  const size = readStr(props, 'size', 'M')
  const base = readStr(props, 'base', 'floor')
  const glassColor = readStr(props, 'glassColor', '#cfe0e6')
  const beddingColor = readStr(props, 'beddingColor', '#d8c39a')
  const frameColor = readStr(props, 'frameColor', '#1b1b1e')
  const detail = useDetail()
  const r = seg(10, detail)

  const dim = HAMSTER_TANK_SIZES[size] ?? HAMSTER_TANK_SIZES.M
  const w = dim.w
  const d = dim.d
  const tankH = dim.h
  const halfW = w / 2
  const halfD = d / 2
  const glassT = 0.01

  const standH = base === 'stand' ? 0.4 : 0
  const tankBase = standH
  const frame = getSurfaceMaterial('painted', frameColor, 1)
  const meshMat = metalLeg('#9aa0a6', 'satin')

  const beddingH = tankH * 0.28

  return (
    <group>
      {/* ---- Optional low metal stand ---- */}
      {base === 'stand' && (
        <group>
          {[-1, 1].map((sx) =>
            [-1, 1].map((sz) => (
              <mesh
                key={`sl${sx}${sz}`}
                castShadow
                position={[sx * (halfW - 0.03), standH / 2, sz * (halfD - 0.03)]}
                material={meshMat}
              >
                <boxGeometry args={[0.03, standH, 0.03]} />
              </mesh>
            )),
          )}
          {/* Stand top rail frame. */}
          <mesh position={[0, standH - 0.02, 0]} material={meshMat}>
            <boxGeometry args={[w, 0.02, d]} />
          </mesh>
        </group>
      )}

      {/* ---- Bedding line ---- */}
      <mesh receiveShadow position={[0, tankBase + beddingH / 2 + 0.005, 0]}>
        <boxGeometry args={[w - glassT * 2, beddingH, d - glassT * 2]} />
        <meshStandardMaterial color={beddingColor} roughness={0.95} />
      </mesh>

      {/* ---- Interior: running wheel ---- */}
      <group position={[-w * 0.28, tankBase + beddingH + tankH * 0.22, d * 0.12]}>
        <mesh castShadow rotation={[0, 0, 0]}>
          <torusGeometry args={[tankH * 0.2, 0.012, 6, r * 2]} />
          <meshStandardMaterial color="#e0863f" roughness={0.6} />
        </mesh>
        {/* Wheel back disc + axle. */}
        <mesh position={[0, 0, -0.02]}>
          <cylinderGeometry args={[tankH * 0.19, tankH * 0.19, 0.006, r * 2]} />
          <meshStandardMaterial color="#e8a066" roughness={0.7} transparent opacity={0.5} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.04]} material={meshMat}>
          <cylinderGeometry args={[0.006, 0.006, 0.08, 6]} />
        </mesh>
      </group>

      {/* ---- Interior: dome hideout ---- */}
      <mesh castShadow position={[w * 0.28, tankBase + beddingH + tankH * 0.06, -d * 0.14]}>
        <sphereGeometry args={[tankH * 0.22, r, r, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#b8674a" roughness={0.7} />
      </mesh>

      {/* ---- Glass shell (drawn transparent) ---- */}
      <mesh position={[0, tankBase + tankH / 2, 0]}>
        <boxGeometry args={[w, tankH, d]} />
        <meshStandardMaterial
          color={glassColor}
          roughness={0.05}
          metalness={0.1}
          transparent
          opacity={0.18}
        />
      </mesh>
      {/* Black frame rim (top + bottom perimeter). */}
      {[tankBase + 0.01, tankBase + tankH].map((y, i) => (
        <mesh key={`rim${i}`} castShadow position={[0, y, 0]} material={frame}>
          <boxGeometry args={[w + 0.012, 0.02, d + 0.012]} />
        </mesh>
      ))}
      {/* Vertical corner posts of the frame. */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh
            key={`fp${sx}${sz}`}
            position={[sx * halfW, tankBase + tankH / 2, sz * halfD]}
            material={frame}
          >
            <boxGeometry args={[0.016, tankH, 0.016]} />
          </mesh>
        )),
      )}

      {/* ---- Wire-mesh lid ---- */}
      {(() => {
        const bars: ReactNode[] = []
        const nx = Math.max(4, Math.round(w / 0.06))
        const nz = Math.max(3, Math.round(d / 0.06))
        const y = tankBase + tankH + 0.006
        for (let i = 0; i <= nx; i++) {
          const x = -halfW + (w * i) / nx
          bars.push(
            <mesh
              key={`lx${i}`}
              position={[x, y, 0]}
              rotation={[Math.PI / 2, 0, 0]}
              material={meshMat}
            >
              <cylinderGeometry args={[0.003, 0.003, d, 4]} />
            </mesh>,
          )
        }
        for (let i = 0; i <= nz; i++) {
          const z = -halfD + (d * i) / nz
          bars.push(
            <mesh
              key={`lz${i}`}
              position={[0, y, z]}
              rotation={[0, 0, Math.PI / 2]}
              material={meshMat}
            >
              <cylinderGeometry args={[0.003, 0.003, w, 4]} />
            </mesh>,
          )
        }
        return <group>{bars}</group>
      })()}
    </group>
  )
}
