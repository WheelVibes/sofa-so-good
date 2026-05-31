import { useStore } from '../../state/store'
import { filesUnder, looseModelFiles } from '../ikea/detectGroups'
import { importGroup } from '../ikea/importGroup'
import { parseMetadata } from '../ikea/metadata'
import type { FurnitureCategory } from '../types'
import { type BulkImportResult, importGlbFiles } from './bulkImport'

export interface ImportPlan {
  files: File[]
  groups: { dir: string; meta: Record<string, unknown> }[]
  /** Category for loose (non-group) files; groups keep their own. */
  looseCategory: FurnitureCategory
  mounted: boolean
  noClip: boolean
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

  // Groups: bounded-concurrency pool over the group list.
  const groupResults: ImportOutcome['groups'] = new Array(plan.groups.length)
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
        const r = await importGroup(parsed.data, filesUnder(plan.files, g.dir))
        groupResults[i] = r.ok
          ? { name: r.def.name, ok: true }
          : { name: parsed.data.product_name, ok: false, reason: r.reason }
      }
      tick()
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(GROUP_CONCURRENCY, plan.groups.length) }, () => worker()),
  )

  // Loose files: bulk path (its own internal pool); advance the shared bar.
  let looseResult: BulkImportResult | null = null
  if (loose.length > 0) {
    const base = done
    looseResult = await importGlbFiles(
      loose,
      { category: plan.looseCategory, mounted: plan.mounted, noClip: plan.noClip },
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

  return runImport(plan, (d, t) => {
    notify.update(id, { progress: t ? d / t : 0, message: `${d} / ${t}` })
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
      if (failed > 0) notify.error(id, `${summary} · ${failed} failed`)
      else notify.success(id, summary)
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
