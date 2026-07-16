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
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from 'three'
import { getBuiltMaterial } from '../../materials/cache'
import { finishTextureVariant } from '../../materials/finishTextureVariant'
import {
  furnitureMaterialCacheId,
  parseFurnitureMaterialFinish,
} from '../../materials/furnitureMaterials'
import { decalGeometry, decalMaterial } from './decals'
import {
  type AssetEditSpec,
  boxFaceFinishesActive,
  combinedPartIds,
  combineGroups,
  combineHomeGroup,
  DEFAULT_PART_METALNESS,
  DEFAULT_PART_ROUGHNESS,
  type Decal,
  decalsForPart,
  type FaceFinish,
  type GroupMaterialData,
  type MeshOverride,
  type PartGroup,
  type PhysicalSurfaceFields,
  partGroups,
  type ShapePart,
} from './editSpec'
import { applyGradientColors } from './gradient'
import { applyPlump, plumpBoxGeometry } from './plump'
import {
  bevelledBoxGeometry,
  extrudeGeometry,
  latheGeometry,
  smoothProfile,
  wedgeGeometry,
} from './shapeProfiles'
import { loftGeometry, shellBoxGeometry, shellExtrudeGeometry, sweepGeometry } from './shellLoft'
import { getCachedSrcRefGeometry } from './srcRefCache'
import { buildSrcRefPartMaterial } from './srcRefMaterial'
import { applyTaper } from './taper'
import { effectiveWrinkles, wrinkleNormalScale, wrinkleNormalTexture } from './wrinkleTexture'

/** The shared cache-built material for a part's `mat:<id>` finish, or null
 *  while it isn't built yet / the id is unknown (→ solid-colour fallback).
 *  Same furniture-scoped cache the placed-furniture loader fills. */
function cachedFinishMaterial(finish: string): MeshStandardMaterial | null {
  const matId = parseFurnitureMaterialFinish(finish)
  if (!matId) return null
  return getBuiltMaterial(furnitureMaterialCacheId(matId)) ?? null
}

/** The shared surface-look fields both a `ShapePart` and a per-group
 *  `GroupMaterialData` carry — the input to `buildSurfaceMaterial`. Extends the
 *  optional `PhysicalSurfaceFields` (Stage 2) so a velvet/lacquer/glass/brushed
 *  look flows through the same builder. `vertexColors` (Stage 2 gradient) turns
 *  on the geometry's baked `COLOR_0` tint. */
interface SurfaceLook extends PhysicalSurfaceFields {
  color: string
  finish?: string
  roughness?: number
  metalness?: number
  emissiveIntensity?: number
  opacity?: number
  /** Stage 6c — texture tile-size multiplier + grain rotation (degrees) for a
   *  `mat:<id>` finish. Absent / (1, 0) → the finish's natural tiling. */
  finishScale?: number
  finishRotation?: number
  /** True when the part's geometry carries a baked gradient (COLOR_0) — the
   *  material must render `vertexColors`. */
  vertexColors?: boolean
}

/** True when any of the four PRIMARY physical axes is set > 0 — the gate that
 *  upgrades `buildSurfaceMaterial` from `MeshStandardMaterial` to
 *  `MeshPhysicalMaterial`. None set → byte-identical pre-Stage-2 output (cost
 *  discipline: the physical material only pays where a finish actually needs it).
 *  The secondary fields (sheenColor/…/ior/thickness/anisotropyRotation) only
 *  refine a primary, so they never trigger the upgrade on their own. */
function hasPhysicalLook(look: PhysicalSurfaceFields): boolean {
  return (
    (look.sheen ?? 0) > 0 ||
    (look.clearcoat ?? 0) > 0 ||
    (look.transmission ?? 0) > 0 ||
    (look.anisotropy ?? 0) > 0
  )
}

/** Apply the Stage-2 physical finishing fields to a fresh `MeshPhysicalMaterial`
 *  in place. Only the fields present are written, so an unset secondary keeps
 *  three's own default. */
function applyPhysicalFields(m: MeshPhysicalMaterial, look: PhysicalSurfaceFields): void {
  if (look.sheen !== undefined) m.sheen = look.sheen
  if (look.sheenRoughness !== undefined) m.sheenRoughness = look.sheenRoughness
  if (look.sheenColor !== undefined) m.sheenColor = new Color(look.sheenColor)
  if (look.clearcoat !== undefined) m.clearcoat = look.clearcoat
  if (look.clearcoatRoughness !== undefined) m.clearcoatRoughness = look.clearcoatRoughness
  if (look.transmission !== undefined) m.transmission = look.transmission
  if (look.ior !== undefined) m.ior = look.ior
  if (look.thickness !== undefined) m.thickness = look.thickness
  if (look.anisotropy !== undefined) m.anisotropy = look.anisotropy
  if (look.anisotropyRotation !== undefined) m.anisotropyRotation = look.anisotropyRotation
}

/** Build one owned material from the shared surface-look fields.
 *  With a `finish` set (GE3c) and its catalog material built, returns a CLONE of
 *  that textured material (textures stay shared; the clone keeps the shared cache
 *  instance unmutated and lets glow/opacity apply on top — the finish's own
 *  colour/roughness/metalness maps win over the flat values). Otherwise, when no
 *  physical field is set, the flat solid-colour `MeshStandardMaterial`; when a
 *  physical field IS set (Stage 2), a `MeshPhysicalMaterial` carrying the same
 *  base values plus the sheen/clearcoat/transmission/anisotropy layer. Every call
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
    // Stage 6c — texture scale + grain rotation. Swap each texture channel for a
    // cloned + transformed variant (shared cache textures are never mutated).
    applyFinishTextureTransform(m, look.finishScale, look.finishRotation)
    // A textured finish supersedes the physical part-fields (its own maps win) —
    // matching how roughness/metalness are ignored under a finish. Gradient is
    // likewise disabled by the inspector when a finish is set, but honour any
    // baked COLOR_0 defensively.
    if (look.vertexColors) m.vertexColors = true
    return m
  }
  const shared = {
    color: look.color,
    roughness: look.roughness ?? DEFAULT_PART_ROUGHNESS,
    metalness: look.metalness ?? DEFAULT_PART_METALNESS,
    // Glow in the part's own colour (so a red part glows red); black = no glow.
    emissive: new Color(glow > 0 ? look.color : 0x000000),
    emissiveIntensity: glow,
    transparent: opacity < 1,
    opacity,
    vertexColors: !!look.vertexColors,
  }
  if (hasPhysicalLook(look)) {
    const m = new MeshPhysicalMaterial(shared)
    applyPhysicalFields(m, look)
    return m
  }
  return new MeshStandardMaterial(shared)
}

/** The finish texture channels a scale/grain variant is applied to. */
const FINISH_TEXTURE_CHANNELS = [
  'map',
  'normalMap',
  'roughnessMap',
  'aoMap',
  'metalnessMap',
] as const

/** Apply the Stage-6c texture tile-size (`scale`) + grain rotation
 *  (`rotationDeg`) to a finish-material clone IN PLACE: each texture channel is
 *  replaced by a bounded-cache variant (the shared source textures are never
 *  mutated). A grain rotation also rotates the anisotropic highlight where the
 *  finish set one (brushed metal), so the sweep tracks the visible grain.
 *  No-op at the identity (scale 1, rotation 0). */
function applyFinishTextureTransform(
  m: MeshStandardMaterial,
  scale: number | undefined,
  rotationDeg: number | undefined,
): void {
  const s = scale ?? 1
  const r = rotationDeg ?? 0
  if (Math.abs(s - 1) < 0.005 && r === 0) return
  for (const ch of FINISH_TEXTURE_CHANNELS) {
    const tex = m[ch]
    if (tex) m[ch] = finishTextureVariant(tex, s, r)
  }
  // Grain rotation also rotates the brushed-metal anisotropy sweep (one line —
  // only when the finish material carries the physical field).
  if (r !== 0 && m instanceof MeshPhysicalMaterial) {
    m.anisotropyRotation += (r * Math.PI) / 180
  }
}

/** Per-group material (baked at CSG combine time, GE3c tail) — a thin wrapper
 *  over `buildSurfaceMaterial` for a `GroupMaterialData` record. */
function groupMaterial(g: GroupMaterialData): MeshStandardMaterial {
  return buildSurfaceMaterial(g)
}

/** The 3-zone board materials for a SHARP box carrying per-face finishes
 *  (Stage 6c) — index-matched to the geometry groups remapped by
 *  `remapBoxFaceGroups`: 0 = sides (edge band), 1 = top veneer, 2 = bottom. Each
 *  zone override sets its own colour/finish over the part's base look; an absent
 *  override inherits the base. The base `finishScale`/`finishRotation` + gradient
 *  flow to every zone. */
function boxFaceMaterials(part: ShapePart): MeshStandardMaterial[] {
  const ff = part.faceFinishes ?? {}
  const zone = (f: FaceFinish | undefined): SurfaceLook => ({
    ...part,
    color: f?.color ?? part.color,
    finish: f?.finish ?? part.finish,
    vertexColors: !!part.gradient,
  })
  return [
    buildSurfaceMaterial(zone(ff.sides)),
    buildSurfaceMaterial(zone(ff.top)),
    buildSurfaceMaterial(zone(ff.bottom)),
  ]
}

/** Remap a `BoxGeometry`'s six face groups (three's build order px, nx, py, ny,
 *  pz, nz — 6 indices each) to THREE board zones: sides = 0 (±X, ±Z), top = 1
 *  (+Y), bottom = 2 (−Y). So a 3-material array paints the veneer + edge-band
 *  split (Stage 6c). Multi-material meshes export as distinct glTF primitives. */
function remapBoxFaceGroups(geo: BoxGeometry): void {
  const zone = [0, 0, 1, 2, 0, 0] // px, nx → sides; py → top; ny → bottom; pz, nz → sides
  geo.clearGroups()
  for (let i = 0; i < 6; i++) geo.addGroup(i * 6, 6, zone[i])
}

/** True when a part earns a procedural fabric wrinkle normal map (Stage 6e):
 *  a plumped box/capsule cushion with a non-zero effective Wrinkles intensity.
 *  Pure — mirrors the `plumpBoxGeometry`/`applyPlump` gate (box/capsule only). */
function wrinkleActive(part: ShapePart): boolean {
  if (part.kind !== 'box' && part.kind !== 'capsule') return false
  return effectiveWrinkles(part.plump, part.wrinkles) > 0
}

/** Overlay a seeded fabric wrinkle normal map on a plumped cushion's material
 *  IN PLACE (Stage 6e). No-op unless the part is a plumped box/capsule with a
 *  non-zero effective Wrinkles intensity. **Interplay ruling:** if the material
 *  already carries a `normalMap` (a textured `mat:<id>` finish clone brought its
 *  own weave/relief), we SKIP the wrinkles rather than clobber the finish's map —
 *  the inspector shows a matching hint. The map is seeded from the part id so a
 *  cushion's wrinkles are stable across renders + save/reload; `normalScale`
 *  follows the plump depth × intensity. */
function applyWrinkleNormal(m: MeshStandardMaterial, part: ShapePart): void {
  if (!wrinkleActive(part)) return
  // A textured `mat:<id>` finish owns the surface (its clone carries the finish's
  // own weave/relief normal map) — skip wrinkles rather than fight it, whether or
  // not the finish material has finished building yet. Matches the inspector,
  // which hides the Wrinkles slider + shows a hint while a finish is set.
  if (part.finish) return
  if (m.normalMap) return // defensive: never clobber an existing normal channel
  const intensity = effectiveWrinkles(part.plump, part.wrinkles)
  m.normalMap = wrinkleNormalTexture(part.id, intensity)
  const s = wrinkleNormalScale(part.plump ?? 0, intensity)
  m.normalScale = new Vector2(s, s)
}

/** True when a textured finish would suppress the wrinkle overlay (Stage 6e) —
 *  the part is a plumped cushion asking for wrinkles AND carries a `mat:<id>`
 *  finish (whose clone brings its own normal map). The inspector reads this to
 *  show the "finish texture supersedes wrinkles" hint. Pure. */
export function wrinklesSuppressedByFinish(part: ShapePart): boolean {
  return wrinkleActive(part) && !!part.finish
}

/** The PBR material for a primitive part. Used by both the export
 *  (`buildEditedObject`) and the live preview so they never diverge. */
export function partMaterial(part: ShapePart): MeshStandardMaterial {
  // A part with a baked gradient (Stage 2) renders its geometry's COLOR_0 tint.
  const m = buildSurfaceMaterial({ ...part, vertexColors: !!part.gradient })
  // Stage 6e — a plumped cushion gains a seeded fabric wrinkle normal map.
  applyWrinkleNormal(m, part)
  return m
}

/**
 * The material(s) for a part's live preview and export mesh. For a `mesh` part
 * that was combined with `useGroups = true` (GE3c tail), returns an array of
 * per-group materials so each source part's finish shows on its own triangles.
 * For all other parts, returns the single `partMaterial` as before.
 *
 * Every returned material is caller-owned (safe to dispose). */
export function partMaterials(part: ShapePart): MeshStandardMaterial | MeshStandardMaterial[] {
  // Stage 10a — a GLB-decompose REFERENCE part renders its SOURCE mesh's real
  // textured material (map/normal/roughness/metalness/ao), tinted by the part's
  // colour override. Returns null when a `mat:<id>` finish is set (which REPLACES
  // the source textures — the standard finish path below handles that) or while
  // the source hasn't resolved (→ placeholder solid colour).
  const srcRefMat = buildSrcRefPartMaterial(part)
  if (srcRefMat) return srcRefMat
  if (part.kind === 'mesh' && part.geometry?.materials && part.geometry.materials.length > 0) {
    return part.geometry.materials.map(groupMaterial)
  }
  // Stage 6c — a sharp box with per-face finishes builds a 3-material board
  // (sides / top / bottom), index-matched to the geometry groups.
  if (boxFaceFinishesActive(part)) return boxFaceMaterials(part)
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
  const geo = buildShapeGeometry(part)
  // Stage 2 — bake a two-tone gradient as a COLOR_0 vertex attribute. Works on
  // every shape kind (it only reads the geometry's own bounds). The CSG evaluator
  // strips COLOR_0 (position+normal only), so a combined operand's gradient does
  // not survive a bake — consistent with the inspector not offering gradient on
  // mesh parts.
  if (part.gradient) applyGradientColors(geo, part.gradient)
  // Stage 6c — a sharp box with per-face finishes remaps its six face groups to
  // three board zones so the 3-material array (`boxFaceMaterials`) paints them.
  if (boxFaceFinishesActive(part) && geo instanceof BoxGeometry) remapBoxFaceGroups(geo)
  return geo
}

/** The raw geometry switch (no gradient) — kept separate so `partGeometry` can
 *  layer the Stage-2 gradient over any shape kind uniformly. */
function buildShapeGeometry(part: ShapePart): BufferGeometry {
  const [w, h, d] = part.size
  switch (part.kind) {
    case 'box': {
      // Stage 6b: a hollow wall thickness carves an open-top carcass (wins over
      // plump — a hollow plumped cushion is nonsensical).
      if (part.shell && part.shell > 0) return shellBoxGeometry(w, h, d, part.shell)
      // Stage 5: a plumped cushion needs a tessellated box to displace. Stage 7c:
      // a tuft grid subtracts dimples from the crown at the button points.
      if (part.plump && part.plump > 0)
        return plumpBoxGeometry(w, h, d, part.bevel ?? 0, part.plump, part.tuft, part.plumpFace)
      // bevel 0 / absent → plain BoxGeometry (byte-identical to pre-Stage-1a).
      const box =
        part.bevel && part.bevel > 0
          ? bevelledBoxGeometry(w, h, d, part.bevel)
          : new BoxGeometry(w, h, d)
      // Stage 8b: taper shrinks the +Y top face in XZ (splayed carcass sides).
      // In-place vertex transform — keeps a plain BoxGeometry a BoxGeometry, so
      // per-face finishes still remap its six groups (`partGeometry`).
      if (part.taper && part.taper > 0) applyTaper(box, part.taper, 'y')
      return box
    }
    case 'lathe':
      // Stage 11a: expand per-point smoothing (Catmull-Rom through smooth points)
      // BEFORE the geometry stage. An open profile → endpoints clamp as corners.
      return latheGeometry(smoothProfile(part.profile ?? []), part.segments ?? 32, w, h)
    case 'extrude': {
      // Stage 11a: smooth the outline first (a closed loop → wrap the tangents).
      const outline = smoothProfile(part.outline ?? [], { closed: true })
      // Stage 6b: a hollow wall thickness → a ring cross-section + bottom cap.
      if (part.shell && part.shell > 0) return shellExtrudeGeometry(outline, w, h, d, part.shell)
      const prism = extrudeGeometry(outline, w, h, d, part.bevel ?? 0.02)
      // Stage 8b: taper shrinks the +Z (front) cross-section in XY toward the
      // outline centroid along the extrude/depth axis.
      if (part.taper && part.taper > 0) applyTaper(prism, part.taper, 'z')
      return prism
    }
    case 'loft':
      // Stage 11a: smooth both cross-sections (closed loops) before the loft.
      return loftGeometry(
        smoothProfile(part.loftBottom ?? [], { closed: true }),
        smoothProfile(part.loftTop ?? [], { closed: true }),
        w,
        h,
        d,
      )
    case 'sweep':
      return sweepGeometry(
        part.sweepProfile ?? 'circle',
        part.sweepPath ?? 'ring',
        w,
        h,
        part.sweepPoints,
        // Stage 11a: an all-sharp path is unchanged (identity); a smooth-flagged
        // one is pre-expanded, then the existing Catmull-Rom sweep curves it.
        part.sweepPathPoints ? smoothProfile(part.sweepPathPoints) : undefined,
      )
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
      const geo = new CapsuleGeometry(radius, length, 8, 24)
      // Stage 5: a plumped capsule bolster bulges outward (already tessellated).
      if (part.plump && part.plump > 0) applyPlump(geo, part.plump, [w, h, d])
      return geo
    }
    case 'torus': {
      const tube = Math.max(0.01, h / 2)
      const radius = Math.max(tube, w / 2 - tube)
      return new TorusGeometry(radius, tube, 16, 48)
    }
    case 'mesh': {
      // Stage 9a — a GLB-decompose REFERENCE part carries no baked arrays; its
      // geometry is resolved lazily from the source def's GLB (`srcRefCache.ts`).
      // A cache hit is cloned (the shared cache copy is never disposed) + box-UV'd
      // for textured finishes; a miss shows a placeholder box until the def loads
      // (the preview re-renders on the resolve epoch; the export awaits resolution).
      if (part.srcRef && !part.geometry) {
        const cached = getCachedSrcRefGeometry(part.srcRef)
        if (!cached) return new BoxGeometry(w, h, d)
        const g = cached.clone()
        boxProjectUvs(g)
        return g
      }
      // A CSG combine result / procedural-decompose bake: triangles are baked
      // (already sized + centred on the part origin), so rebuild verbatim.
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

/** A decal overlay mesh, projected against `targetGeo` (the part's already-built,
 *  part-local geometry) and parented under the part mesh so it follows the part
 *  (Stage 5). Real geometry → it exports into the GLB. */
function buildDecalMesh(targetGeo: BufferGeometry, decal: Decal, name: string): Mesh {
  const mesh = new Mesh(decalGeometry(targetGeo, decal), decalMaterial(decal))
  mesh.name = name
  mesh.renderOrder = 2
  mesh.castShadow = false
  mesh.receiveShadow = false
  return mesh
}

/** Build one primitive part into a live/export Mesh at its LOCAL transform
 *  (local to its transform-group parent, or to the asset root when ungrouped).
 *  Stage 5: any decals projected onto the part are added as child overlay meshes
 *  (in the part's local frame) so they follow it. */
function buildPartMesh(part: ShapePart, name: string, partDecals: Decal[] = []): Mesh {
  const geo = partGeometry(part)
  const mesh = new Mesh(geo, partMaterials(part))
  // Name parts so a saved asset's components are addressable when it's later
  // reopened as a source for per-mesh recolour/hide.
  mesh.name = name
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
  partDecals.forEach((d, i) => {
    mesh.add(buildDecalMesh(geo, d, `${name}-decal-${i + 1}`))
  })
  return mesh
}

/** A three.Group carrying a `PartGroup`'s shared transform (position + Euler-XYZ
 *  degrees). Grouped part meshes are added as children so their world pose is
 *  group transform ∘ part transform (Stage 3a). */
function buildPartGroupContainer(g: PartGroup, name: string): Group {
  const container = new Group()
  container.name = name
  const p = g.position ?? [0, 0, 0]
  container.position.set(p[0], p[1], p[2])
  if (g.rotation) {
    container.rotation.set(
      MathUtils.degToRad(g.rotation[0]),
      MathUtils.degToRad(g.rotation[1]),
      MathUtils.degToRad(g.rotation[2]),
    )
  }
  return container
}

/**
 * Build the designer's edited asset as a three.Group, floor-anchored and centred
 * (the app's asset convention): an optional cloned + uniformly-scaled source GLB
 * plus every primitive part as a `MeshStandardMaterial` box/cylinder/sphere.
 * Pure of the store — the caller supplies the already-loaded `source` object (or
 * null for a from-scratch asset). The returned group is ready for `exportGlb`.
 *
 * Stage 3a (transform groups): a part that belongs to a `PartGroup` builds under
 * a nested three.Group carrying the group's shared transform, so members move as
 * a unit. Ungrouped parts build at the asset root as before.
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
  // Transform-group containers + a member id → container lookup (Stage 3a).
  const containerByPart = new Map<string, Group>()
  partGroups(spec).forEach((g, i) => {
    const container = buildPartGroupContainer(g, `group-${i + 1}`)
    group.add(container)
    for (const id of g.partIds) containerByPart.set(id, container)
  })

  spec.parts.forEach((part, i) => {
    // A part folded into a combine group is represented by the group's baked
    // result, not on its own. A free hole (no group) exports as a normal solid —
    // its role only cuts inside a Subtract combine (least-surprising: it exports
    // as what the editor shows).
    if (consumed.has(part.id)) return
    const mesh = buildPartMesh(part, `${part.kind}-${i + 1}`, decalsForPart(spec, part.id))
    // A transform-group member builds under its group container (world pose =
    // group transform ∘ part transform); an ungrouped part at the asset root.
    ;(containerByPart.get(part.id) ?? group).add(mesh)
  })

  // Bake each combine group's evaluated result into the export. When every
  // member of the combine belongs to one transform group, the result geometry
  // was baked in that group's LOCAL space (member positions are group-local), so
  // it must live UNDER the group's container to move with the group (finding 1).
  // Ungrouped combines land at the asset root as before.
  combineGroups(spec).forEach((g, i) => {
    const result = results?.get(g.id)
    if (!result) return
    const mesh = combineResultMesh(result)
    mesh.name = `combine-${i + 1}`
    const home = combineHomeGroup(spec, g)
    const container = home ? containerByPart.get(home.partIds[0]) : undefined
    ;(container ?? group).add(mesh)
  })
  return group
}
