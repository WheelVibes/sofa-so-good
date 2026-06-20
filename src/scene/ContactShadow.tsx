import { useMemo } from 'react'
import { CanvasTexture } from 'three'
import { applyAnisotropy } from '../materials/anisotropy'

let sharedTex: CanvasTexture | null = null
/** Soft radial-gradient alpha blob, created once and shared by every shadow. */
function shadowTexture(): CanvasTexture {
  if (sharedTex) return sharedTex
  const size = 128
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, 'rgba(0,0,0,0.55)')
  g.addColorStop(0.55, 'rgba(0,0,0,0.32)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  // Route through the shared anisotropy cap (RD-401), like every other CanvasTexture.
  sharedTex = applyAnisotropy(new CanvasTexture(c))
  return sharedTex
}

/**
 * A soft contact-shadow blob laid flat just above the floor under a furniture
 * footprint — grounds the piece with ambient-occlusion-like contact that reads
 * even in flat daylight or on the software renderer. Cheap: one shared texture,
 * one transparent plane per item. Sized a touch larger than the footprint.
 * `y` offsets the plane in the parent's local frame (defaults to floor level);
 * a lifted parent group passes `-liftY` to keep the shadow grounded. `opacity`
 * (default 0.5) lets a small surface decal under decor read fainter than a
 * floor-standing piece's blob. `scale` (default 1.5) sizes the blob relative to
 * the footprint.
 */
export function ContactShadow({
  w,
  d,
  y = 0,
  opacity = 0.5,
  scale = 1.5,
}: {
  w: number
  d: number
  y?: number
  opacity?: number
  scale?: number
}) {
  const tex = useMemo(() => shadowTexture(), [])
  return (
    <mesh position={[0, y + 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <planeGeometry args={[w * scale, d * scale]} />
      <meshBasicMaterial map={tex} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  )
}
