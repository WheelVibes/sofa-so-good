import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  type DetectedGroup,
  detectGroups,
  filesUnder,
  looseModelFiles,
} from '../../furniture/ikea/detectGroups'
import { importGroup } from '../../furniture/ikea/importGroup'
import { parseMetadata } from '../../furniture/ikea/metadata'
import { mapCategory } from '../../furniture/ikea/translate'
import { FURNITURE_CATEGORIES, type FurnitureCategory } from '../../furniture/types'
import {
  type BulkImportResult,
  importGlbFiles,
  isModelFile,
  modelName,
} from '../../furniture/upload/bulkImport'
import { persistUserGlb } from '../../furniture/upload/persist'
import { readDroppedItems } from '../../furniture/upload/readDrop'

interface UploadModelDialogProps {
  open: boolean
  onClose: () => void
}

const CATEGORY_LABEL: Record<FurnitureCategory, string> = {
  beds: 'Beds',
  seating: 'Seating',
  tables: 'Tables',
  storage: 'Storage',
  kitchen: 'Kitchen',
  bathroom: 'Bathroom',
  appliances: 'Appliances',
  lighting: 'Lighting',
  decor: 'Decor',
  textiles: 'Textiles',
  outdoor: 'Outdoor',
  electronics: 'Electronics',
  kids: 'Baby & Kids',
  laundry: 'Laundry',
  others: 'Others',
}

/** Outcome of an "import everything" submit: per-group + loose results. */
interface CombinedResult {
  groups: { name: string; ok: boolean; reason?: string }[]
  loose: BulkImportResult | null
  single?: boolean
}

function pathOf(f: File): string {
  return (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
}

export function UploadModelDialog({ open, onClose }: UploadModelDialogProps) {
  const [files, setFiles] = useState<File[]>([])
  const [name, setName] = useState('')
  const [category, setCategory] = useState<FurnitureCategory>('decor')
  const [mounted, setMounted] = useState(false)
  const [noClip, setNoClip] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [result, setResult] = useState<CombinedResult | null>(null)
  const [showSkipped, setShowSkipped] = useState(false)
  const [ikeaGroups, setIkeaGroups] = useState<DetectedGroup[]>([])
  const [dragOver, setDragOver] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const folderInput = useRef<HTMLInputElement>(null)

  if (!open) return null

  // Files that will actually be imported (folder picks include junk).
  const modelFiles = files.filter((f) => isModelFile(pathOf(f)))
  const hasGroups = ikeaGroups.length > 0
  const looseModels = looseModelFiles(files, ikeaGroups)
  // The legacy single-file path: exactly one model, no groups, nothing else.
  const single = !hasGroups && looseModels.length === 1 && files.length === 1

  const reset = () => {
    setFiles([])
    setName('')
    setCategory('decor')
    setMounted(false)
    setNoClip(false)
    setError(null)
    setBusy(false)
    setProgress(null)
    setResult(null)
    setShowSkipped(false)
    setIkeaGroups([])
    setDragOver(false)
  }

  const ingest = (picked: File[]) => {
    setFiles(picked)
    setResult(null)
    setError(null)
    setIkeaGroups([])
    const models = picked.filter((f) => isModelFile(pathOf(f)))
    if (models.length === 1 && picked.length === 1) setName(modelName(picked[0].name))
    else setName('')
    // Auto-detect every IKEA group folder (each has a metadata.json w/ group_key).
    void detectGroups(picked).then(setIkeaGroups)
  }

  const onPick = (list: FileList | null) => ingest(list ? Array.from(list) : [])

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (busy) return
    const picked = await readDroppedItems(e.dataTransfer)
    if (picked.length > 0) ingest(picked)
  }

  const submit = async () => {
    if (modelFiles.length === 0) {
      setError('Pick at least one .glb or .gltf file.')
      return
    }
    setBusy(true)
    setError(null)
    setResult(null)

    // 1. Single loose file (no groups) keeps the named, categorised path.
    if (single) {
      if (!name.trim()) {
        setError('Enter a name.')
        setBusy(false)
        return
      }
      const r = await persistUserGlb(files[0], { name: name.trim(), category, mounted, noClip })
      setBusy(false)
      if (!r.ok) {
        setError(r.reason)
        return
      }
      reset()
      onClose()
      return
    }

    // 2. Import every detected IKEA group, scoped to its own folder.
    const groupResults: CombinedResult['groups'] = []
    for (const g of ikeaGroups) {
      const parsed = parseMetadata(g.meta)
      if (!parsed.ok) {
        groupResults.push({
          name: (g.meta.product_name as string) ?? g.dir,
          ok: false,
          reason: parsed.reason,
        })
        continue
      }
      const r = await importGroup(parsed.data, filesUnder(files, g.dir))
      groupResults.push(
        r.ok
          ? { name: r.def.name, ok: true }
          : { name: parsed.data.product_name, ok: false, reason: r.reason },
      )
    }

    // 3. Loose model files (not under any group) go through the bulk path.
    let loose: BulkImportResult | null = null
    if (looseModels.length > 0) {
      setProgress({ done: 0, total: looseModels.length })
      loose = await importGlbFiles(looseModels, { category, mounted, noClip }, (done, total) =>
        setProgress({ done, total }),
      )
    }

    setBusy(false)
    setProgress(null)
    setResult({ groups: groupResults, loose })
  }

  const okGroups = result?.groups.filter((g) => g.ok).length ?? 0
  const failGroups = result?.groups.filter((g) => !g.ok) ?? []

  const dialog = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-[560px] max-w-[90vw] flex-col rounded-lg bg-white text-sm shadow-2xl">
        <header className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="text-base font-semibold text-neutral-900">Upload models</h2>
          <button
            onClick={() => {
              reset()
              onClose()
            }}
            disabled={busy}
            aria-label="Close"
            className="text-neutral-400 hover:text-neutral-700"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-4 text-xs text-neutral-500">
            Drag in <span className="font-mono">.glb</span>/<span className="font-mono">.gltf</span>{' '}
            files or whole folders — a folder of several IKEA groups imports every group. Stored
            locally in your browser only (max 25&nbsp;MB each).
          </p>

          {result ? (
            <div className="space-y-2">
              <p className="rounded bg-emerald-50 px-2 py-1.5 text-xs text-emerald-700">
                {okGroups > 0
                  ? `Imported ${okGroups} IKEA group${okGroups === 1 ? '' : 's'}`
                  : 'Done'}
                {result.loose
                  ? `, ${result.loose.imported} loose model${result.loose.imported === 1 ? '' : 's'}`
                  : ''}
                {result.loose && result.loose.skipped.length > 0
                  ? `, skipped ${result.loose.skipped.length}`
                  : ''}
                {failGroups.length > 0
                  ? `, ${failGroups.length} group${failGroups.length === 1 ? '' : 's'} failed`
                  : ''}
                .
              </p>
              {failGroups.length > 0 ? (
                <ul className="space-y-0.5 text-xs text-rose-700">
                  {failGroups.map((g, i) => (
                    <li key={i}>
                      <span className="font-medium">{g.name}</span> — {g.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
              {result.loose && result.loose.skipped.length > 0 ? (
                <div className="text-xs">
                  <button
                    onClick={() => setShowSkipped((v) => !v)}
                    className="text-neutral-600 underline"
                  >
                    {showSkipped ? 'Hide' : 'Show'} skipped files
                  </button>
                  {showSkipped ? (
                    <ul className="mt-1 max-h-40 space-y-0.5 overflow-auto">
                      {result.loose.skipped.map((s, i) => (
                        <li key={i} className="text-neutral-500">
                          <span className="font-mono">{s.name}</span> — {s.reason}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                disabled={busy}
                className={`flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
                  dragOver
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-neutral-300 bg-neutral-50 hover:border-neutral-400'
                }`}
              >
                <span className="text-sm font-medium text-neutral-700">
                  {dragOver ? 'Drop to upload' : 'Drag files or folders here'}
                </span>
                <span className="text-xs text-neutral-400">or</span>
                <span className="flex gap-2">
                  <span
                    onClick={(e) => {
                      e.stopPropagation()
                      fileInput.current?.click()
                    }}
                    className="rounded bg-white px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm ring-1 ring-neutral-300 hover:bg-neutral-50"
                  >
                    Choose files
                  </span>
                  <span
                    onClick={(e) => {
                      e.stopPropagation()
                      folderInput.current?.click()
                    }}
                    className="rounded bg-white px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm ring-1 ring-neutral-300 hover:bg-neutral-50"
                  >
                    Choose folder
                  </span>
                </span>
              </button>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                onChange={(e) => onPick(e.target.files)}
                disabled={busy}
                className="hidden"
              />
              <input
                ref={folderInput}
                type="file"
                // @ts-expect-error non-standard but widely supported folder pick
                webkitdirectory=""
                directory=""
                multiple
                onChange={(e) => onPick(e.target.files)}
                disabled={busy}
                className="hidden"
              />

              {modelFiles.length > 0 ? (
                <p className="text-xs text-neutral-500">
                  {modelFiles.length} model file{modelFiles.length === 1 ? '' : 's'} selected
                  {files.length > modelFiles.length
                    ? ` (${files.length - modelFiles.length} non-model ignored)`
                    : ''}
                  .
                </p>
              ) : null}

              {hasGroups ? <IkeaPanel groups={ikeaGroups} looseCount={looseModels.length} /> : null}

              {/* Category/flags apply to loose (non-group) models. */}
              {looseModels.length > 0 ? (
                <>
                  {single ? (
                    <label className="block">
                      <span className="mb-1 block text-xs text-neutral-600">Name</span>
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Vintage armchair"
                        className="block w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                      />
                    </label>
                  ) : null}
                  <label className="block">
                    <span className="mb-1 block text-xs text-neutral-600">
                      Category {hasGroups ? '(loose models)' : ''}
                    </span>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as FurnitureCategory)}
                      disabled={busy}
                      className="block w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm"
                    >
                      {FURNITURE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_LABEL[c]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-neutral-600">
                    <input
                      type="checkbox"
                      checked={mounted}
                      onChange={(e) => setMounted(e.target.checked)}
                      disabled={busy}
                    />
                    Wall / ceiling mounted (skip wall collision)
                  </label>
                  <label className="flex items-center gap-2 text-xs text-neutral-600">
                    <input
                      type="checkbox"
                      checked={noClip}
                      onChange={(e) => setNoClip(e.target.checked)}
                      disabled={busy}
                    />
                    Flat floor covering (rug — never collides)
                  </label>
                </>
              ) : null}

              {progress ? (
                <p className="text-xs text-neutral-600">
                  Importing {progress.done} / {progress.total}…
                </p>
              ) : null}
              {error ? (
                <p className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">{error}</p>
              ) : null}
            </div>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-3">
          <button
            onClick={() => {
              reset()
              onClose()
            }}
            className="rounded px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-100"
            disabled={busy}
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          {result ? (
            <button
              onClick={reset}
              className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
            >
              Import more
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={busy || modelFiles.length === 0 || (single && !name.trim())}
              className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {busy
                ? 'Importing…'
                : submitLabel(hasGroups, ikeaGroups.length, single, looseModels.length)}
            </button>
          )}
        </footer>
      </div>
    </div>
  )

  return createPortal(dialog, document.body)
}

function submitLabel(
  hasGroups: boolean,
  groupCount: number,
  single: boolean,
  looseCount: number,
): string {
  if (hasGroups) {
    const g = `${groupCount} IKEA group${groupCount === 1 ? '' : 's'}`
    return looseCount > 0 ? `Import ${g} + ${looseCount}` : `Import ${g}`
  }
  if (single) return 'Save'
  return `Import ${looseCount}`
}

function IkeaPanel({ groups, looseCount }: { groups: DetectedGroup[]; looseCount: number }) {
  return (
    <div className="space-y-2 rounded border border-blue-200 bg-blue-50 px-3 py-2">
      <p className="text-xs font-semibold text-blue-800">
        {groups.length} IKEA group{groups.length === 1 ? '' : 's'} detected
        {looseCount > 0 ? ` + ${looseCount} loose model${looseCount === 1 ? '' : 's'}` : ''}
      </p>
      <ul className="space-y-1.5">
        {groups.map((g, i) => (
          <IkeaGroupRow key={i} group={g} />
        ))}
      </ul>
    </div>
  )
}

function IkeaGroupRow({ group }: { group: DetectedGroup }) {
  const parsed = parseMetadata(group.meta)
  if (!parsed.ok) {
    return (
      <li className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">
        Invalid metadata in <span className="font-mono">{group.dir || '/'}</span>: {parsed.reason}
      </li>
    )
  }
  const data = parsed.data
  const mapped = mapCategory(data.design.category)
  const totalVariants = data.variants.length
  const withGlb = data.variants.filter((v) => v.glb != null).length
  const lowConfidence = mapped.confidence === 'low' || data.design.category_confidence === 'low'
  return (
    <li className="text-xs text-neutral-700">
      <div className="flex justify-between gap-2">
        <span className="font-medium text-neutral-900">{data.product_name}</span>
        <span className="text-neutral-500">
          {CATEGORY_LABEL[mapped.category]}
          {lowConfidence ? ' ⚠' : ''}
        </span>
      </div>
      <div className="text-neutral-500">
        {withGlb} of {totalVariants} finish{totalVariants === 1 ? '' : 'es'} have a 3D model
      </div>
    </li>
  )
}
