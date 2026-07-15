import { useEffect, useMemo } from 'react'
import { type Group, MathUtils, type Mesh } from 'three'
import {
  type GhostVariant,
  ghostMaterial,
  partGeometry,
  partMaterials,
} from '../../furniture/glbEdit/buildObject'
import {
  type AssetEditSpec,
  combinedPartIds,
  combineGroups,
  partGroups,
  type ShapePart,
} from '../../furniture/glbEdit/editSpec'
import { useStore } from '../../state/store'

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
}: {
  part: ShapePart
  ghost?: GhostVariant
  meshRef?: (m: Mesh | null) => void
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
    />
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
}: {
  spec: AssetEditSpec
  results: Map<string, ShapePart>
  meshRefFor: (id: string) => (m: Mesh | null) => void
  /** Registers each transform-group's container so the gizmo can attach to it
   *  (Stage 3a). */
  groupRefFor: (groupId: string) => (g: Group | null) => void
}) {
  const consumed = combinedPartIds(spec)
  const groups = partGroups(spec)
  const memberToGroup = new Map<string, string>()
  for (const g of groups) for (const id of g.partIds) memberToGroup.set(id, g.id)

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
          <PartMesh key={p.id} part={p} ghost={ghostFor(p)} meshRef={meshRefFor(p.id)} />
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
                <PartMesh key={id} part={p} ghost={ghostFor(p)} meshRef={meshRefFor(id)} />
              ) : null
            })}
          </group>
        )
      })}
      {combineGroups(spec).map((g) => {
        const result = results.get(g.id)
        return result ? <PartMesh key={`result:${g.id}`} part={result} /> : null
      })}
    </>
  )
}
