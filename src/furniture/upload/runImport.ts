import { useStore } from '../../state/store'
import { filesUnder, looseModelFiles } from '../ikea/detectGroups'
import { importGroup } from '../ikea/importGroup'
import { parseMetadata } from '../ikea/metadata'
import type { FurnitureCategory, IkeaGltfDef } from '../types'
import { type BulkImportResult, COMMIT_BATCH, importGlbFiles } from './bulkImport'

export interface ImportPlan {
  files: File[]
  groups: { dir: string; meta: Record<string, unknown> }[]
  /** Category for loose (non-group) files; groups keep their own. */
  looseCategory: FurnitureCategory
  mounted: boolean
  noClip: boolean
  /** Opt-in KTX2/UASTC texture encode for the optimize pass (falls back to WebP). */
  ktx2?: boolean
}

export interface ImportOutcome {
  groups: { name: string; ok: boolean; reason?: string }[]
  loose: BulkImportResult | null
}

/** Max groups imported concurrently. Each group does several full-file reads +
 *  IDB writes; a handful in parallel saturates the I/O without flooding it. */
export const GROUP_CONCURRENCY = 4

/** Total work units = group count + loose-file count (so one progress scale
 *  spans both phases). */
export function planUnits(plan: ImportPlan): number {
  return plan.groups.length + looseModelFiles(plan.files, plan.groups).length
}

/**
 * Run an import to completion, reporting progress via `onProgress(done, total)`.
 * Groups are imported through a bounded concurrency pool (parallel, big speedup
 * over the old serial loop); loose files go through the already-pooled bulk
 * path. Independent of any React component, so it keeps running after the
 * upload modal closes (the caller wires `onProgress` to a persistent
 * notification).
 */
export async function runImport(
  plan: ImportPlan,
  onProgress?: (done: number, total: number) => void,
): Promise<ImportOutcome> {
  const loose = looseModelFiles(plan.files, plan.groups)
  const total = plan.groups.length + loose.length
  let done = 0
  const tick = () => onProgress?.(++done, total)
  onProgress?.(0, total)

  // Groups: bounded-concurrency pool. Each worker builds its def WITHOUT
  // committing (commit:false); built defs are flushed to the store in batches of
  // COMMIT_BATCH via one addManyUserFurniture call each. Committing per group
  // re-runs buildMergedCatalog (O(total)) in every subscriber — including the
  // in-canvas FurnitureLayer/DragController — for all 3562 groups (O(n²)),
  // starving the render loop until the browser kills the WebGL context (white
  // flicker). Batching turns thousands of rebuilds into a few dozen.
  const { addManyUserFurniture } = useStore.getState()
  const groupResults: ImportOutcome['groups'] = new Array(plan.groups.length)
  let pending: IkeaGltfDef[] = []
  const flush = () => {
    if (pending.length === 0) return
    addManyUserFurniture(pending)
    pending = []
  }
  let cursor = 0
  const worker = async (): Promise<void> => {
    while (cursor < plan.groups.length) {
      const i = cursor++
      const g = plan.groups[i]
      const parsed = parseMetadata(g.meta)
      if (!parsed.ok) {
        groupResults[i] = {
          name: (g.meta.product_name as string) ?? g.dir,
          ok: false,
          reason: parsed.reason,
        }
      } else {
        const r = await importGroup(parsed.data, filesUnder(plan.files, g.dir), { commit: false })
        if (r.ok) {
          pending.push(r.def)
          if (pending.length >= COMMIT_BATCH) flush()
          groupResults[i] = { name: r.def.name, ok: true }
        } else {
          groupResults[i] = { name: parsed.data.product_name, ok: false, reason: r.reason }
        }
      }
      tick()
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(GROUP_CONCURRENCY, plan.groups.length) }, () => worker()),
  )
  flush() // commit any tail below the batch size

  // Loose files: bulk path (its own internal pool); advance the shared bar.
  let looseResult: BulkImportResult | null = null
  if (loose.length > 0) {
    const base = done
    looseResult = await importGlbFiles(
      loose,
      {
        category: plan.looseCategory,
        mounted: plan.mounted,
        noClip: plan.noClip,
        allFiles: plan.files,
        ktx2: plan.ktx2,
      },
      (d) => onProgress?.(base + d, total),
    )
  }

  return { groups: groupResults, loose: looseResult }
}

/**
 * Kick off `runImport` as a background job tracked by a single `notify`
 * progress notification (rendered persistently in the corner). Returns
 * immediately with the running promise so the caller can also await it if it
 * wants the result; closing the modal does not cancel it.
 */
export function startBackgroundImport(plan: ImportPlan): Promise<ImportOutcome> {
  const { notify } = useStore.getState()
  const label = importLabel(plan)
  const id = notify.start({ title: label, kind: 'progress', message: 'Importing…' })

  // Coalesce progress to ~one store write per animation frame: a 3562-group
  // import fires onProgress thousands of times; one notify.update each would
  // re-render the notification (and its subscribers) per group, piling onto the
  // main thread we're trying to keep free.
  let latest = { d: 0, t: planUnits(plan) }
  let scheduled = false
  const pushProgress = () => {
    scheduled = false
    notify.update(id, {
      progress: latest.t ? latest.d / latest.t : 0,
      message: `${latest.d} / ${latest.t}`,
    })
  }
  const raf =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb: () => void) => setTimeout(cb, 16) as unknown as number

  return runImport(plan, (d, t) => {
    latest = { d, t }
    if (!scheduled) {
      scheduled = true
      raf(pushProgress)
    }
  })
    .then((outcome) => {
      const ok = outcome.groups.filter((g) => g.ok).length
      const failed = outcome.groups.filter((g) => !g.ok).length
      const looseN = outcome.loose?.imported ?? 0
      const dupes = outcome.loose?.duplicates ?? 0
      const parts: string[] = []
      if (ok > 0) parts.push(`${ok} group${ok === 1 ? '' : 's'}`)
      if (looseN > 0) parts.push(`${looseN} model${looseN === 1 ? '' : 's'}`)
      let summary = parts.length ? `Imported ${parts.join(', ')}` : 'Nothing new imported'
      if (dupes > 0) summary += ` · ${dupes} already in catalog`
      if (failed > 0) {
        // Attach each failure (name + reason) so the notification expands into a
        // detailed list — also fold in any loose-file skips.
        const details = [
          ...outcome.groups
            .filter((g) => !g.ok)
            .map((g) => ({ name: g.name, reason: g.reason ?? 'Unknown error' })),
          ...(outcome.loose?.skipped ?? []).map((s) => ({ name: s.name, reason: s.reason })),
        ]
        notify.error(id, `${summary} · ${failed} failed (click for details)`, details)
      } else notify.success(id, summary)
      return outcome
    })
    .catch((e) => {
      notify.error(id, e instanceof Error ? e.message : String(e))
      throw e
    })
}

function importLabel(plan: ImportPlan): string {
  const g = plan.groups.length
  const l = looseModelFiles(plan.files, plan.groups).length
  if (g > 0 && l > 0)
    return `Importing ${g} group${g === 1 ? '' : 's'} + ${l} model${l === 1 ? '' : 's'}`
  if (g > 0) return `Importing ${g} model group${g === 1 ? '' : 's'}`
  return `Importing ${l} model${l === 1 ? '' : 's'}`
}
