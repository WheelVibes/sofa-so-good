import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { metalLeg, readStr } from './shared'
import { seg, useDetail } from './useDetail'

/**
 * Bird cage + stand (parametric) — a wire cage that reads clearly at cage scale
 * from a vertical bar run, over a moulded seed-tray base, with a couple of perch
 * dowels inside. Two cage shapes:
 *
 *  - `dome` — a round cage: a cylinder of vertical bars capped by a domed roof
 *    of curved bars meeting at a top finial (the classic parrot cage).
 *  - `rect` — a square cage: vertical bars on four sides under a flat barred roof.
 *
 * Mounted either on a `stand` (a splayed tripod pedestal raising the cage to eye
 * level) or `tabletop` (the cage sits directly on a surface/floor). `size` picks
 * S/M dims. Floor-anchored, footprint-centred, faces +Z. Real metres; every
 * member connects (bars reach tray→roof, the pole reaches the floor).
 */
export const BIRD_CAGE_SIZES: Record<string, { dia: number; cageH: number }> = {
  S: { dia: 0.42, cageH: 0.52 },
  M: { dia: 0.56, cageH: 0.7 },
}

export function BirdCage({ props }: { props: ParamProps }) {
  const size = readStr(props, 'size', 'M')
  const mount = readStr(props, 'mount', 'stand')
  const shape = readStr(props, 'shape', 'dome')
  const frameColor = readStr(props, 'frameColor', '#3a3d42')
  const detail = useDetail()
  const r = seg(10, detail)

  const dim = BIRD_CAGE_SIZES[size] ?? BIRD_CAGE_SIZES.M
  const dia = dim.dia
  const cageH = dim.cageH
  const rad = dia / 2
  const barT = 0.006
  const bars = metalLeg(frameColor, 'satin')
  const tray = getSurfaceMaterial('painted', '#2b2d31', 1)
  const perch = getSurfaceMaterial('wood', '#b98f5e', 1)

  const standH = mount === 'stand' ? 0.72 : 0
  const trayH = 0.05
  const cageBase = standH + trayH
  const cageTop = cageBase + cageH
  const domeH = shape === 'dome' ? rad * 0.85 : 0

  // Vertical bar angular positions (dome) or 4-side positions (rect).
  const nBars = shape === 'dome' ? Math.max(12, Math.round((Math.PI * dia) / 0.05)) : 0
  const domeBars = Array.from({ length: nBars }, (_, i) => (i / nBars) * Math.PI * 2)

  // Rect side bar offsets along a side of length `dia`.
  const sideBars = (() => {
    const inner = dia - 2 * barT
    const n = Math.max(4, Math.round(dia / 0.055))
    return Array.from({ length: n + 1 }, (_, i) => -inner / 2 + (inner * i) / n)
  })()

  return (
    <group>
      {/* ---- Stand (tripod pedestal) ---- */}
      {mount === 'stand' && (
        <group>
          {/* Central pole. */}
          <mesh castShadow position={[0, standH / 2, 0]} material={bars}>
            <cylinderGeometry args={[0.02, 0.022, standH, r]} />
          </mesh>
          {/* Splayed feet. Each foot lives in a group rotated about Y by its
              azimuth, so local +Z is the outward radial; the foot then runs from
              the pole base (local y=footTopY, on the axis) down-and-out to the
              floor (local y=0, z=footR). This grounds every foot at y=0 AND
              sockets its top into the pole — the previous rotation put the tilt
              on Z regardless of azimuth, so a foot leant sideways, dipped below
              the floor, and detached from the pole (the deferred harness finding). */}
          {[0, 1, 2].map((i) => {
            const a = (i / 3) * Math.PI * 2
            const footR = rad * 0.8
            const footTopY = 0.06
            const legLen = Math.hypot(footTopY, footR)
            return (
              <group key={`foot${i}`} rotation={[0, a, 0]}>
                <mesh
                  castShadow
                  position={[0, footTopY / 2, footR / 2]}
                  rotation={[Math.atan2(footR, -footTopY), 0, 0]}
                  material={bars}
                >
                  <cylinderGeometry args={[0.012, 0.012, legLen, r]} />
                </mesh>
              </group>
            )
          })}
          {/* Foot ring for stability — horizontal (about XZ), sitting just above
              the floor at the feet radius so it ties the three feet together. */}
          <mesh position={[0, 0.015, 0]} rotation={[Math.PI / 2, 0, 0]} material={bars}>
            <torusGeometry args={[rad * 0.7, 0.01, 6, r * 2]} />
          </mesh>
        </group>
      )}

      {/* ---- Seed tray base ---- */}
      <mesh castShadow receiveShadow position={[0, cageBase - trayH / 2, 0]} material={tray}>
        {shape === 'dome' ? (
          <cylinderGeometry args={[rad, rad, trayH, r * 2]} />
        ) : (
          <boxGeometry args={[dia, trayH, dia]} />
        )}
      </mesh>

      {/* ---- Cage bars ---- */}
      {shape === 'dome' ? (
        <group>
          {/* Vertical wall bars. */}
          {domeBars.map((a, i) => (
            <mesh
              key={`vb${i}`}
              castShadow
              position={[Math.sin(a) * rad, cageBase + cageH / 2, Math.cos(a) * rad]}
              material={bars}
            >
              <cylinderGeometry args={[barT / 2, barT / 2, cageH, 5]} />
            </mesh>
          ))}
          {/* Horizontal hoops. */}
          {[0.1, 0.5, 0.95].map((f, i) => (
            <mesh
              key={`hoop${i}`}
              position={[0, cageBase + cageH * f, 0]}
              rotation={[Math.PI / 2, 0, 0]}
              material={bars}
            >
              <torusGeometry args={[rad, barT / 2, 5, r * 3]} />
            </mesh>
          ))}
          {/* Domed roof: straight bars from the top ring leaning cleanly to the
              apex. Each bar lives in a group rotated about Y by its azimuth `a`,
              so local +Z is the outward radial; the bar then tilts about local X
              from the ring (z=rad) to the apex (z=0), meeting at the finial. */}
          {domeBars
            .filter((_, i) => i % 2 === 0)
            .map((a, i) => (
              <group key={`db${i}`} rotation={[0, a, 0]}>
                <mesh
                  castShadow
                  position={[0, cageTop + domeH / 2, rad / 2]}
                  rotation={[Math.atan2(-rad, domeH), 0, 0]}
                  material={bars}
                >
                  <cylinderGeometry args={[barT / 2, barT / 2, Math.hypot(rad, domeH), 5]} />
                </mesh>
              </group>
            ))}
          <mesh castShadow position={[0, cageTop + domeH + 0.02, 0]} material={bars}>
            <sphereGeometry args={[0.02, r, r]} />
          </mesh>
          {/* Ring the roof bars meet at. */}
          <mesh position={[0, cageTop, 0]} rotation={[Math.PI / 2, 0, 0]} material={bars}>
            <torusGeometry args={[rad, barT / 2, 5, r * 3]} />
          </mesh>
        </group>
      ) : (
        <group>
          {/* Four side walls of vertical bars. */}
          {[
            { fixed: 'z' as const, sign: -1 },
            { fixed: 'z' as const, sign: 1 },
            { fixed: 'x' as const, sign: -1 },
            { fixed: 'x' as const, sign: 1 },
          ].map((wall, wi) =>
            sideBars.map((o, i) => (
              <mesh
                key={`sb${wi}-${i}`}
                castShadow
                position={
                  wall.fixed === 'z'
                    ? [o, cageBase + cageH / 2, wall.sign * rad]
                    : [wall.sign * rad, cageBase + cageH / 2, o]
                }
                material={bars}
              >
                <cylinderGeometry args={[barT / 2, barT / 2, cageH, 5]} />
              </mesh>
            )),
          )}
          {/* Flat roof bars. */}
          {sideBars.map((o, i) => (
            <mesh
              key={`rf${i}`}
              castShadow
              position={[o, cageTop, 0]}
              rotation={[Math.PI / 2, 0, 0]}
              material={bars}
            >
              <cylinderGeometry args={[barT / 2, barT / 2, dia, 5]} />
            </mesh>
          ))}
          {/* Top perimeter rails. */}
          {[-1, 1].map((s) => (
            <mesh
              key={`tr${s}`}
              position={[0, cageTop, s * rad]}
              rotation={[0, 0, Math.PI / 2]}
              material={bars}
            >
              <cylinderGeometry args={[barT / 2, barT / 2, dia, 5]} />
            </mesh>
          ))}
        </group>
      )}

      {/* ---- Interior perch dowels ---- */}
      {/* Span the full inner diameter so each dowel's ends socket into the cage
          bars (the previous dia*0.75 length left them ~2–7 cm short of the wall,
          the deferred harness finding). A small z-offset + yaw stays clear of the
          centre; a hair over `dia` guarantees the ends reach the bar circle even
          with the yaw. */}
      {[0.4, 0.65].map((f, i) => (
        <mesh
          key={`perch${i}`}
          castShadow
          position={[0, cageBase + cageH * f, i === 0 ? -rad * 0.15 : rad * 0.2]}
          rotation={[0, i === 0 ? 0.2 : -0.3, Math.PI / 2]}
          material={perch}
        >
          <cylinderGeometry args={[0.008, 0.008, dia * 1.02, 6]} />
        </mesh>
      ))}
    </group>
  )
}
