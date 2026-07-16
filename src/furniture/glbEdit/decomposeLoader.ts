/**
 * GLB Asset Designer — async decompose helpers for GLB source defs + the srcRef
 * lifecycle glue (Asset Studio Stage 9a). The PROCEDURAL decompose path lives in
 * the UI layer (`ui/glbEditor/decomposeHost.tsx`) because it needs an offscreen
 * R3F render of the primitive component; this module owns the GLB path + the pure
 * spec-level ref bookkeeping (restore-time drop of unresolvable refs, gathering the
 * def ids to resolve before an export), all React-free.
 */

import { type DecomposeResult, decomposeObject } from './decompose'
import { type AssetEditSpec, removePart, type SrcRef } from './editSpec'
import { loadGlbScene, populateSrcRefCacheFromScene } from './srcRefCache'

/**
 * Decompose a GLB def into REFERENCE parts (Stage 9a): load its GLB once through
 * the SEC-1 loader, seed the srcRef cache from that scene (so the preview resolves
 * immediately), and decompose in reference mode — every mesh part carries a
 * `srcRef` back to `defId` instead of inlined triangles. `url` is the def's
 * `runtimeUrl` (a blob: URL).
 */
export async function decomposeGlbDef(defId: string, url: string): Promise<DecomposeResult> {
  const scene = await loadGlbScene(url)
  populateSrcRefCacheFromScene(defId, scene)
  return decomposeObject(scene, { ref: { defId } })
}

/** The distinct source-def ids a spec's `srcRef` parts reference. */
export function specSrcRefDefIds(spec: AssetEditSpec): string[] {
  const set = new Set<string>()
  for (const p of spec.parts) if (p.srcRef) set.add(p.srcRef.defId)
  return [...set]
}

/**
 * Drop every `srcRef` part the caller deems unresolvable (Stage 9a — honest
 * degradation when a saved design's source GLB was deleted, OR the Stage-9a-review
 * case where the source was REPLACED by a different GLB so the ref's drift
 * fingerprint no longer matches). The `isResolvable` predicate receives the whole
 * `SrcRef` so it can check both def existence AND fingerprint drift. Returns the
 * pruned spec (groups/combines/decals pruned via `removePart`) + how many parts
 * were dropped, so the caller can toast. A spec with no unresolvable refs returns
 * unchanged.
 */
export function dropUnresolvableSrcRefParts(
  spec: AssetEditSpec,
  isResolvable: (ref: SrcRef) => boolean,
): { spec: AssetEditSpec; dropped: number } {
  const doomed = spec.parts.filter((p) => p.srcRef && !isResolvable(p.srcRef))
  if (doomed.length === 0) return { spec, dropped: 0 }
  let next = spec
  for (const p of doomed) next = removePart(next, p.id)
  return { spec: next, dropped: doomed.length }
}
