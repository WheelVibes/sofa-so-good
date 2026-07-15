import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
  type IkeaProgressEvent,
  registerGroup,
  sidecarStatus,
  startScrape,
  streamProgress,
} from '../../catalog/packs/ikeaLive'
import {
  installPack,
  installPolyHavenBundle,
  installPolyPizzaPack,
} from '../../catalog/packs/install'
import { polyHavenBundle } from '../../catalog/packs/polyHaven'
import { visiblePacks } from '../../catalog/packs/registry'
import type { Pack } from '../../catalog/packs/types'
import { uninstallPack } from '../../catalog/packs/uninstall'
import { useFeature } from '../../features/useFeature'
import { useStore } from '../../state/store'

const fmtMB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

/** Shared presentational chrome for the install-style pack cards (zip / Poly
 *  Pizza / Poly Haven): the bordered card, name (+ optional right-aligned meta
 *  like size or item count), description, and the attribution line with an
 *  optional trailing source/help link. Each card supplies its own install
 *  controls as `children`. Keeps the file's local Tailwind-var style. */
function PackCardShell({
  pack,
  meta,
  linkLabel,
  children,
}: {
  pack: Pack
  meta?: ReactNode
  /** When set, renders " · <link>" after the attribution (e.g. 'source'). */
  linkLabel?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded border border-[var(--border)] bg-[var(--surface-solid)] p-3">
      {meta !== undefined ? (
        <div className="flex items-baseline justify-between">
          <div className="text-sm font-semibold text-[var(--text)]">{pack.name}</div>
          <div className="text-[10px] text-[var(--text-3)]">{meta}</div>
        </div>
      ) : (
        <div className="text-sm font-semibold text-[var(--text)]">{pack.name}</div>
      )}
      <p className="text-xs text-[var(--text-2)]">{pack.description}</p>
      <div className="text-[10px] text-[var(--text-3)]">
        {pack.attribution}
        {linkLabel && (
          <>
            {' '}
            ·{' '}
            <a className="underline" href={pack.sourceUrl} target="_blank" rel="noreferrer">
              {linkLabel}
            </a>
          </>
        )}
      </div>
      {children}
    </div>
  )
}

/** Shared "✓ N items installed  · Remove/Uninstall" footer row for an installed
 *  pack. Copy (count label + remove-button text) varies per card, passed in. */
function PackRemoveRow({
  label,
  removeLabel,
  onRemove,
}: {
  label: string
  removeLabel: string
  onRemove: () => void
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-[var(--accent-soft-text)]">✓ {label}</span>
      <button onClick={onRemove} className="text-[11px] text-[var(--danger)] underline">
        {removeLabel}
      </button>
    </div>
  )
}

/** Live-scrape IKEA pack: drives the local sidecar, shows per-product progress. */
function IkeaLiveCard({ pack }: { pack: Pack }) {
  const [sidecarUp, setSidecarUp] = useState<boolean | null>(null)
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const [items, setItems] = useState<Record<string, IkeaProgressEvent>>({})
  const [registered, setRegistered] = useState(0)
  const cancelRef = useRef<null | (() => void)>(null)
  // Distinct group keys already imported this run. A multi-finish group fires
  // `group_ready` once per landed finish (so we re-import with the fuller
  // metadata), but it must only count toward "N added" once. The in-flight set
  // also serialises re-registers of the same group so a later (fuller) import
  // can't be clobbered by an earlier one finishing last.
  const registeredGroups = useRef<Set<string>>(new Set())
  const registeringGroups = useRef<Set<string>>(new Set())

  useEffect(() => {
    sidecarStatus().then((s) => setSidecarUp(!!s))
    return () => cancelRef.current?.()
  }, [])

  async function onStart() {
    setRunning(true)
    setItems({})
    setRegistered(0)
    registeredGroups.current = new Set()
    registeringGroups.current = new Set()
    try {
      await startScrape(0)
    } catch {
      setRunning(false)
      setSidecarUp(false)
      return
    }
    cancelRef.current = streamProgress(
      (ev) => {
        if (typeof ev.done === 'number' && typeof ev.total === 'number') {
          setProgress({ done: ev.done, total: ev.total })
        } else if (ev.phase === 'run_started' && typeof ev.total === 'number') {
          setProgress((p) => ({ ...p, total: ev.total! }))
        }
        if (ev.glb) {
          setItems((m) => ({ ...m, [`${ev.group}/${ev.glb}`]: ev }))
        }
        if (ev.phase === 'run_complete') {
          setRunning(false)
          cancelRef.current?.()
        }
      },
      (group) => {
        // Skip if a register for this group is already in flight (the next
        // group_ready will re-run with the fuller metadata once it frees up).
        if (registeringGroups.current.has(group)) return
        registeringGroups.current.add(group)
        void registerGroup(group)
          .then((ok) => {
            // Count each distinct group once, even across re-imports.
            if (ok && !registeredGroups.current.has(group)) {
              registeredGroups.current.add(group)
              setRegistered((n) => n + 1)
            }
          })
          .finally(() => registeringGroups.current.delete(group))
      },
    )
  }

  if (sidecarUp === false) {
    return (
      <div className="flex flex-col gap-2 rounded border border-[var(--border)] bg-[var(--surface-solid)] p-3">
        <div className="text-sm font-semibold text-[var(--text)]">{pack.name}</div>
        <p className="text-xs text-[var(--text-2)]">{pack.description}</p>
        <div className="pack-notice">
          Sidecar not detected. Run <code className="font-mono">npm run scraper-server</code> to
          enable live IKEA scraping.
        </div>
      </div>
    )
  }

  const rows = Object.entries(items).slice(-12)
  return (
    <div className="flex flex-col gap-2 rounded border border-[var(--border)] bg-[var(--surface-solid)] p-3">
      <div className="text-sm font-semibold text-[var(--text)]">{pack.name}</div>
      <p className="text-xs text-[var(--text-2)]">{pack.description}</p>
      <div className="text-[10px] text-[var(--text-3)]">{pack.attribution}</div>
      {running ? (
        <div className="flex flex-col gap-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded bg-[var(--surface-3)]">
            <div
              className="h-full bg-[var(--accent)] transition-all"
              style={{
                width: progress.total ? `${(progress.done / progress.total) * 100}%` : '0%',
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-[var(--text-3)]">
            <span>
              {progress.done}/{progress.total || '…'} products
            </span>
            <span className="text-[var(--accent-soft-text)]">{registered} added</span>
          </div>
          <ul className="max-h-32 overflow-y-auto text-[10px] text-[var(--text-2)]">
            {rows.map(([k, ev]) => (
              <li key={k} className="flex justify-between gap-2">
                <span className="truncate">{k}</span>
                <span className="shrink-0 text-[var(--text-3)]">{ev.phase}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <button
          onClick={() => void onStart()}
          disabled={sidecarUp === null}
          className="rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--on-accent)] hover:bg-[var(--accent-2)] disabled:opacity-50"
        >
          {registered > 0 ? `Scrape more (${registered} added)` : 'Scrape IKEA catalogue'}
        </button>
      )}
    </div>
  )
}

/** Hosted-zip pack card (Kenney etc.) — the original install flow. */
function ZipPackCard({ pack }: { pack: Pack }) {
  const installed = useStore((s) => s.installedPacks)
  const isInstalled = !!installed[pack.id]
  const entryCount = installed[pack.id]?.entries.length ?? 0
  const size = pack.sizeBytes ?? 0
  const [busy, setBusy] = useState(false)

  async function onInstall() {
    setBusy(true)
    try {
      await installPack(pack)
    } catch {
      // Surfaced via the install flow's progress/error notification.
    } finally {
      setBusy(false)
    }
  }

  return (
    <PackCardShell pack={pack} meta={fmtMB(size)} linkLabel="source">
      {isInstalled ? (
        <PackRemoveRow
          label={`${entryCount} items installed`}
          removeLabel="Uninstall"
          onRemove={() => void uninstallPack(pack.id)}
        />
      ) : (
        <button
          onClick={() => void onInstall()}
          disabled={busy}
          className="rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--on-accent)] hover:bg-[var(--accent-2)] disabled:opacity-50"
        >
          {busy ? 'Installing…' : `Install (${fmtMB(size)})`}
        </button>
      )}
    </PackCardShell>
  )
}

/** Poly Pizza pack card: user-supplied API key + search term → in-browser GLB
 *  download via the CORS-friendly Poly Pizza API. Works in production builds. */
function PolyPizzaCard({ pack }: { pack: Pack }) {
  const installed = useStore((s) => s.installedPacks)
  const entryCount = installed[pack.id]?.entries.length ?? 0
  // The Poly Pizza API key is a user secret — keep it in memory for this session
  // only, never persisted to localStorage (CodeQL js/clear-text-storage-of-sensitive-data).
  const [apiKey, setApiKey] = useState('')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onDownload() {
    const key = apiKey.trim()
    if (!key) {
      setError('Enter your Poly Pizza API key first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await installPolyPizzaPack(pack, { apiKey: key, query: query.trim() || 'furniture' })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PackCardShell pack={pack} linkLabel="get a free API key">
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="Poly Pizza API key"
        autoComplete="off"
        className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-3)]"
      />
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !busy) void onDownload()
          }}
          placeholder="Search (e.g. sofa, lamp) — blank = furniture"
          className="min-w-0 flex-1 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2 py-1.5 text-xs text-[var(--text)] placeholder:text-[var(--text-3)]"
        />
        <button
          onClick={() => void onDownload()}
          disabled={busy}
          className="shrink-0 rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--on-accent)] hover:bg-[var(--accent-2)] disabled:opacity-50"
        >
          {busy ? 'Downloading…' : 'Download'}
        </button>
      </div>
      {error && (
        <div className="rounded bg-[color-mix(in_oklch,var(--danger)_12%,transparent)] px-2 py-1.5 text-[11px] text-[var(--danger)]">
          {error}
        </div>
      )}
      {entryCount > 0 && (
        <PackRemoveRow
          label={`${entryCount} models in your catalog`}
          removeLabel="Remove all"
          onRemove={() => void uninstallPack(pack.id)}
        />
      )}
    </PackCardShell>
  )
}

/** Curated Poly Haven bundle card: one click fetches every CC0 item in the
 *  bundle (glTF + textures) and packs each into a self-contained GLB in-browser.
 *  Works in production builds (keyless, CORS-friendly Poly Haven API). */
function PolyHavenBundleCard({ pack }: { pack: Pack }) {
  const installed = useStore((s) => s.installedPacks)
  const isInstalled = !!installed[pack.id]
  const entryCount = installed[pack.id]?.entries.length ?? 0
  const itemCount = polyHavenBundle(pack.id)?.items.length ?? 0
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onAdd() {
    setBusy(true)
    setError(null)
    try {
      await installPolyHavenBundle(pack)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PackCardShell pack={pack} meta={`${itemCount} items`} linkLabel="source">
      {isInstalled ? (
        <PackRemoveRow
          label={`${entryCount} items added`}
          removeLabel="Remove all"
          onRemove={() => void uninstallPack(pack.id)}
        />
      ) : (
        <button
          onClick={() => void onAdd()}
          disabled={busy}
          className="rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--on-accent)] hover:bg-[var(--accent-2)] disabled:opacity-50"
        >
          {busy ? 'Adding…' : `Add bundle (${itemCount} items)`}
        </button>
      )}
      {error && (
        <div className="rounded bg-[color-mix(in_oklch,var(--danger)_12%,transparent)] px-2 py-1.5 text-[11px] text-[var(--danger)]">
          {error}
        </div>
      )}
    </PackCardShell>
  )
}

/** Manual-source card: a source with no CORS/programmatic download. Links out;
 *  the user downloads by hand and imports via the Upload dialog. Dev-only. */
function ManualCard({ pack }: { pack: Pack }) {
  return (
    <div className="flex flex-col gap-2 rounded border border-dashed border-[var(--border)] bg-[var(--surface-solid)] p-3">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-semibold text-[var(--text)]">{pack.name}</div>
        <span className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--text-3)]">
          manual
        </span>
      </div>
      <p className="text-xs text-[var(--text-2)]">{pack.description}</p>
      <div className="text-[10px] text-[var(--text-3)]">{pack.attribution}</div>
      <a
        href={pack.sourceUrl}
        target="_blank"
        rel="noreferrer"
        className="rounded border border-[var(--border)] px-3 py-1.5 text-center text-xs font-medium text-[var(--text)] hover:bg-[var(--surface-2)]"
      >
        Open source ↗
      </a>
      <p className="text-[10px] text-[var(--text-3)]">
        {pack.assetType === 'material'
          ? 'Download a PBR set, then add it via Upload → Material.'
          : 'Download a model, then drag the GLB into the Upload dialog to add it.'}
      </p>
    </div>
  )
}

function renderCard(pack: Pack) {
  if (pack.kind === 'ikea-live') return <IkeaLiveCard key={pack.id} pack={pack} />
  if (pack.kind === 'poly-pizza') return <PolyPizzaCard key={pack.id} pack={pack} />
  if (pack.kind === 'poly-haven-bundle') return <PolyHavenBundleCard key={pack.id} pack={pack} />
  if (pack.kind === 'manual') return <ManualCard key={pack.id} pack={pack} />
  return <ZipPackCard key={pack.id} pack={pack} />
}

export function PacksTab() {
  // The IKEA live-scrape pack additionally routes through its (devOnly) flag, so
  // the flag registry is the single gate even though `visiblePacks` already
  // dev-scopes it.
  const ikeaLiveOn = useFeature('ikeaLive')
  const packs = visiblePacks(import.meta.env.DEV).filter(
    (p) => p.kind !== 'ikea-live' || ikeaLiveOn,
  )
  const furniture = packs.filter((p) => (p.assetType ?? 'furniture') === 'furniture')
  const materials = packs.filter((p) => p.assetType === 'material')
  return (
    <div className="flex flex-col gap-3 overflow-y-auto p-3">
      <h2 className="text-xs font-semibold text-[var(--text-2)]">Furniture</h2>
      {furniture.map(renderCard)}
      {materials.length > 0 && (
        <>
          <h2 className="mt-2 text-xs font-semibold text-[var(--text-2)]">
            Materials &amp; textures
          </h2>
          {materials.map(renderCard)}
        </>
      )}
    </div>
  )
}
