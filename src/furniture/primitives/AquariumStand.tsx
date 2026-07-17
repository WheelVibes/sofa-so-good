import { getSurfaceMaterial } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { BeveledBox } from './BeveledBox'
import { metalLeg, readStr } from './shared'

/**
 * Aquarium stand + tank (parametric) — a load-rated steel-frame + MDF cabinet
 * stand carrying a glass tank filled with tinted water over a gravel bed. The
 * `tankLength` enum (0.6 / 0.9 / 1.2 m) drives the stand + tank dims (a full 4-ft
 * planted tank is ~200 kg, hence the descriptive load note on the def). The stand
 * reads as an angle-steel frame around an MDF cabinet with optional doors; the
 * tank reads as clear glass with a water tint + gravel line + black rim. Floor-
 * anchored, footprint-centred, faces +Z. Real metres; the steel frame carries
 * the load down to the floor.
 */
export const AQUARIUM_TANK_DIMS: Record<string, { w: number; d: number; tankH: number }> = {
  '0.6': { w: 0.6, d: 0.32, tankH: 0.36 },
  '0.9': { w: 0.9, d: 0.4, tankH: 0.42 },
  '1.2': { w: 1.2, d: 0.5, tankH: 0.5 },
}

export function AquariumStand({ props }: { props: ParamProps }) {
  const tankLength = readStr(props, 'tankLength', '0.9')
  const doors = readStr(props, 'doors', 'yes')
  const frameColor = readStr(props, 'frameColor', '#2b2d31')
  const cabinetColor = readStr(props, 'cabinetColor', '#3a3f45')
  const cabinetFinish = readStr(props, 'cabinetFinish', 'painted')
  const waterColor = readStr(props, 'waterColor', '#3f7d8c')

  const dim = AQUARIUM_TANK_DIMS[tankLength] ?? AQUARIUM_TANK_DIMS['0.9']
  const w = dim.w
  const d = dim.d
  const tankH = dim.tankH
  const standH = 0.75
  const halfW = w / 2
  const halfD = d / 2

  const steel = metalLeg(frameColor, 'black-steel')
  const mdf = getSurfaceMaterial(cabinetFinish, cabinetColor, 1)
  const post = 0.03
  const glassT = 0.014
  const innerW = w - glassT * 2
  const innerD = d - glassT * 2
  const gravelH = 0.05
  const waterH = tankH - 0.07

  return (
    <group>
      {/* ---- Steel frame: 4 corner posts + top & bottom rails ---- */}
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <mesh
            key={`post${sx}${sz}`}
            castShadow
            position={[sx * (halfW - post / 2), standH / 2, sz * (halfD - post / 2)]}
            material={steel}
          >
            <boxGeometry args={[post, standH, post]} />
          </mesh>
        )),
      )}
      {[0.03, standH - 0.03].map((y, yi) => (
        <group key={`rails${yi}`}>
          {[-1, 1].map((sz) => (
            <mesh
              key={`rx${sz}`}
              castShadow
              position={[0, y, sz * (halfD - post / 2)]}
              material={steel}
            >
              <boxGeometry args={[w, post * 0.7, post * 0.7]} />
            </mesh>
          ))}
          {[-1, 1].map((sx) => (
            <mesh
              key={`rz${sx}`}
              castShadow
              position={[sx * (halfW - post / 2), y, 0]}
              material={steel}
            >
              <boxGeometry args={[post * 0.7, post * 0.7, d]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* ---- MDF cabinet body inside the frame ---- */}
      <BeveledBox
        castShadow
        receiveShadow
        position={[0, standH - 0.02, 0]}
        material={mdf}
        args={[w - post, 0.03, d - post]}
      />
      <BeveledBox
        receiveShadow
        position={[0, 0.06, 0]}
        material={mdf}
        args={[w - post, 0.03, d - post]}
      />
      {[-1, 1].map((sx) => (
        <BeveledBox
          key={`side${sx}`}
          castShadow
          position={[sx * (halfW - post - 0.008), standH / 2, 0]}
          material={mdf}
          args={[0.016, standH - 0.09, d - post]}
        />
      ))}
      <BeveledBox
        castShadow
        position={[0, standH / 2, -halfD + post + 0.008]}
        material={mdf}
        args={[w - post, standH - 0.09, 0.016]}
      />
      {/* Front doors (two leaves) with slim pulls, or an open recess. */}
      {doors === 'yes' &&
        [-1, 1].map((sx) => (
          <group key={`door${sx}`}>
            <BeveledBox
              castShadow
              position={[sx * (w * 0.24), standH / 2, halfD - post - 0.006]}
              material={mdf}
              args={[w * 0.46, standH - 0.1, 0.014]}
            />
            <mesh
              castShadow
              position={[sx * (w * 0.24 - sx * w * 0.19), standH / 2, halfD - post + 0.004]}
              material={steel}
            >
              <boxGeometry args={[0.012, 0.1, 0.012]} />
            </mesh>
          </group>
        ))}

      {/* ---- Gravel bed ---- */}
      <mesh receiveShadow position={[0, standH + gravelH / 2 + 0.005, 0]}>
        <boxGeometry args={[innerW, gravelH, innerD]} />
        <meshStandardMaterial color="#b9a888" roughness={0.95} />
      </mesh>
      {/* Planted stems for life. */}
      {[
        [-w * 0.3, -0.05, 0.2, '#3f7a3a'],
        [-w * 0.16, 0.06, 0.15, '#4f9244'],
        [w * 0.28, 0.02, 0.24, '#356b32'],
      ].map(([x, z, h, c], i) => (
        <mesh
          key={`plant${i}`}
          castShadow
          position={[x as number, standH + gravelH + (h as number) / 2, z as number]}
        >
          <cylinderGeometry args={[0.006, 0.02, h as number, 6]} />
          <meshStandardMaterial color={c as string} roughness={0.8} />
        </mesh>
      ))}
      {/* ---- Tinted water volume ---- */}
      {/* Kept fairly opaque so it reads as a filled tank — a near-transparent
          tint washes out against a bright window and the tank looks empty
          (matches the decor `Aquarium` Wave-3A fix; the two must read alike). */}
      <mesh position={[0, standH + gravelH + waterH / 2, 0]}>
        <boxGeometry args={[innerW - 0.004, waterH, innerD - 0.004]} />
        <meshStandardMaterial
          color={waterColor}
          roughness={0.1}
          metalness={0}
          transparent
          opacity={0.7}
        />
      </mesh>
      {/* ---- Glass tank shell (transparent, drawn last) ---- */}
      {/* Opacity high enough that the glass box itself reads at every tier — at
          ~0.16 the walls vanished under the faked IBL and only the black top
          rim showed, floating over the stand with an empty air gap (the same
          defect fixed in the decor `Aquarium`). metalness 0 avoids a dark
          mirror-black front. */}
      <mesh position={[0, standH + tankH / 2, 0]}>
        <boxGeometry args={[w, tankH, d]} />
        <meshStandardMaterial
          color="#cfe0e6"
          roughness={0.06}
          metalness={0}
          transparent
          opacity={0.3}
        />
      </mesh>
      {/* Black rim trim at the top of the glass. */}
      <mesh castShadow position={[0, standH + tankH, 0]}>
        <boxGeometry args={[w + 0.01, 0.02, d + 0.01]} />
        <meshStandardMaterial color="#1b1b1e" roughness={0.5} />
      </mesh>
    </group>
  )
}
