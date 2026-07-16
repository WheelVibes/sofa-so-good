import { useMemo } from 'react'
import type { ParamProps } from '../types'
import { metalLeg, readNum, readStr } from './shared'

/**
 * Freestanding pet playpen — a ring of `panels` wire panels forming an enclosure
 * (a regular polygon), each panel a run of vertical bars between two posts with a
 * top + bottom rail. Floor-anchored, footprint-centred, faces +Z. Real metres;
 * structurally sound (posts reach the floor, rails connect them). S→L via the
 * `panels`/`panelWidth`/`panelHeight` defaults.
 */
export function PetPlaypen({ props }: { props: ParamProps }) {
  const panels = Math.max(4, Math.min(8, Math.round(readNum(props, 'panels', 6))))
  const panelWidth = readNum(props, 'panelWidth', 0.6)
  const panelHeight = readNum(props, 'panelHeight', 0.7)
  const color = readStr(props, 'color', '#5b6068')
  const finish = readStr(props, 'wireFinish', 'satin')

  const mat = useMemo(
    () => metalLeg(color, finish === 'black-steel' ? 'black-steel' : 'satin'),
    [color, finish],
  )

  // Regular polygon: edge length = panelWidth ⇒ circumradius R.
  const R = panelWidth / (2 * Math.sin(Math.PI / panels))
  const post = 0.02
  const barCount = Math.max(3, Math.round(panelWidth / 0.07))

  const bars = useMemo(() => {
    const inner = panelWidth - 2 * post
    const out: number[] = []
    for (let i = 1; i < barCount; i++) out.push(-inner / 2 + (inner * i) / barCount)
    return out
  }, [barCount, panelWidth])

  const midY = panelHeight / 2

  return (
    <group>
      {Array.from({ length: panels }).map((_, i) => {
        // Panel i sits on the edge between vertex i and i+1; its midpoint is at
        // angle (i + 0.5) * step, at the apothem distance, tangent to the ring.
        const step = (Math.PI * 2) / panels
        const a = (i + 0.5) * step
        const apothem = R * Math.cos(Math.PI / panels)
        const px = Math.sin(a) * apothem
        const pz = Math.cos(a) * apothem
        // Panel faces outward: its local X runs along the edge (tangent).
        const yaw = a
        return (
          <group key={i} position={[px, 0, pz]} rotation={[0, yaw, 0]}>
            {/* Posts. */}
            {[-panelWidth / 2 + post / 2, panelWidth / 2 - post / 2].map((x, j) => (
              <mesh key={`p${j}`} position={[x, midY, 0]} material={mat} castShadow>
                <boxGeometry args={[post, panelHeight, post]} />
              </mesh>
            ))}
            {/* Top + bottom rails. */}
            {[panelHeight - post / 2, post / 2].map((y, j) => (
              <mesh key={`r${j}`} position={[0, y, 0]} material={mat} castShadow>
                <boxGeometry args={[panelWidth, post, post]} />
              </mesh>
            ))}
            {/* Vertical bars. */}
            {bars.map((x, j) => (
              <mesh key={`b${j}`} position={[x, midY, 0]} material={mat} castShadow>
                <boxGeometry args={[0.01, panelHeight - 2 * post, 0.01]} />
              </mesh>
            ))}
          </group>
        )
      })}
    </group>
  )
}
