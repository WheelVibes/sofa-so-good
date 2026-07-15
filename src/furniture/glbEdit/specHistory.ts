/**
 * GLB Asset Designer — a bounded undo/redo history around the pure
 * `AssetEditSpec` state (`editSpec.ts`). The designer owns the spec in React
 * state; this module is the pure, unit-testable reducer that records each edit
 * as a snapshot so ⌘Z / ⇧⌘Z (and the toolbar buttons) can step through them.
 *
 * Design notes:
 *  - **Snapshots, not diffs.** A spec is a small, immutable, JSON-serialisable
 *    tree (parts/meshOverrides), so keeping whole snapshots is simpler and
 *    cheaper to reason about than a command log — every spec helper already
 *    returns a fresh object, so no cloning is needed here.
 *  - **Bounded** to `HISTORY_LIMIT` entries: the oldest are dropped once the log
 *    grows past it, so a long session can't grow the history unboundedly.
 *  - **Coalescing.** A rapid stream of edits carrying the same `coalesceKey`
 *    within `COALESCE_MS` collapses into ONE entry (a slider/gizmo drag of 40
 *    frames becomes a single undo step) — mirroring the store's
 *    `pushHistoryCoalesced` idiom. A structural edit (add/remove/duplicate/
 *    combine) passes no key, so it always lands as its own step.
 *  - Pushing past an undo TRUNCATES the redo future, like any editor.
 */

import type { AssetEditSpec } from './editSpec'

/** Max snapshots kept (oldest dropped past this). */
export const HISTORY_LIMIT = 50
/** Window within which same-key pushes merge into the current entry. */
export const COALESCE_MS = 300

interface HistoryEntry {
  spec: AssetEditSpec
  /** Coalesce key of the edit that produced this entry (undefined = structural,
   *  never merges). */
  coalesceKey?: string
  /** Timestamp (ms) of the last edit folded into this entry. */
  t: number
}

export interface SpecHistory {
  entries: HistoryEntry[]
  /** Index of the current (live) entry within `entries`. */
  index: number
}

export interface PushOptions {
  /** When set, a push with the SAME key within `COALESCE_MS` of the current
   *  entry replaces it instead of adding a new step. */
  coalesceKey?: string
  /** Injectable clock for tests; defaults to `Date.now()`. */
  now?: number
}

/** A fresh history seeded with `spec` as its only (current) entry. */
export function createSpecHistory(spec: AssetEditSpec, now = Date.now()): SpecHistory {
  return { entries: [{ spec, t: now }], index: 0 }
}

/** The current (live) spec. */
export function currentSpec(hist: SpecHistory): AssetEditSpec {
  return hist.entries[hist.index].spec
}

export function canUndo(hist: SpecHistory): boolean {
  return hist.index > 0
}

export function canRedo(hist: SpecHistory): boolean {
  return hist.index < hist.entries.length - 1
}

/**
 * Record `spec` as the new current state. Truncates any redo future first, then
 * either COALESCES into the current entry (same `coalesceKey`, within
 * `COALESCE_MS`) or appends a new entry, dropping the oldest once past
 * `HISTORY_LIMIT`. Returns a new history (pure; never mutates the input).
 */
export function pushSpec(
  hist: SpecHistory,
  spec: AssetEditSpec,
  opts: PushOptions = {},
): SpecHistory {
  const now = opts.now ?? Date.now()
  // Drop any redo future — a new edit after an undo forks a fresh timeline.
  const kept = hist.entries.slice(0, hist.index + 1)
  const cur = kept[kept.length - 1]

  // Coalesce a rapid same-key stream into the current entry.
  if (
    opts.coalesceKey !== undefined &&
    cur.coalesceKey === opts.coalesceKey &&
    now - cur.t <= COALESCE_MS
  ) {
    const merged = kept.slice(0, -1)
    merged.push({ spec, coalesceKey: opts.coalesceKey, t: now })
    return { entries: merged, index: merged.length - 1 }
  }

  const next = [...kept, { spec, coalesceKey: opts.coalesceKey, t: now }]
  // Bound: drop from the front so the newest edits always survive.
  const overflow = next.length - HISTORY_LIMIT
  const trimmed = overflow > 0 ? next.slice(overflow) : next
  return { entries: trimmed, index: trimmed.length - 1 }
}

/** Step one entry back (no-op at the start). */
export function undo(hist: SpecHistory): SpecHistory {
  return canUndo(hist) ? { ...hist, index: hist.index - 1 } : hist
}

/** Step one entry forward (no-op at the end). */
export function redo(hist: SpecHistory): SpecHistory {
  return canRedo(hist) ? { ...hist, index: hist.index + 1 } : hist
}
