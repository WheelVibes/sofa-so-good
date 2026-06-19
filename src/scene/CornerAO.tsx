import { useMemo } from 'react'
import { CanvasTexture } from 'three'
import { CORNER_AO_OPACITY, cornerAoStripDims } from './cornerAoMath'

let sharedTex: CanvasTexture | null = null
/**
 * A one-dimensional soft gradient — opaque-black at one edge fading to fully
 * transparent at the other — created once and shared by every corner strip.
 * Baked as a tall 1×N canvas so the falloff runs along the texture's V axis.
 */
function cornerGradientTexture(): CanvasTexture {
  if (sharedTex) return sharedTex
  const h = 64
  const c = document.createElement('canvas')
  c.width = 1
  c.height = h
  const ctx = c.getContext('2d')!
  const g = ctx.createLinearGradient(0, 0, 0, h)
  // v=0 (the wall face): darkest. Falloff is steep then long-tailed so the
  // darkening reads as contact dirt hugging the skirting, not a hard band.
  g.addColorStop(0, 'rgba(0,0,0,1)')
  g.addColorStop(0.35, 'rgba(0,0,0,0.42)')
  g.addColorStop(0.7, 'rgba(0,0,0,0.12)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 1, h)
  sharedTex = new CanvasTexture(c)
  return sharedTex
}

/**
 * A cheap baked wall/floor ambient-occlusion strip: a flat, transparent quad
 * laid on the floor against one interior wall face, darkening the junction the
 * way real AO would. It substitutes for SSAO on the GPU-light tiers (flat
 * `performance` has none) so corners read grounded even in flat daylight and on
 * the software renderer.
 *
 * Rendered inside the wall's local frame (X = along the wall, Z across its
 * thickness), so it inherits the wall group's position + rotation and follows
 * any wall edit for free. One shared gradient texture; one alpha-blended plane
 * per interior face span — tiny fill-rate overdraw, no shadow map, no extra
 * draw-call cost beyond the quad itself.
 *
 * `depthWrite` is off and a small +Y offset plus polygonOffset keep it from
 * z-fighting the floor underneath.
 */
export function WallFloorAO({
  segLen,
  segMid,
  thickness,
  sign,
}: {
  /** Face-span length along the wall (local X). */
  segLen: number
  /** Face-span centre along the wall (local X), matching the wall's FacePlane. */
  segMid: number
  /** Wall thickness (m); the face sits at ±thickness/2 in local Z. */
  thickness: number
  /** +1 = +Z interior face, -1 = -Z interior face. */
  sign: 1 | -1
}) {
  const tex = useMemo(() => cornerGradientTexture(), [])
  const { length, depth, zCenter } = cornerAoStripDims(segLen, thickness, sign)
  // The plane is built in XY then laid flat by the -90° X rotation, which maps
  // its +Y (texture V) onto local −Z. We want the texture's dark edge (the
  // canvas top, UV v=1 under CanvasTexture's default flipY) to sit at the wall
  // face and fade toward the room, so flip the X-rotation sign with the face
  // sign to point the falloff outward from the face on both sides.
  const xRot = sign === 1 ? -Math.PI / 2 : Math.PI / 2
  return (
    <mesh position={[segMid, 0.004, zCenter]} rotation={[xRot, 0, 0]} renderOrder={1}>
      <planeGeometry args={[length, depth]} />
      <meshBasicMaterial
        map={tex}
        transparent
        opacity={CORNER_AO_OPACITY}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  )
}
