/**
 * CSG v2 (Stage 1b) — live, debounced evaluation of a spec's combine groups for
 * the designer preview. Each `CombineGroup`'s boolean is evaluated off the main
 * thread (`csgEval.combineGroupToMeshPart` → shared worker pool, main-thread
 * fallback) into a transient `mesh` `ShapePart`, keyed by group id.
 *
 * Debounced so a param/gizmo drag on an operand doesn't evaluate per-frame —
 * evaluation fires ~after the edit settles (the history `commit` already
 * coalesces the drag, and this adds its own trailing debounce). A per-group
 * signature skips re-evaluating groups whose operands didn't change. A
 * `computing` flag flips true only when a pending evaluation outlives
 * `SLOW_MS` (~150 ms), so the dialog shows a "Computing…" hint just for the
 * slow ones. Stale async results are dropped via a monotonic token.
 */

import { useEffect, useRef, useState } from 'react'
import { combineGroupToMeshPart, groupMembers } from '../../furniture/glbEdit/csgEval'
import {
  type AssetEditSpec,
  type CombineGroup,
  combineGroups,
  type ShapePart,
} from '../../furniture/glbEdit/editSpec'

const DEBOUNCE_MS = 140
const SLOW_MS = 150

/** Cheap change-signature for a group: its op + each live member's transform /
 *  geometry params (NOT full mesh triangle arrays — a mesh member's only live
 *  inputs are its position/rotation, already captured). */
function groupSignature(spec: AssetEditSpec, group: CombineGroup): string {
  const members = groupMembers(spec, group)
  return JSON.stringify({
    op: group.op,
    ids: group.partIds,
    m: members.map((p) => ({
      k: p.kind,
      s: p.size,
      p: p.position,
      r: p.rotation ?? null,
      role: p.role ?? 'solid',
      bevel: p.bevel ?? 0,
      profile: p.profile ?? null,
      outline: p.outline ?? null,
      segments: p.segments ?? null,
      sweepProfile: p.sweepProfile ?? null,
      sweepPath: p.sweepPath ?? null,
      // A baked mesh member: its geometry never changes in place (size is fixed),
      // so a vertex count is enough to detect a swap.
      g: p.geometry?.positions.length ?? null,
    })),
  })
}

/**
 * Reconcile per-group bookkeeping against the live group set: prune signature
 * entries for groups that no longer exist (they'd otherwise leak AND make a
 * re-added group with the same id look "unchanged" so it never re-evaluates —
 * e.g. after undo), and return the ids whose signature changed (need re-eval).
 * Pure — unit-tested independently of the React hook.
 */
export function reconcileGroupSignatures(
  current: { id: string; sig: string }[],
  prevSig: Map<string, string>,
): { stale: string[]; nextSig: Map<string, string> } {
  const liveIds = new Set(current.map((g) => g.id))
  const nextSig = new Map<string, string>()
  for (const [id, sig] of prevSig) if (liveIds.has(id)) nextSig.set(id, sig)
  const stale = current.filter((g) => nextSig.get(g.id) !== g.sig).map((g) => g.id)
  return { stale, nextSig }
}

export interface CombineResults {
  /** groupId → evaluated result mesh part (present once computed successfully). */
  results: Map<string, ShapePart>
  /** True while a slow (>SLOW_MS) evaluation is in flight — drives the hint. */
  computing: boolean
  /** groupIds whose latest evaluation was degenerate (empty result). */
  errors: Set<string>
}

export function useCombineResults(spec: AssetEditSpec): CombineResults {
  const [results, setResults] = useState<Map<string, ShapePart>>(new Map())
  const [computing, setComputing] = useState(false)
  const [errors, setErrors] = useState<Set<string>>(new Set())
  // Last signature actually evaluated per group (skip unchanged re-evals).
  const sigRef = useRef<Map<string, string>>(new Map())
  const tokenRef = useRef(0)

  const groups = combineGroups(spec)
  // A stable dependency: the concatenated signatures of every current group.
  // Intentionally the ONLY dep of the effect below — `spec`/`groups` object refs
  // change every render and would defeat the debounce; `specSig` folds their live
  // values into one string that changes exactly when an operand actually changes.
  const specSig = groups.map((g) => `${g.id}:${groupSignature(spec, g)}`).join('||')

  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed only on specSig (a value-signature) by design — see the comment above.
  useEffect(() => {
    const token = ++tokenRef.current
    // Drop results/errors for groups that no longer exist.
    setResults((prev) => {
      const next = new Map(prev)
      let changed = false
      for (const id of next.keys()) {
        if (!groups.some((g) => g.id === id)) {
          next.delete(id)
          changed = true
        }
      }
      return changed ? next : prev
    })

    // Prune stale sigRef entries alongside the results Map (a group can be
    // ungrouped then restored by undo with the SAME id — a leftover signature
    // would mask it as "unchanged" and it would never re-evaluate) and find the
    // groups whose signature changed and need (re)evaluation.
    const { stale: staleIds, nextSig } = reconcileGroupSignatures(
      groups.map((g) => ({ id: g.id, sig: groupSignature(spec, g) })),
      sigRef.current,
    )
    sigRef.current = nextSig
    const stale = groups.filter((g) => staleIds.includes(g.id))
    if (stale.length === 0) return

    const debounce = setTimeout(() => {
      if (tokenRef.current !== token) return
      const slow = setTimeout(() => {
        if (tokenRef.current === token) setComputing(true)
      }, SLOW_MS)
      let done = 0
      const finish = () => {
        done += 1
        if (done === stale.length && tokenRef.current === token) {
          clearTimeout(slow)
          setComputing(false)
        }
      }
      for (const g of stale) {
        const sig = groupSignature(spec, g)
        combineGroupToMeshPart(spec, g)
          .then((part) => {
            if (tokenRef.current !== token) return
            sigRef.current.set(g.id, sig)
            setResults((prev) => {
              const next = new Map(prev)
              next.set(g.id, part)
              return next
            })
            setErrors((prev) => {
              if (!prev.has(g.id)) return prev
              const next = new Set(prev)
              next.delete(g.id)
              return next
            })
          })
          .catch(() => {
            if (tokenRef.current !== token) return
            sigRef.current.set(g.id, sig)
            // Degenerate — drop any stale result and flag the error.
            setResults((prev) => {
              if (!prev.has(g.id)) return prev
              const next = new Map(prev)
              next.delete(g.id)
              return next
            })
            setErrors((prev) => {
              if (prev.has(g.id)) return prev
              const next = new Set(prev)
              next.add(g.id)
              return next
            })
          })
          .finally(finish)
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(debounce)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specSig])

  return { results, computing, errors }
}
