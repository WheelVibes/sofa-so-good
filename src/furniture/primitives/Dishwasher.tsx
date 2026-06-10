import { applianceFinish } from '../../materials/furnitureMaterials'
import type { ParamProps } from '../types'
import { readStr } from './shared'

/**
 * Built-in / freestanding dishwasher: a base-cabinet-sized body with a proud
 * front door, a recessed top control strip with a couple of dials, and a
 * full-width recessed bar handle near the top of the door. Faces +Z. An
 * `integrated` finish hides the controls (panel-ready, to match cabinetry).
 */
export function Dishwasher({ props }: { props: ParamProps }) {
  const color = readStr(props, 'color', '#d7dadd')
  const finish = readStr(props, 'finish', 'steel')
  const integrated = readStr(props, 'integrated', 'no') === 'yes'
  const w = 0.6
  const d = 0.6
  const h = 0.82
  const body = { color, ...applianceFinish(finish) }
  const trim = { color: '#9a9ea3', roughness: 0.3, metalness: 0.7 } as const

  return (
    <group>
      {/* Body */}
      <mesh castShadow receiveShadow position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial {...body} />
      </mesh>
      {/* Front door, slightly proud + inset border for a panel look */}
      <mesh castShadow position={[0, h * 0.46, d / 2 + 0.008]}>
        <boxGeometry args={[w - 0.03, h * 0.82, 0.016]} />
        <meshStandardMaterial {...body} />
      </mesh>
      {/* Recessed handle bar near the top of the door */}
      <mesh castShadow position={[0, h * 0.82, d / 2 + 0.02]}>
        <boxGeometry args={[w * 0.82, 0.025, 0.02]} />
        <meshStandardMaterial {...trim} />
      </mesh>
      {/* Control strip on the top edge of the door (hidden when integrated) */}
      {!integrated && (
        <group>
          <mesh position={[0, h * 0.93, d / 2 + 0.006]}>
            <boxGeometry args={[w * 0.92, 0.06, 0.008]} />
            <meshStandardMaterial color="#2b2e33" roughness={0.4} metalness={0.2} />
          </mesh>
          {[-0.18, -0.06].map((x) => (
            <mesh key={x} position={[x, h * 0.93, d / 2 + 0.014]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.018, 0.018, 0.016, 16]} />
              <meshStandardMaterial color="#c7cace" roughness={0.4} metalness={0.5} />
            </mesh>
          ))}
          {/* A couple of status LEDs */}
          {[0.12, 0.18].map((x) => (
            <mesh key={x} position={[x, h * 0.93, d / 2 + 0.012]}>
              <circleGeometry args={[0.006, 12]} />
              <meshStandardMaterial
                color="#5fd0a0"
                emissive="#3fae82"
                emissiveIntensity={0.6}
                roughness={0.4}
              />
            </mesh>
          ))}
        </group>
      )}
    </group>
  )
}
