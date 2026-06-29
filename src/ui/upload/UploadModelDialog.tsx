import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useModalGuard } from '../../controls/modalGuard'
import {
  type DetectedGroup,
  detectGroups,
  looseModelFiles,
} from '../../furniture/ikea/detectGroups'
import { parseMetadata } from '../../furniture/ikea/metadata'
import { mapCategory } from '../../furniture/ikea/translate'
import { FURNITURE_CATEGORIES, type FurnitureCategory } from '../../furniture/types'
import { isModelFile, modelName, prepareModelFile } from '../../furniture/upload/bulkImport'
import { hashFile } from '../../furniture/upload/hashFile'
import { inferCollisionFlags } from '../../furniture/upload/inferFlags'
import { persistUserGlb } from '../../furniture/upload/persist'
import { readDroppedItems } from '../../furniture/upload/readDrop'
import { startBackgroundImport } from '../../furniture/upload/runImport'
import { Select } from '../controls/Select'
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
      className={`${small ? 'h-4 w-4' : 'h-6 w-6'} animate-spin text-[var(--accent-soft-text)]`}
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
  // Auto-detect per-file collision flags from filenames (e.g. a folder with a
  // rug, a ceiling lamp and a sofa each get the right behaviour). On by default;
  // the explicit checkboxes below force a flag on for every loose file on top.
  const [autoFlags, setAutoFlags] = useState(true)
  // Opt-in: route the optimize pass through the KTX2/UASTC encoder (falls back
  // to WebP when the encoder is unavailable, so it's safe to leave on).
  const [ktx2, setKtx2] = useState(false)
  // Default-on: also generate -low/-medium LOD variants per model so
  // Performance-tier devices load a decimated copy. Opt-out because the extra
  // tiers roughly double the per-model optimize time on large GLBs.
  const [lodTiers, setLodTiers] = useState(true)
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
  const panelRef = useRef<HTMLDivElement>(null)

  // A scan, detection, or import is running — leaving now would abandon it.
  const inProgress = busy || scanCount !== null || detecting

  // Modal-style overlay: suppress global shortcuts while open.
  useModalGuard(open)

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
        return
      }
      // Trap Tab within the dialog so keyboard users can't reach the inert page
      // behind it (UX-003).
      if (e.key === 'Tab') {
        const panel = panelRef.current
        if (!panel) return
        const f = panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
        if (f.length === 0) {
          e.preventDefault()
          panel.focus()
          return
        }
        const first = f[0]
        const last = f[f.length - 1]
        const active = document.activeElement
        if (e.shiftKey && (active === first || active === panel)) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && active === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, confirmClose, inProgress])

  // Move focus into the dialog on open + restore it on close (a11y, UX-003).
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    panelRef.current?.focus()
    return () => prev?.focus?.()
  }, [open])

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
    setKtx2(false)
    setLodTiers(true)
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
      setError('Pick at least one supported model file.')
      return
    }

    // A single named loose file keeps the inline rename path (it's fast and the
    // user typed a name) — convert (if needed) + optimize, persist, then close.
    if (single) {
      if (!name.trim()) {
        setError('Enter a name.')
        return
      }
      setBusy(true)
      setError(null)
      try {
        // Dedupe on the SOURCE bytes (matches the bulk path) so re-importing the
        // same file is recognised regardless of optimizer non-determinism.
        const contentHash = await hashFile(files[0])
        const prepared = await prepareModelFile(files[0], files, { ktx2, lodTiers })
        const auto = autoFlags ? inferCollisionFlags(files[0].name) : null
        const r = await persistUserGlb(prepared.file, {
          name: name.trim(),
          category: looseCategory,
          mounted: mounted || auto?.mounted || undefined,
          noClip: noClip || auto?.noClip || undefined,
          contentHash,
          lods: prepared.lods,
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
      } catch (e) {
        setBusy(false)
        setError(e instanceof Error ? e.message : String(e))
      }
      return
    }

    // Everything else (groups and/or many loose files) imports in the
    // background: kick off a tracked job, then close the modal immediately so
    // the user can keep working while a persistent progress widget runs.
    startBackgroundImport({
      files,
      groups: ikeaGroups,
      looseCategory,
      mounted,
      noClip,
      autoFlags,
      ktx2,
      lodTiers,
    })
    doClose()
  }

  const dialog = (
    <div className="modal-overlay">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-model-title"
        tabIndex={-1}
        className="relative flex max-h-[85vh] w-[560px] max-w-[90vw] flex-col rounded-lg bg-[var(--surface-solid)] text-sm shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h2 id="upload-model-title" className="text-base font-semibold text-[var(--text)]">
            Upload models
          </h2>
          <button
            onClick={requestClose}
            aria-label="Close"
            className="text-[var(--text-3)] hover:text-[var(--text-2)]"
          >
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="mb-4 text-xs text-[var(--text-3)]">
            Drag in <span className="font-mono">.glb</span>/<span className="font-mono">.gltf</span>{' '}
            or <span className="font-mono">.obj/.fbx/.stl/.ply/.dae/.3ds/.3mf/.usdz</span> files (or
            whole folders — a folder of several model groups imports every group). Non-GLB models
            are converted to GLB and every model is optimized in your browser. Stored locally only.
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
                dragOver
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)]'
                  : 'border-[var(--border-2)] bg-[var(--surface-2)]'
              }`}
            >
              {scanCount !== null ? (
                <>
                  <Spinner />
                  <span className="text-sm font-medium text-[var(--text-2)]">
                    Scanning folder… {scanCount} file{scanCount === 1 ? '' : 's'}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-sm font-medium text-[var(--text-2)]">
                    {dragOver ? 'Drop to upload' : 'Drag files or a folder here'}
                  </span>
                  <span className="text-xs text-[var(--text-3)]">or</span>
                  <button
                    type="button"
                    onClick={() => folderInput.current?.click()}
                    disabled={busy}
                    className="rounded bg-[var(--surface-solid)] px-3 py-1 text-xs font-medium text-[var(--text-2)] shadow-sm ring-1 ring-[var(--border-2)] hover:bg-[var(--surface-2)] disabled:opacity-50"
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
              <p className="text-xs text-[var(--text-3)]">
                {modelFiles.length} model file{modelFiles.length === 1 ? '' : 's'} selected
                {files.length > modelFiles.length
                  ? ` (${files.length - modelFiles.length} non-model ignored)`
                  : ''}
                .
              </p>
            ) : null}

            {detectProgress ? (
              <div className="space-y-1">
                <p className="flex items-center gap-2 text-xs text-[var(--text-2)]">
                  <Spinner small />
                  {detectProgress.total > 0
                    ? `Detecting model groups… ${detectProgress.parsed} / ${detectProgress.total}`
                    : 'Detecting model groups…'}
                </p>
                {detectProgress.total > 0 ? (
                  <div className="h-1 w-full overflow-hidden rounded bg-[var(--surface-3)]">
                    <div
                      className="h-full bg-[var(--accent)] transition-all"
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
                    <span className="mb-1 block text-xs text-[var(--text-2)]">Name</span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Vintage armchair"
                      className="block w-full rounded border border-[var(--border-2)] px-2 py-1 text-sm"
                    />
                  </label>
                ) : null}
                <div className="block">
                  <span className="mb-1 block text-xs text-[var(--text-2)]">
                    Category {hasGroups ? '(loose models)' : ''}
                  </span>
                  <Select
                    value={category}
                    onChange={(v) => setCategory(v as FurnitureCategory | 'auto')}
                    disabled={busy}
                    className="block w-full rounded border border-[var(--border-2)] bg-[var(--surface-solid)] px-2 py-1 text-sm"
                    options={[
                      { value: 'auto', label: 'Auto (use detected, else Others)' },
                      ...FURNITURE_CATEGORIES.map((c) => ({
                        value: c,
                        label: CATEGORY_LABEL[c],
                      })),
                    ]}
                  />
                  {category === 'auto' ? (
                    <span className="mt-1 block text-[10px] text-[var(--text-3)]">
                      Model groups keep their own detected category; loose files go to Others.
                    </span>
                  ) : null}
                </div>
                <label className="flex items-center gap-2 text-xs text-[var(--text-2)]">
                  <input
                    type="checkbox"
                    checked={autoFlags}
                    onChange={(e) => setAutoFlags(e.target.checked)}
                    disabled={busy}
                  />
                  Auto-detect mounted / rug per file from its name
                </label>
                <label className="flex items-center gap-2 text-xs text-[var(--text-2)]">
                  <input
                    type="checkbox"
                    checked={mounted}
                    onChange={(e) => setMounted(e.target.checked)}
                    disabled={busy}
                  />
                  {autoFlags
                    ? 'Force all wall / ceiling mounted'
                    : 'Wall / ceiling mounted (skip wall collision)'}
                </label>
                <label className="flex items-center gap-2 text-xs text-[var(--text-2)]">
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

            {/* KTX2 drives the in-browser optimize pass for uploaded models
                (IKEA groups arrive pre-optimized), so it's shown whenever loose
                models will be imported. */}
            {looseModels.length > 0 ? (
              <>
                <label className="flex items-center gap-2 text-xs text-[var(--text-2)]">
                  <input
                    type="checkbox"
                    checked={lodTiers}
                    onChange={(e) => setLodTiers(e.target.checked)}
                    disabled={busy}
                  />
                  Generate low-detail versions for slower devices (takes longer per model)
                </label>
                <label className="flex items-center gap-2 text-xs text-[var(--text-2)]">
                  <input
                    type="checkbox"
                    checked={ktx2}
                    onChange={(e) => setKtx2(e.target.checked)}
                    disabled={busy}
                  />
                  Maximum compression (KTX2/UASTC textures — falls back to WebP if unavailable)
                </label>
              </>
            ) : null}

            {error ? (
              <p className="rounded bg-[var(--danger-soft)] px-2 py-1 text-xs text-[var(--danger)]">
                {error}
              </p>
            ) : null}
          </div>
        </div>

        <footer className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3">
          <button
            onClick={requestClose}
            className="rounded px-3 py-1 text-sm text-[var(--text-2)] hover:bg-[var(--surface-2)]"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || detecting || modelFiles.length === 0 || (single && !name.trim())}
            className="rounded bg-[var(--accent)] px-3 py-1 text-sm text-[var(--on-accent)] hover:bg-[var(--accent-2)] disabled:cursor-not-allowed disabled:bg-[var(--surface-3)]"
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
    <div className="space-y-2 rounded border border-[var(--border)] bg-[var(--accent-soft)] px-3 py-2">
      <p className="text-xs font-semibold text-[var(--accent-soft-text)]">
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
      <li className="rounded border border-[var(--danger)] bg-[var(--danger-soft)] px-2 py-1 text-xs text-[var(--danger)]">
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
    <li className="text-xs text-[var(--text-2)]">
      <div className="flex justify-between gap-2">
        <span className="font-medium text-[var(--text)]">{data.product_name}</span>
        <span className="text-[var(--text-3)]">
          {CATEGORY_LABEL[mapped.category]}
          {lowConfidence ? ' ⚠' : ''}
        </span>
      </div>
      <div className="text-[var(--text-3)]">
        {withGlb} of {totalVariants} finish{totalVariants === 1 ? '' : 'es'} have a 3D model
      </div>
    </li>
  )
}
