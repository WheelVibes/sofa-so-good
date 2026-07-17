import { useEffect, useMemo } from 'react'
import { DoubleSide, RepeatWrapping, type Texture } from 'three'
import type { ParamProps } from '../types'
import { getMeshGridTexture } from './meshGridTexture'
import { metalLeg, readNum, readStr } from './shared'

/**
 * Doorway pet gate (`doorBound`) — spans a door opening to keep a pet out of a
 * room (kitchen, service yard). Built in the wall plane like the window mesh
 * screen: X across the opening, Y from the floor (0) up to `height`, thin in Z,
 * facing the room interior (+Z). Structurally sound: two full-height posts reach
 * the floor, top + bottom rails connect them, and the infill (vertical bars or a
 * fine mesh) is framed by the posts/rails. An optional walk-through flap section
 * is drawn as an inset outline on one side (visual only).
 */
export function PetGate({ props }: { props: ParamProps }) {
  const width = readNum(props, 'width', 0.85)
  const height = readNum(props, 'height', 0.75)
  const style = readStr(props, 'style', 'bars')
  const color = readStr(props, 'color', '#6b6f76')
  const finish = readStr(props, 'finish', 'satin')
  const flap = readStr(props, 'flap', 'no')

  const post = 0.03
  const depth = 0.035
  // Off the wall centreline toward the room the gate was dropped from (doorSnap
  // faces local +Z at the drop side). The closed door leaf is 5 cm thick centred
  // at z=0 (spans ±0.025), so a ≥0.045 inset lifts the gate's back face clear of
  // it — no z-fight — mirroring WindowMeshScreen's deliberate glass stand-off.
  // (Accepted: opening the door swings the leaf through this plane; a swing-aware
  // exclusion is out of scope.)
  const zInset = 0.045
  const halfW = width / 2
  const midY = height / 2
  const mat = useMemo(
    () => metalLeg(color, finish === 'black-steel' ? 'black-steel' : 'satin'),
    [color, finish],
  )

  // Vertical bars: evenly spaced inside the frame (≤6 cm gaps read as a pet gate).
  const inner = width - 2 * post
  const barCount = Math.max(3, Math.round(inner / 0.06))
  const bars = useMemo(() => {
    const out: number[] = []
    for (let i = 1; i < barCount; i++) out.push(-inner / 2 + (inner * i) / barCount)
    return out
  }, [barCount, inner])

  const meshTex = useMemo<Texture | null>(() => {
    if (style !== 'mesh') return null
    const t = getMeshGridTexture(color).clone()
    t.needsUpdate = true
    t.wrapS = t.wrapT = RepeatWrapping
    t.repeat.set(Math.max(2, Math.round(width / 0.03)), Math.max(2, Math.round(height / 0.03)))
    return t
  }, [style, color, width, height])
  // Dispose the per-param clone on param change + unmount (its own GPU upload is
  // distinct from the shared base texture) — mirrors Curtain's geo cleanup.
  useEffect(() => () => meshTex?.dispose(), [meshTex])

  return (
    <group position={[0, 0, zInset]}>
      {/* Posts (reach the floor). */}
      {[-halfW + post / 2, halfW - post / 2].map((x, i) => (
        <mesh key={`p${i}`} position={[x, midY, 0]} material={mat} castShadow>
          <boxGeometry args={[post, height, depth]} />
        </mesh>
      ))}
      {/* Top + bottom rails. */}
      {[height - post / 2, post / 2].map((y, i) => (
        <mesh key={`r${i}`} position={[0, y, 0]} material={mat} castShadow>
          <boxGeometry args={[width, post, depth]} />
        </mesh>
      ))}
      {/* Infill. */}
      {style === 'mesh' && meshTex ? (
        <mesh position={[0, midY, 0]}>
          <planeGeometry args={[inner, height - 2 * post]} />
          <meshStandardMaterial
            map={meshTex}
            transparent
            side={DoubleSide}
            depthWrite={false}
            roughness={0.85}
            metalness={0.1}
          />
        </mesh>
      ) : (
        bars.map((x, i) => (
          <mesh key={`b${i}`} position={[x, midY, 0]} material={mat} castShadow>
            <boxGeometry args={[0.012, height - 2 * post, 0.012]} />
          </mesh>
        ))
      )}
      {/* Optional walk-through flap outline (visual): an inset rectangle on the
          hinge side, framed so it reads as a small swing door within the gate. */}
      {flap === 'yes' ? (
        <group>
          {(() => {
            const fw = Math.min(0.32, inner * 0.5)
            const fh = Math.min(0.5, height - 0.1)
            const cx = halfW - post - fw / 2
            const cy = post + fh / 2
            const t = 0.014
            return (
              <>
                {[cy + fh / 2, cy - fh / 2].map((y, i) => (
                  <mesh key={`fh${i}`} position={[cx, y, depth / 2]} material={mat}>
                    <boxGeometry args={[fw, t, t]} />
                  </mesh>
                ))}
                {[cx - fw / 2, cx + fw / 2].map((x, i) => (
                  <mesh key={`fv${i}`} position={[x, cy, depth / 2]} material={mat}>
                    <boxGeometry args={[t, fh, t]} />
                  </mesh>
                ))}
              </>
            )
          })()}
        </group>
      ) : null}
    </group>
  )
}
