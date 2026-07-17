import { useLayoutEffect, useRef } from 'react'
import {
  Color,
  DoubleSide,
  type InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
} from 'three'
import { LruCache } from '../../materials/materialLru'
import { type BoxInstance, bakeInstanceMatrix } from './InstancedBoxes'
import { getLeafTexture, type LeafSpecies } from './leafTexture'

/**
 * Shared leaf rendering: a per-species alpha silhouette (`leafTexture.ts`) mapped
 * onto a gently CURVED leaf plane and drawn as one `InstancedMesh` per cluster —
 * so a lush plant is a handful of draw calls, not one mesh per leaf. Each leaf
 * plane has its base pivot at local y=0 (the attachment point) and grows up to
 * y=1, so an instance's `[w, l, w]` size scales it to a real leaf that ATTACHES
 * at its base to a stem/petiole and extends to its tip — keeping the plant one
 * connected structure for the soundness harness.
 *
 * The material uses `alphaTest` (transparent = false), NOT alpha blending, so
 * leaves write depth normally: no back-to-front sorting, no halo/z-fight against
 * the aquarium glass, correct at every camera angle. Per-instance `instanceColor`
 * gives seeded green variation over the white base material (map * instanceColor).
 */

/** Cap on distinct (species,colour) leaf materials held live (AUD-002). */
export const LEAF_MAT_CACHE_MAX = 32
const matCache = new LruCache<MeshStandardMaterial>({
  max: LEAF_MAT_CACHE_MAX,
  dispose: (m) => m.dispose(),
})

export function getLeafMaterial(species: LeafSpecies, color: string): MeshStandardMaterial {
  const key = `${species}|${color}`
  const hit = matCache.get(key)
  if (hit) return hit
  const mat = new MeshStandardMaterial({
    // White base so the map + per-instance instanceColor show unmodulated.
    color: '#ffffff',
    map: getLeafTexture(species, color),
    alphaTest: 0.5,
    transparent: false,
    side: DoubleSide,
    roughness: 0.62,
    metalness: 0,
  })
  matCache.set(key, mat)
  return mat
}

/** One shared curved leaf plane: base at y=0, tip at y=1, arched in +Z so a leaf
 *  reads as a 3D blade (not a flat card) from grazing angles. Width spans −0.5..0.5. */
let leafGeom: PlaneGeometry | null = null
function getLeafGeometry(): PlaneGeometry {
  if (leafGeom) return leafGeom
  const g = new PlaneGeometry(1, 1, 1, 6)
  const pos = g.attributes.position
  for (let i = 0; i < pos.count; i++) {
    const y01 = pos.getY(i) + 0.5 // 0 (base) .. 1 (tip)
    pos.setY(i, y01)
    // Gentle arch: leaf bows forward, peaking near the middle then drooping.
    pos.setZ(i, Math.sin(y01 * Math.PI) * 0.16 - y01 * y01 * 0.1)
  }
  pos.needsUpdate = true
  g.computeVertexNormals()
  leafGeom = g
  return g
}

/**
 * Render a cluster of leaves of one species/colour as a single instanced draw
 * call. Each instance: `position` = leaf base, `size` = `[width, length, width]`,
 * optional `rotation` (Euler XYZ), optional `color` (per-leaf tint over white).
 */
export function InstancedLeaves({
  species,
  color,
  instances,
  castShadow = true,
}: {
  species: LeafSpecies
  color: string
  instances: BoxInstance[]
  castShadow?: boolean
}) {
  const ref = useRef<InstancedMesh>(null)
  const count = instances.length
  const material = getLeafMaterial(species, color)
  const geometry = getLeafGeometry()

  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const dummy = new Object3D()
    const col = new Color()
    let hasColor = false
    instances.forEach((inst, i) => {
      mesh.setMatrixAt(i, bakeInstanceMatrix(inst, dummy))
      if (inst.color) {
        col.set(inst.color)
        mesh.setColorAt(i, col)
        hasColor = true
      }
    })
    mesh.instanceMatrix.needsUpdate = true
    if (hasColor && mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [instances])

  if (count === 0) return null
  return (
    <instancedMesh
      ref={ref}
      key={count}
      args={[geometry, material, count]}
      castShadow={castShadow}
    />
  )
}

/** Deterministic per-index jitter in [-1,1] — a cheap hash so leaves vary
 *  without RNG (keeps primitives pure, matching the `decorStyling` idiom). */
export function leafJitter(i: number, salt = 0): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

/** Per-leaf `instanceColor` tint (a near-white multiplier over the green map):
 *  seeded brightness variation with a faint warm/cool green bias so a cluster of
 *  leaves reads as natural foliage, not identical clones. */
export function leafTintHex(i: number, salt = 0): string {
  const f = 0.8 + (leafJitter(i, salt) * 0.5 + 0.5) * 0.36 // 0.80 .. 1.16
  const h = leafJitter(i, salt + 5) * 0.06 // ±hue lean
  const g = Math.min(255, Math.round(255 * f))
  const r = Math.min(255, Math.round(255 * f * (0.92 + h)))
  const b = Math.min(255, Math.round(255 * f * (0.86 - h)))
  return `rgb(${r},${g},${b})`
}
