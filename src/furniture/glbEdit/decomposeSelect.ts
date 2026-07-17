/**
 * GLB Asset Designer — SELECTIVE decompose extraction (Asset Studio Stage 9b, the
 * "grab the legs" flow). Stage 9a's `decomposeObject` returns the WHOLE source
 * def's `{ parts, groups }`; this module turns that into a checkbox-able list and
 * inserts only the CHOSEN parts ALONGSIDE the current design (offset on +X like a
 * template insert), instead of replacing it.
 *
 * The picker is PART-granular so a user can grab individual meshes even when the
 * source decomposed into ONE big group (a chair whose seat/back/legs all sit under
 * one root node). `decomposeEntries` presents each top-level GROUP as a "select
 * all" row followed by its member rows (indented), then each loose part; selection
 * is a set of PART ids throughout. `subsetDecompose` keeps a source group ONLY when
 * every one of its members is chosen (a partial pick — e.g. just the 4 legs —
 * inserts them as loose parts). `insertDecomposedSubset` clones the subset with
 * FRESH ids (duplicate-id safety — srcRefs kept verbatim) and shifts it clear of
 * the existing content on +X. Pure of React/store/GPU → unit-testable.
 */

import type { DecomposeResult } from './decompose'
import {
  type AssetEditSpec,
  clonePartAtPose,
  newPartGroupId,
  type PartGroup,
  partGroups,
  type ShapePart,
} from './editSpec'

/** Gap (m) between existing content and the inserted subset (mirrors the template
 *  insert gap). */
const INSERT_GAP_M = 0.3

/** One selectable row in the part-picker. A `'group'` row is a "select all"
 *  convenience over its members; a `'part'` row is a single mesh (indented under
 *  its group, or a top-level loose part). Selection is by PART id throughout, so a
 *  group row governs `partIds` = its members and a part row governs just itself. */
export interface DecomposeEntry {
  /** Group id (`kind: 'group'`) or part id (`kind: 'part'`). Row identity only. */
  id: string
  kind: 'group' | 'part'
  name: string
  /** The PART ids this row toggles (a group's members, or the one part). */
  partIds: string[]
  /** True for a member row shown indented under its group row. */
  member: boolean
}

/** The set of part ids consumed by SOME group in the result. */
function groupedPartIds(result: DecomposeResult): Set<string> {
  const set = new Set<string>()
  for (const g of result.groups) for (const id of g.partIds) set.add(id)
  return set
}

/** Default label for a part at result index `i` (its name, else `kind N`). */
function partLabel(part: ShapePart, i: number): string {
  return part.name?.trim() || `${part.kind} ${i + 1}`
}

/**
 * Build the picker rows for a decompose result (Stage 9b): each top-level group as
 * a "select all" row followed by its indented member rows, then every loose part.
 * Pure.
 */
export function decomposeEntries(result: DecomposeResult): DecomposeEntry[] {
  const indexOf = new Map<string, number>()
  result.parts.forEach((p, i) => {
    indexOf.set(p.id, i)
  })
  const entries: DecomposeEntry[] = []
  for (const g of result.groups) {
    entries.push({ id: g.id, kind: 'group', name: g.name, partIds: [...g.partIds], member: false })
    for (const id of g.partIds) {
      const p = result.parts.find((x) => x.id === id)
      if (p) {
        entries.push({
          id,
          kind: 'part',
          name: partLabel(p, indexOf.get(id) ?? 0),
          partIds: [id],
          member: true,
        })
      }
    }
  }
  const grouped = groupedPartIds(result)
  result.parts.forEach((p, i) => {
    if (grouped.has(p.id)) return
    entries.push({ id: p.id, kind: 'part', name: partLabel(p, i), partIds: [p.id], member: false })
  })
  return entries
}

/** Every part id (the default-all selection). */
export function allDecomposePartIds(result: DecomposeResult): string[] {
  return result.parts.map((p) => p.id)
}

/**
 * Filter a full decompose result to the CHOSEN part ids (Stage 9b). A source group
 * survives ONLY when every one of its members is chosen; a partially-chosen group
 * is dropped and its chosen members become loose parts. Returns `{ parts, groups }`
 * in result order. Pure.
 */
export function subsetDecompose(
  result: DecomposeResult,
  selectedPartIds: ReadonlySet<string>,
): { parts: ShapePart[]; groups: PartGroup[] } {
  const parts = result.parts.filter((p) => selectedPartIds.has(p.id))
  const groups = result.groups.filter((g) => g.partIds.every((id) => selectedPartIds.has(id)))
  return { parts, groups }
}

/** Greatest world-X extent of a spec's existing parts (accounting for any
 *  transform-group X offset), or `null` when it has no parts. */
function specMaxWorldX(spec: AssetEditSpec): number | null {
  if (spec.parts.length === 0) return null
  const groupX = new Map<string, number>()
  for (const g of partGroups(spec)) {
    const gx = g.position?.[0] ?? 0
    for (const id of g.partIds) groupX.set(id, gx)
  }
  let max = -Infinity
  for (const p of spec.parts) {
    max = Math.max(max, p.position[0] + (groupX.get(p.id) ?? 0) + p.size[0] / 2)
  }
  return max
}

/** Least local-X extent over a set of parts (for the alongside offset). */
function partsMinX(parts: ShapePart[]): number {
  let min = Infinity
  for (const p of parts) min = Math.min(min, p.position[0] - p.size[0] / 2)
  return Number.isFinite(min) ? min : 0
}

/**
 * Insert a decompose subset ALONGSIDE the current design (Stage 9b). Every part is
 * deep-cloned with a FRESH id (its srcRef / geometry / material ride along); the
 * chosen groups are re-minted over the cloned ids; the whole subset is shifted on
 * +X so its left edge clears the existing content by a small gap (never replacing
 * it — the 9a "Make parts editable" flow keeps the full-replace semantics). One
 * commit. Returns `{ spec, partIds, groupIds }` (the fresh ids, for selection).
 * Pure.
 */
export function insertDecomposedSubset(
  spec: AssetEditSpec,
  subParts: ShapePart[],
  subGroups: PartGroup[],
): { spec: AssetEditSpec; partIds: string[]; groupIds: string[] } {
  if (subParts.length === 0) return { spec, partIds: [], groupIds: [] }
  const existingMaxX = specMaxWorldX(spec)
  const offsetX = existingMaxX === null ? 0 : existingMaxX + INSERT_GAP_M - partsMinX(subParts)
  const idMap = new Map<string, string>()
  const cloned = subParts.map((p) => {
    const c = clonePartAtPose(
      p,
      [p.position[0] + offsetX, p.position[1], p.position[2]],
      p.rotation ? [...p.rotation] : undefined,
    )
    idMap.set(p.id, c.id)
    return c
  })
  const newGroups: PartGroup[] = subGroups.map((g) => ({
    id: newPartGroupId(),
    name: g.name,
    partIds: g.partIds.map((id) => idMap.get(id)).filter((id): id is string => !!id),
  }))
  const next: AssetEditSpec = {
    ...spec,
    parts: [...spec.parts, ...cloned],
    partGroups: [...partGroups(spec), ...newGroups],
  }
  return { spec: next, partIds: cloned.map((p) => p.id), groupIds: newGroups.map((g) => g.id) }
}
