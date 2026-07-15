import { useEffect, useMemo } from 'react'
import { MathUtils, type Mesh } from 'three'
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
}: {
  spec: AssetEditSpec
  results: Map<string, ShapePart>
  meshRefFor: (id: string) => (m: Mesh | null) => void
}) {
  const consumed = combinedPartIds(spec)
  return (
    <>
      {spec.parts.map((p) => {
        const ghost: GhostVariant | undefined =
          p.role === 'hole' ? 'hole' : consumed.has(p.id) ? 'consumed' : undefined
        return <PartMesh key={p.id} part={p} ghost={ghost} meshRef={meshRefFor(p.id)} />
      })}
      {combineGroups(spec).map((g) => {
        const result = results.get(g.id)
        return result ? <PartMesh key={`result:${g.id}`} part={result} /> : null
      })}
    </>
  )
}
