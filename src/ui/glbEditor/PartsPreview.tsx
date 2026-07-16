import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { type Group, MathUtils, type Mesh, Vector3 } from 'three'
import {
  type GhostVariant,
  ghostMaterial,
  partGeometry,
  partMaterials,
} from '../../furniture/glbEdit/buildObject'
import { decalGeometry, decalMaterial } from '../../furniture/glbEdit/decals'
import {
  type AssetEditSpec,
  combinedPartIds,
  combineGroups,
  type Decal,
  decalsForPart,
  partGroups,
  type ShapePart,
} from '../../furniture/glbEdit/editSpec'
import { useStore } from '../../state/store'

/** A decal overlay child of a part mesh (Stage 5) — built from the SAME
 *  `decalGeometry`/`decalMaterial` the export uses, so the preview matches the
 *  saved GLB. Geometry/material are memoised on the decal + the part geometry and
 *  disposed on change/unmount. */
function DecalMesh({
  decal,
  targetGeo,
}: {
  decal: Decal
  targetGeo: ReturnType<typeof partGeometry>
}) {
  const geom = useMemo(() => decalGeometry(targetGeo, decal), [targetGeo, decal])
  useEffect(() => () => geom.dispose(), [geom])
  const mat = useMemo(() => decalMaterial(decal), [decal])
  useEffect(() => () => mat.dispose(), [mat])
  return <mesh geometry={geom} material={mat} renderOrder={2} />
}

/** One primitive part, built from the SAME `partGeometry` + `partMaterials` the
 *  export uses (so the preview can never drift from the saved GLB). Geometry
 *  and material(s) are memoised on the part and disposed when they change/unmount
 *  (`partMaterials` always returns owned instances — cached finish materials are
 *  cloned with shared textures — so disposing is safe).
 *
 *  CSG v2: a `ghost` variant renders the part translucent (a combine-group
 *  operand — `hole` cut or a faint `consumed` solid proxy) so it stays visible
 *  and gizmo-selectable while the evaluated result mesh reads on top. */
function PartMesh({
  part,
  ghost,
  meshRef,
  onPlaceFace,
  onPlaceDecal,
  decals,
}: {
  part: ShapePart
  ghost?: GhostVariant
  meshRef?: (m: Mesh | null) => void
  /** When set (a component is armed), a click on this mesh places the component
   *  on the clicked face (world point + world normal). */
  onPlaceFace?: (point: [number, number, number], normal: [number, number, number]) => void
  /** When set (a decal is armed), a click projects the decal onto this part —
   *  the hit is passed in the PART'S LOCAL frame (Stage 5). */
  onPlaceDecal?: (
    partId: string,
    point: [number, number, number],
    normal: [number, number, number],
  ) => void
  /** Decals projected onto this part (Stage 5) — rendered as offset children. */
  decals?: Decal[]
}) {
  // A picked `mat:<id>` texture builds into the cache asynchronously — the
  // epoch bump re-resolves the material once it's ready (GE3c).
  const epoch = useStore((s) => s.materialEpoch)
  // `part` is recreated immutably by updatePart on every edit, so depending on
  // it rebuilds the geometry exactly when kind/size change.
  const geom = useMemo(() => partGeometry(part), [part])
  useEffect(() => () => geom.dispose(), [geom])
  // For a combined mesh part with per-source materials, partMaterials returns an
  // array; for all other parts it returns a single material (GE3c tail). A ghost
  // operand always uses the single translucent ghost material instead.
  const mat = useMemo(() => {
    void epoch // a finish may have just been built into the material cache
    return ghost ? ghostMaterial(part, ghost) : partMaterials(part)
  }, [part, epoch, ghost])
  useEffect(
    () => () => {
      if (Array.isArray(mat))
        mat.forEach((m) => {
          m.dispose()
        })
      else mat.dispose()
    },
    [mat],
  )
  const rot = part.rotation
  const onClick =
    onPlaceFace || onPlaceDecal
      ? (e: ThreeEvent<MouseEvent>) => {
          // Only the front-most hit places (SWOOD click); don't let the click also
          // reach the ground plane / meshes behind.
          e.stopPropagation()
          const p = e.point
          const face = e.face
          if (!face) return
          if (onPlaceDecal) {
            // Decal placement (Stage 5): the projector lives in the part's LOCAL
            // frame, so pass the local hit point + the geometry-local face normal.
            const lp = e.object.worldToLocal(p.clone())
            const ln = face.normal
            onPlaceDecal(part.id, [lp.x, lp.y, lp.z], [ln.x, ln.y, ln.z])
            return
          }
          // Geometry-local face normal → world direction (accounts for the mesh's
          // own rotation + any group transform above it).
          const wn = new Vector3()
            .copy(face.normal)
            .transformDirection(e.object.matrixWorld)
            .normalize()
          onPlaceFace?.([p.x, p.y, p.z], [wn.x, wn.y, wn.z])
        }
      : undefined
  return (
    <mesh
      ref={meshRef}
      position={part.position}
      rotation={
        rot
          ? [MathUtils.degToRad(rot[0]), MathUtils.degToRad(rot[1]), MathUtils.degToRad(rot[2])]
          : undefined
      }
      castShadow={!ghost}
      receiveShadow={!ghost}
      renderOrder={ghost ? 1 : 0}
      geometry={geom}
      material={mat}
      onClick={onClick}
    >
      {/* Decals ride as offset children (part-local frame) so they follow the
          part under any group/transform (Stage 5). Suppressed on ghost operands. */}
      {!ghost && decals
        ? decals.map((d) => <DecalMesh key={d.id} decal={d} targetGeo={geom} />)
        : null}
    </mesh>
  )
}

/**
 * The composed primitive parts, rendered declaratively (export uses
 * buildEditedObject). CSG v2: parts consumed by a combine group render as
 * translucent ghosts (still gizmo-selectable so the operand stays editable),
 * `hole`-role parts always render as a ghost cut, and each group's evaluated
 * result (`results`) renders as the opaque solid outcome on top.
 */
export function PartsPreview({
  spec,
  results,
  meshRefFor,
  groupRefFor,
  onPlaceFace,
  onPlaceDecal,
}: {
  spec: AssetEditSpec
  results: Map<string, ShapePart>
  meshRefFor: (id: string) => (m: Mesh | null) => void
  /** Registers each transform-group's container so the gizmo can attach to it
   *  (Stage 3a). */
  groupRefFor: (groupId: string) => (g: Group | null) => void
  /** Stage 3b: when a component is armed, a click on any part face places it. */
  onPlaceFace?: (point: [number, number, number], normal: [number, number, number]) => void
  /** Stage 5: when a decal is armed, a click projects it onto the clicked part
   *  (hit passed in the part's local frame). */
  onPlaceDecal?: (
    partId: string,
    point: [number, number, number],
    normal: [number, number, number],
  ) => void
}) {
  const consumed = combinedPartIds(spec)
  const groups = partGroups(spec)
  const memberToGroup = new Map<string, string>()
  for (const g of groups) for (const id of g.partIds) memberToGroup.set(id, g.id)

  // A combine result whose members all belong to one transform group renders
  // INSIDE that group's wrapper (its geometry is baked in group-local space, so
  // it must move with the group — finding 1); ungrouped combines render at root.
  const combines = combineGroups(spec)
  const resultHomeGroup = (cg: (typeof combines)[number]): string | null =>
    cg.partIds[0] ? (memberToGroup.get(cg.partIds[0]) ?? null) : null
  const resultMesh = (cg: (typeof combines)[number]) => {
    const result = results.get(cg.id)
    return result ? <PartMesh key={`result:${cg.id}`} part={result} /> : null
  }

  // Ghost styling applies ONLY to parts consumed by a combine group: a consumed
  // hole reads as a cut, a consumed solid as a faint proxy. A FREE hole (no
  // group) renders as a normal solid — its role is just a marker until it's added
  // to a Subtract combine (so the preview matches what the export bakes).
  const ghostFor = (p: ShapePart): GhostVariant | undefined =>
    consumed.has(p.id) ? (p.role === 'hole' ? 'hole' : 'consumed') : undefined

  return (
    <>
      {/* Ungrouped parts build at the asset root. */}
      {spec.parts
        .filter((p) => !memberToGroup.has(p.id))
        .map((p) => (
          <PartMesh
            key={p.id}
            part={p}
            ghost={ghostFor(p)}
            meshRef={meshRefFor(p.id)}
            onPlaceFace={onPlaceFace}
            onPlaceDecal={onPlaceDecal}
            decals={decalsForPart(spec, p.id)}
          />
        ))}
      {/* Transform-group members build under a container carrying the group's
          shared transform, so their world pose = group transform ∘ part
          transform (matches buildEditedObject). */}
      {groups.map((g) => {
        const rot = g.rotation
        return (
          <group
            key={g.id}
            ref={groupRefFor(g.id)}
            position={g.position ?? [0, 0, 0]}
            rotation={
              rot
                ? [
                    MathUtils.degToRad(rot[0]),
                    MathUtils.degToRad(rot[1]),
                    MathUtils.degToRad(rot[2]),
                  ]
                : undefined
            }
          >
            {g.partIds.map((id) => {
              const p = spec.parts.find((pp) => pp.id === id)
              return p ? (
                <PartMesh
                  key={id}
                  part={p}
                  ghost={ghostFor(p)}
                  meshRef={meshRefFor(id)}
                  onPlaceFace={onPlaceFace}
                  onPlaceDecal={onPlaceDecal}
                  decals={decalsForPart(spec, id)}
                />
              ) : null
            })}
            {/* Combine results whose members belong to THIS group ride inside it. */}
            {combines.filter((cg) => resultHomeGroup(cg) === g.id).map(resultMesh)}
          </group>
        )
      })}
      {/* Ungrouped combine results render at the asset root. */}
      {combines.filter((cg) => resultHomeGroup(cg) === null).map(resultMesh)}
    </>
  )
}
