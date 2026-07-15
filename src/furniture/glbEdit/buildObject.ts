import {
  BoxGeometry,
  BufferGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  type Material,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
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
  combinedPartIds,
  combineGroups,
  DEFAULT_PART_METALNESS,
  DEFAULT_PART_ROUGHNESS,
  type GroupMaterialData,
  type MeshOverride,
  type ShapePart,
} from './editSpec'
import {
  bevelledBoxGeometry,
  extrudeGeometry,
  latheGeometry,
  sweepGeometry,
  wedgeGeometry,
} from './shapeProfiles'

/** The shared cache-built material for a part's `mat:<id>` finish, or null
 *  while it isn't built yet / the id is unknown (→ solid-colour fallback).
 *  Same furniture-scoped cache the placed-furniture loader fills. */
function cachedFinishMaterial(finish: string): MeshStandardMaterial | null {
  const matId = parseFurnitureMaterialFinish(finish)
  if (!matId) return null
  return getBuiltMaterial(furnitureMaterialCacheId(matId)) ?? null
}

/** The 6 shared surface-look fields both a `ShapePart` and a per-group
 *  `GroupMaterialData` carry — the input to `buildSurfaceMaterial`. */
interface SurfaceLook {
  color: string
  finish?: string
  roughness?: number
  metalness?: number
  emissiveIntensity?: number
  opacity?: number
}

/** Build one owned `MeshStandardMaterial` from the shared surface-look fields.
 *  With a `finish` set (GE3c) and its catalog material built, returns a CLONE of
 *  that textured material (textures stay shared; the clone keeps the shared cache
 *  instance unmutated and lets glow/opacity apply on top — the finish's own
 *  colour/roughness/metalness maps win over the flat values). Otherwise the flat
 *  solid-colour material honouring the roughness/metalness defaults. Every call
 *  returns a material the caller OWNS (safe to dispose — textures never are). */
function buildSurfaceMaterial(look: SurfaceLook): MeshStandardMaterial {
  const glow = look.emissiveIntensity ?? 0
  const opacity = look.opacity ?? 1
  const base = look.finish ? cachedFinishMaterial(look.finish) : null
  if (base) {
    const m = base.clone()
    m.emissive = new Color(glow > 0 ? look.color : 0x000000)
    m.emissiveIntensity = glow
    m.transparent = opacity < 1
    m.opacity = opacity
    return m
  }
  return new MeshStandardMaterial({
    color: look.color,
    roughness: look.roughness ?? DEFAULT_PART_ROUGHNESS,
    metalness: look.metalness ?? DEFAULT_PART_METALNESS,
    // Glow in the part's own colour (so a red part glows red); black = no glow.
    emissive: new Color(glow > 0 ? look.color : 0x000000),
    emissiveIntensity: glow,
    transparent: opacity < 1,
    opacity,
  })
}

/** Per-group material (baked at CSG combine time, GE3c tail) — a thin wrapper
 *  over `buildSurfaceMaterial` for a `GroupMaterialData` record. */
function groupMaterial(g: GroupMaterialData): MeshStandardMaterial {
  return buildSurfaceMaterial(g)
}

/** The PBR material for a primitive part. Used by both the export
 *  (`buildEditedObject`) and the live preview so they never diverge. */
export function partMaterial(part: ShapePart): MeshStandardMaterial {
  return buildSurfaceMaterial(part)
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

/** How a CSG-v2 operand is ghosted in the editor preview (never exported). */
export type GhostVariant = 'hole' | 'consumed'

/** Translucent ghost material for a combine-group operand (CSG v2, TinkerCAD
 *  look — opacity only, no bespoke texture art). A `hole` reads as a stronger,
 *  cooler cut-out; a consumed `solid` is a very faint proxy so the "real"
 *  evaluated result mesh reads on top of it. `depthWrite = false` keeps it from
 *  z-fighting the result. Caller-owned (safe to dispose). */
export function ghostMaterial(part: ShapePart, variant: GhostVariant): MeshStandardMaterial {
  const hole = variant === 'hole'
  return new MeshStandardMaterial({
    // Holes tint toward the part colour so a red hole still reads red; consumed
    // solids echo their own colour faintly.
    color: hole ? part.color : part.color,
    roughness: 0.9,
    metalness: 0,
    transparent: true,
    opacity: hole ? 0.34 : 0.14,
    depthWrite: false,
  })
}

/** Build the transient `mesh` result of a combine group into a live preview
 *  Mesh (opaque, non-interactive). Shared by preview + export. */
function combineResultMesh(result: ShapePart): Mesh {
  const mesh = new Mesh(partGeometry(result), partMaterials(result))
  mesh.position.set(result.position[0], result.position[1], result.position[2])
  if (result.rotation) {
    mesh.rotation.set(
      MathUtils.degToRad(result.rotation[0]),
      MathUtils.degToRad(result.rotation[1]),
      MathUtils.degToRad(result.rotation[2]),
    )
  }
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
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
      // bevel 0 / absent → plain BoxGeometry (byte-identical to pre-Stage-1a).
      return part.bevel && part.bevel > 0
        ? bevelledBoxGeometry(w, h, d, part.bevel)
        : new BoxGeometry(w, h, d)
    case 'lathe':
      return latheGeometry(part.profile ?? [], part.segments ?? 32, w, h)
    case 'extrude':
      return extrudeGeometry(part.outline ?? [], w, h, d, part.bevel ?? 0.02)
    case 'sweep':
      return sweepGeometry(part.sweepProfile ?? 'circle', part.sweepPath ?? 'ring', w, h)
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
    case 'wedge':
      // Right-triangular prism (a ramp). bevel 0 / absent → sharp edges
      // (byte-identical to pre-Stage-1a); bevel > 0 chamfers the ramp edges.
      return wedgeGeometry(w, h, d, part.bevel ?? 0)
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
 *
 * CSG v2 (Stage 1b): `results` maps a combine group's id → its evaluated `mesh`
 * result part (produced by `csgEval.evaluateAllGroups`, off the main thread).
 * Parts consumed by a group are NOT emitted on their own — the group's result
 * mesh stands in for them. A `hole`-role part with NO group exports as a regular
 * solid (its role is just a marker until it's added to a Subtract combine — it
 * only cuts inside one), matching what the editor shows for a groupless hole.
 * When `results` is absent/empty (no combines, or the pre-Stage-1b path), every
 * part renders exactly as before.
 */
export function buildEditedObject(
  source: Object3D | null,
  spec: AssetEditSpec,
  results?: Map<string, ShapePart>,
): Group {
  const group = new Group()
  group.name = 'sofa-asset'

  if (source) {
    const clone = source.clone(true)
    const s = spec.sourceScale > 0 ? spec.sourceScale : 1
    clone.scale.multiplyScalar(s)
    applyMeshOverrides(clone, spec.meshOverrides)
    group.add(clone)
  }

  const consumed = combinedPartIds(spec)

  spec.parts.forEach((part, i) => {
    // A part folded into a combine group is represented by the group's baked
    // result, not on its own. A free hole (no group) exports as a normal solid —
    // its role only cuts inside a Subtract combine (least-surprising: it exports
    // as what the editor shows).
    if (consumed.has(part.id)) return
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

  // Bake each combine group's evaluated result into the export.
  combineGroups(spec).forEach((g, i) => {
    const result = results?.get(g.id)
    if (!result) return
    const mesh = combineResultMesh(result)
    mesh.name = `combine-${i + 1}`
    group.add(mesh)
  })
  return group
}
