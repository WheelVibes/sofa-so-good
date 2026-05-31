import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  type DetectedGroup,
  detectGroups,
  looseModelFiles,
} from '../../furniture/ikea/detectGroups'
import { parseMetadata } from '../../furniture/ikea/metadata'
import { mapCategory } from '../../furniture/ikea/translate'
import { FURNITURE_CATEGORIES, type FurnitureCategory } from '../../furniture/types'
import { isModelFile, modelName } from '../../furniture/upload/bulkImport'
import { persistUserGlb } from '../../furniture/upload/persist'
import { readDroppedItems } from '../../furniture/upload/readDrop'
import { startBackgroundImport } from '../../furniture/upload/runImport'
import { ConfirmDialog } from './ConfirmDialog'

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

function pathOf(f: File): string {
  return (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
}

function Spinner({ small }: { small?: boolean }) {
  return (
    <svg
      className={`${small ? 'h-4 w-4' : 'h-6 w-6'} animate-spin text-blue-600`}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z"
      />
    </svg>
  )
}

export function UploadModelDialog({ open, onClose }: UploadModelDialogProps) {
  const [files, setFiles] = useState<File[]>([])
  const [name, setName] = useState('')
  // 'auto' lets each asset keep its own detected category (model groups carry
  // one); loose GLBs with no embedded category fall back to the 'others'
  // catch-all. A concrete pick forces that category on the loose models.
  const [category, setCategory] = useState<FurnitureCategory | 'auto'>('auto')
  const [mounted, setMounted] = useState(false)
  const [noClip, setNoClip] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The brief inline save of a single named loose file (groups + bulk run in
  // the background instead — see startBackgroundImport).
  const [busy, setBusy] = useState(false)
  const [ikeaGroups, setIkeaGroups] = useState<DetectedGroup[]>([])
  const [dragOver, setDragOver] = useState(false)
  // Live count while the recursive directory walk reads a dropped folder.
  const [scanCount, setScanCount] = useState<number | null>(null)
  // Detection progress while detectGroups() reads + parses metadata.json after
  // a pick/drop: { parsed, total }. null when not detecting.
  const [detectProgress, setDetectProgress] = useState<{ parsed: number; total: number } | null>(
    null,
  )
  const detecting = detectProgress !== null
  // When the user tries to leave mid-scan/import, confirm before discarding.
  const [confirmClose, setConfirmClose] = useState(false)
  const folderInput = useRef<HTMLInputElement>(null)

  // A scan, detection, or import is running — leaving now would abandon it.
  const inProgress = busy || scanCount !== null || detecting

  const doClose = () => {
    reset()
    onClose()
  }
  // Closing while work is in flight asks first; otherwise closes immediately.
  const requestClose = () => {
    if (inProgress) setConfirmClose(true)
    else doClose()
  }

  // Esc requests a close (which itself guards on in-progress work). Skipped
  // while the confirm popup is up — that dialog owns Esc then.
  // biome-ignore lint/correctness/useExhaustiveDependencies: requestClose is recreated each render; inProgress in deps is what actually changes the behaviour, and re-binding on every render would be wasteful.
  useEffect(() => {
    if (!open || confirmClose) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        requestClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, confirmClose, inProgress])

  if (!open) return null

  // Files that will actually be imported (folder picks include junk).
  const modelFiles = files.filter((f) => isModelFile(pathOf(f)))
  const hasGroups = ikeaGroups.length > 0
  const looseModels = looseModelFiles(files, ikeaGroups)
  // The legacy single-file path: exactly one model, no groups, nothing else.
  const single = !hasGroups && looseModels.length === 1 && files.length === 1
  // Category applied to loose GLBs: a concrete pick, or the 'others' catch-all
  // when left on Auto (a raw GLB carries no category to detect).
  const looseCategory: FurnitureCategory = category === 'auto' ? 'others' : category

  const reset = () => {
    setFiles([])
    setName('')
    setCategory('auto')
    setMounted(false)
    setNoClip(false)
    setError(null)
    setBusy(false)
    setIkeaGroups([])
    setDragOver(false)
    setScanCount(null)
    setDetectProgress(null)
    setConfirmClose(false)
  }

  const ingest = (picked: File[]) => {
    setFiles(picked)
    setError(null)
    setIkeaGroups([])
    const models = picked.filter((f) => isModelFile(pathOf(f)))
    if (models.length === 1 && picked.length === 1) setName(modelName(picked[0].name))
    else setName('')
    // Auto-detect every model-group folder (each has a metadata.json w/
    // group_key). Reads + parses each metadata.json — report progress for the UI.
    setDetectProgress({ parsed: 0, total: 0 })
    void detectGroups(picked, (parsed, total) => setDetectProgress({ parsed, total }))
      .then(setIkeaGroups)
      .finally(() => setDetectProgress(null))
  }

  const onPick = (list: FileList | null) => ingest(list ? Array.from(list) : [])

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (busy || scanCount !== null) return
    setScanCount(0)
    try {
      const picked = await readDroppedItems(e.dataTransfer, (n) => setScanCount(n))
      if (picked.length > 0) ingest(picked)
    } finally {
      setScanCount(null)
    }
  }

  const submit = async () => {
    if (modelFiles.length === 0) {
      setError('Pick at least one .glb or .gltf file.')
      return
    }

    // A single named loose file keeps the inline rename path (it's fast and the
    // user typed a name) — persist then close.
    if (single) {
      if (!name.trim()) {
        setError('Enter a name.')
        return
      }
      setBusy(true)
      setError(null)
      const r = await persistUserGlb(files[0], {
        name: name.trim(),
        category: looseCategory,
        mounted,
        noClip,
      })
      setBusy(false)
      if (!r.ok) {
        setError(r.reason)
        return
      }
      if (r.duplicate) {
        setError(`“${r.def.name}” is already in your catalog — nothing to import.`)
        return
      }
      doClose()
      return
    }

    // Everything else (groups and/or many loose files) imports in the
    // background: kick off a tracked job, then close the modal immediately so
    // the user can keep working while a persistent progress widget runs.
    startBackgroundImport({ files, groups: ikeaGroups, looseCategory, mounted, noClip })
    doClose()
  }

  const dialog = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative flex max-h-[85vh] w-[560px] max-w-[90vw] flex-col rounded-lg bg-white text-sm shadow-2xl">
        <header className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <h2 className="text-base font-semibold text-neutral-900">Upload models</h2>
          <button
            onClick={requestClose}
            aria-label="Close"
            className="text-neutral-400 hover:text-neutral-700"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-4 text-xs text-neutral-500">
            Drag in <span className="font-mono">.glb</span>/<span className="font-mono">.gltf</span>{' '}
            files or whole folders — a folder of several model groups imports every group. Stored
            locally in your browser only (max 25&nbsp;MB each).
          </p>

          <div className="space-y-3">
            {/* A <div> (not <button>) is the drop target — native buttons
                  mishandle drag-drop and won't populate dataTransfer entries. */}
            <div
              onDragOver={(e) => {
                e.preventDefault()
                if (!busy && scanCount === null) setDragOver(true)
              }}
              onDragEnter={(e) => e.preventDefault()}
              onDragLeave={(e) => {
                // Only clear when the cursor actually leaves the zone, not when
                // it crosses onto a child element.
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false)
              }}
              onDrop={onDrop}
              className={`flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
                dragOver ? 'border-blue-500 bg-blue-50' : 'border-neutral-300 bg-neutral-50'
              }`}
            >
              {scanCount !== null ? (
                <>
                  <Spinner />
                  <span className="text-sm font-medium text-neutral-700">
                    Scanning folder… {scanCount} file{scanCount === 1 ? '' : 's'}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-sm font-medium text-neutral-700">
                    {dragOver ? 'Drop to upload' : 'Drag files or a folder here'}
                  </span>
                  <span className="text-xs text-neutral-400">or</span>
                  <button
                    type="button"
                    onClick={() => folderInput.current?.click()}
                    disabled={busy}
                    className="rounded bg-white px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm ring-1 ring-neutral-300 hover:bg-neutral-50 disabled:opacity-50"
                  >
                    Choose folder…
                  </button>
                </>
              )}
            </div>
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

            {detectProgress ? (
              <div className="space-y-1">
                <p className="flex items-center gap-2 text-xs text-neutral-600">
                  <Spinner small />
                  {detectProgress.total > 0
                    ? `Detecting model groups… ${detectProgress.parsed} / ${detectProgress.total}`
                    : 'Detecting model groups…'}
                </p>
                {detectProgress.total > 0 ? (
                  <div className="h-1 w-full overflow-hidden rounded bg-neutral-200">
                    <div
                      className="h-full bg-blue-600 transition-all"
                      style={{
                        width: `${(detectProgress.parsed / detectProgress.total) * 100}%`,
                      }}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            {hasGroups ? <GroupPanel groups={ikeaGroups} looseCount={looseModels.length} /> : null}

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
                    onChange={(e) => setCategory(e.target.value as FurnitureCategory | 'auto')}
                    disabled={busy}
                    className="block w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm"
                  >
                    <option value="auto">Auto (use detected, else Others)</option>
                    {FURNITURE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABEL[c]}
                      </option>
                    ))}
                  </select>
                  {category === 'auto' ? (
                    <span className="mt-1 block text-[10px] text-neutral-400">
                      Model groups keep their own detected category; loose files go to Others.
                    </span>
                  ) : null}
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

            {error ? (
              <p className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">{error}</p>
            ) : null}
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-neutral-200 px-5 py-3">
          <button
            onClick={requestClose}
            className="rounded px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || detecting || modelFiles.length === 0 || (single && !name.trim())}
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {busy
              ? 'Saving…'
              : submitLabel(hasGroups, ikeaGroups.length, single, looseModels.length)}
          </button>
        </footer>

        <ConfirmDialog
          open={confirmClose}
          title="Still preparing your upload"
          message={
            scanCount !== null
              ? `Still scanning your folder (${scanCount} file${scanCount === 1 ? '' : 's'} so far). Close and discard it?`
              : 'Still detecting model groups. Close and discard this upload?'
          }
          confirmLabel="Discard & close"
          cancelLabel="Keep going"
          tone="danger"
          onConfirm={doClose}
          onCancel={() => setConfirmClose(false)}
        />
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
    const g = `${groupCount} model group${groupCount === 1 ? '' : 's'}`
    return looseCount > 0 ? `Import ${g} + ${looseCount}` : `Import ${g}`
  }
  if (single) return 'Save'
  return `Import ${looseCount}`
}

function GroupPanel({ groups, looseCount }: { groups: DetectedGroup[]; looseCount: number }) {
  return (
    <div className="space-y-2 rounded border border-blue-200 bg-blue-50 px-3 py-2">
      <p className="text-xs font-semibold text-blue-800">
        {groups.length} model group{groups.length === 1 ? '' : 's'} detected
        {looseCount > 0 ? ` + ${looseCount} loose model${looseCount === 1 ? '' : 's'}` : ''}
      </p>
      <ul className="space-y-1.5">
        {groups.map((g, i) => (
          <GroupRow key={i} group={g} />
        ))}
      </ul>
    </div>
  )
}

function GroupRow({ group }: { group: DetectedGroup }) {
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
