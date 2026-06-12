import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  type Material,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  Shape,
  SphereGeometry,
  TorusGeometry,
} from 'three'
import { getBuiltMaterial } from '../../materials/cache'
import {
  furnitureMaterialCacheId,
  parseFurnitureMaterialFinish,
} from '../../materials/furnitureMaterials'
import {
  type AssetEditSpec,
  DEFAULT_PART_METALNESS,
  DEFAULT_PART_ROUGHNESS,
  type GroupMaterialData,
  type MeshOverride,
  type ShapePart,
} from './editSpec'

/** The shared cache-built material for a part's `mat:<id>` finish, or null
 *  while it isn't built yet / the id is unknown (→ solid-colour fallback).
 *  Same furniture-scoped cache the placed-furniture loader fills. */
function cachedFinishMaterial(finish: string): MeshStandardMaterial | null {
  const matId = parseFurnitureMaterialFinish(finish)
  if (!matId) return null
  return getBuiltMaterial(furnitureMaterialCacheId(matId)) ?? null
}

/** Build one owned `MeshStandardMaterial` from a `GroupMaterialData` record
 *  (the per-source-part surface look baked at CSG combine time, GE3c tail).
 *  Same logic as `partMaterial` — finish clone with shared textures, or solid
 *  colour fallback. Every call returns a material the caller OWNS. */
function groupMaterial(g: GroupMaterialData): MeshStandardMaterial {
  const glow = g.emissiveIntensity ?? 0
  const opacity = g.opacity ?? 1
  const base = g.finish ? cachedFinishMaterial(g.finish) : null
  if (base) {
    const m = base.clone()
    m.emissive = new Color(glow > 0 ? g.color : 0x000000)
    m.emissiveIntensity = glow
    m.transparent = opacity < 1
    m.opacity = opacity
    return m
  }
  return new MeshStandardMaterial({
    color: g.color,
    roughness: g.roughness ?? DEFAULT_PART_ROUGHNESS,
    metalness: g.metalness ?? DEFAULT_PART_METALNESS,
    emissive: new Color(glow > 0 ? g.color : 0x000000),
    emissiveIntensity: glow,
    transparent: opacity < 1,
    opacity,
  })
}

/** The PBR material for a primitive part. Used by both the export
 *  (`buildEditedObject`) and the live preview so they never diverge.
 *
 *  With a `finish` set (GE3c) and its catalog material built, the part gets a
 *  CLONE of that textured material (textures stay shared; the clone keeps the
 *  shared cache instance unmutated and lets per-part glow/opacity apply on
 *  top — the finish's own colour/roughness/metalness maps win over the part's
 *  flat values). Otherwise: the flat solid-colour material honouring the
 *  per-part roughness/metalness (matte-ish defaults). Every call returns a
 *  material the caller OWNS (safe to dispose — textures are never disposed). */
export function partMaterial(part: ShapePart): MeshStandardMaterial {
  const glow = part.emissiveIntensity ?? 0
  const opacity = part.opacity ?? 1
  const base = part.finish ? cachedFinishMaterial(part.finish) : null
  if (base) {
    const m = base.clone()
    m.emissive = new Color(glow > 0 ? part.color : 0x000000)
    m.emissiveIntensity = glow
    m.transparent = opacity < 1
    m.opacity = opacity
    return m
  }
  return new MeshStandardMaterial({
    color: part.color,
    roughness: part.roughness ?? DEFAULT_PART_ROUGHNESS,
    metalness: part.metalness ?? DEFAULT_PART_METALNESS,
    // Glow in the part's own colour (so a red part glows red); black = no glow.
    emissive: new Color(glow > 0 ? part.color : 0x000000),
    emissiveIntensity: glow,
    transparent: opacity < 1,
    opacity,
  })
}

/**
 * The material(s) for a part's live preview and export mesh. For a `mesh` part
 * that was combined with `useGroups = true` (GE3c tail), returns an array of
 * per-group materials so each source part's finish shows on its own triangles.
 * For all other parts, returns the single `partMaterial` as before.
 *
 * Every returned material is caller-owned (safe to dispose). */
export function partMaterials(part: ShapePart): MeshStandardMaterial | MeshStandardMaterial[] {
  if (part.kind === 'mesh' && part.geometry?.materials && part.geometry.materials.length > 0) {
    return part.geometry.materials.map(groupMaterial)
  }
  return partMaterial(part)
}

/**
 * Apply per-mesh recolour/hide overrides to a (cloned) source object, in place.
 * Matches `Mesh.name` against the override map; recolouring clones the mesh's
 * material first so shared materials aren't mutated across other meshes/instances.
 * Pure of the store + spec types — directly unit-testable on a synthetic graph.
 */
export function applyMeshOverrides(
  object: Object3D,
  overrides: Record<string, MeshOverride>,
): void {
  if (Object.keys(overrides).length === 0) return
  object.traverse((o) => {
    if (!(o instanceof Mesh)) return
    const ov = overrides[o.name]
    if (!ov) return
    if (ov.hidden) {
      o.visible = false
      return
    }
    if (ov.color !== undefined) {
      const src = o.material as Material | Material[]
      const recolour = (m: Material): Material => {
        const c = m.clone() as Material & { color?: Color }
        if (c.color) c.color = new Color(ov.color)
        return c
      }
      o.material = Array.isArray(src) ? src.map(recolour) : recolour(src)
    }
  })
}

/** Give UV-less geometry simple box-projected UVs in metres: each vertex is
 *  projected onto the axis plane its normal faces most, so a tiling furniture
 *  finish (~0.5 m per tile) reads at the right physical scale on a CSG result.
 *  No-op when the geometry already has UVs. Exported for tests. */
export function boxProjectUvs(geo: BufferGeometry): void {
  if (geo.getAttribute('uv')) return
  const pos = geo.getAttribute('position')
  const nor = geo.getAttribute('normal')
  if (!pos || !nor) return
  const uv = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)
    const ax = Math.abs(nor.getX(i))
    const ay = Math.abs(nor.getY(i))
    const az = Math.abs(nor.getZ(i))
    // Dominant normal axis picks the projection plane (the other two axes).
    if (ax >= ay && ax >= az) {
      uv[i * 2] = z
      uv[i * 2 + 1] = y
    } else if (ay >= az) {
      uv[i * 2] = x
      uv[i * 2 + 1] = z
    } else {
      uv[i * 2] = x
      uv[i * 2 + 1] = y
    }
  }
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2))
}

/** Geometry for one primitive part, sized in metres (footprint-centred).
 *  `torus` reads size as [outer diameter, tube diameter, _]; `capsule` as
 *  [diameter, total height, _]; `pyramid` is a 4-sided cone rotated so a flat
 *  face points +Z (front). Exported so the live designer preview builds the
 *  exact geometry the export will, with no per-kind drift. */
export function partGeometry(part: ShapePart): BufferGeometry {
  const [w, h, d] = part.size
  switch (part.kind) {
    case 'box':
      return new BoxGeometry(w, h, d)
    case 'cylinder':
      return new CylinderGeometry(w / 2, w / 2, h, 32)
    case 'cone':
      return new ConeGeometry(w / 2, h, 32)
    case 'pyramid': {
      // 4 radial segments = square base; widen so flat-to-flat ≈ w, then turn a
      // face to the front instead of a corner.
      const geo = new ConeGeometry(w / Math.SQRT2, h, 4)
      geo.rotateY(Math.PI / 4)
      return geo
    }
    case 'capsule': {
      const radius = Math.max(0.01, w / 2)
      // CapsuleGeometry's `length` excludes the two hemispherical caps.
      const length = Math.max(0, h - 2 * radius)
      return new CapsuleGeometry(radius, length, 8, 24)
    }
    case 'torus': {
      const tube = Math.max(0.01, h / 2)
      const radius = Math.max(tube, w / 2 - tube)
      return new TorusGeometry(radius, tube, 16, 48)
    }
    case 'mesh': {
      // A CSG combine result: triangles are baked (already sized + centred on
      // the part origin), so rebuild verbatim from the stored arrays.
      const data = part.geometry
      if (!data) return new BoxGeometry(w, h, d) // defensive: malformed spec
      const geo = new BufferGeometry()
      geo.setAttribute('position', new Float32BufferAttribute(data.positions, 3))
      if (data.normals.length === data.positions.length) {
        geo.setAttribute('normal', new Float32BufferAttribute(data.normals, 3))
      }
      if (data.index) geo.setIndex(data.index)
      if (!geo.getAttribute('normal')) geo.computeVertexNormals()
      // The CSG evaluator only keeps position+normal — box-project UVs so a
      // textured `finish` tiles over the result instead of smearing one texel.
      // Box projection is vertex-by-normal, so it works correctly across groups
      // (each group's triangles tile at physical scale independently).
      boxProjectUvs(geo)
      // Restore geometry groups so the multi-material array is applied per-group
      // (GE3c tail: each source part's finish covers its own faces).
      if (data.groups) {
        for (const g of data.groups) geo.addGroup(g.start, g.count, g.materialIndex)
      }
      return geo
    }
    case 'wedge': {
      // Right-triangular prism (a ramp): triangle in the Z/Y plane rising toward
      // +Z, extruded across the width (X). Built via ExtrudeGeometry so three
      // handles winding + normals; then mapped (extrude axis Z→X) and centred.
      const shape = new Shape()
      shape.moveTo(-d / 2, -h / 2)
      shape.lineTo(d / 2, -h / 2)
      shape.lineTo(d / 2, h / 2)
      shape.closePath()
      const geo = new ExtrudeGeometry(shape, { depth: w, bevelEnabled: false })
      geo.translate(0, 0, -w / 2) // centre along the extrude axis
      geo.rotateY(-Math.PI / 2) // extrude axis Z → X (so width = w on X, depth = d on Z)
      return geo
    }
    default:
      return new SphereGeometry(Math.max(w, h, d) / 2, 32, 16)
  }
}

/**
 * Build the designer's edited asset as a three.Group, floor-anchored and centred
 * (the app's asset convention): an optional cloned + uniformly-scaled source GLB
 * plus every primitive part as a `MeshStandardMaterial` box/cylinder/sphere.
 * Pure of the store — the caller supplies the already-loaded `source` object (or
 * null for a from-scratch asset). The returned group is ready for `exportGlb`.
 */
export function buildEditedObject(source: Object3D | null, spec: AssetEditSpec): Group {
  const group = new Group()
  group.name = 'sofa-asset'

  if (source) {
    const clone = source.clone(true)
    const s = spec.sourceScale > 0 ? spec.sourceScale : 1
    clone.scale.multiplyScalar(s)
    applyMeshOverrides(clone, spec.meshOverrides)
    group.add(clone)
  }

  spec.parts.forEach((part, i) => {
    const mesh = new Mesh(partGeometry(part), partMaterials(part))
    // Name parts so a saved asset's components are addressable when it's later
    // reopened as a source for per-mesh recolour/hide.
    mesh.name = `${part.kind}-${i + 1}`
    mesh.position.set(part.position[0], part.position[1], part.position[2])
    if (part.rotation) {
      mesh.rotation.set(
        MathUtils.degToRad(part.rotation[0]),
        MathUtils.degToRad(part.rotation[1]),
        MathUtils.degToRad(part.rotation[2]),
      )
    }
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)
  })
  return group
}
