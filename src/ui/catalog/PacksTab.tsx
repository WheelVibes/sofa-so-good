import { useEffect, useRef, useState } from 'react'
import {
  type IkeaProgressEvent,
  registerGroup,
  sidecarStatus,
  startScrape,
  streamProgress,
} from '../../catalog/packs/ikeaLive'
import { installPack, installPolyPizzaPack } from '../../catalog/packs/install'
import { visiblePacks } from '../../catalog/packs/registry'
import type { Pack } from '../../catalog/packs/types'
import { uninstallPack } from '../../catalog/packs/uninstall'
import { useFeature } from '../../features/useFeature'
import { useStore } from '../../state/store'

const fmtMB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

/** Per-pack localStorage key for a user-supplied API key. Pack-id-derived so
 *  any future keyed API source reuses the same convention. */
const apiKeyStorageKey = (packId: string) => `hdb_pack_key_${packId}`

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
        <div className="rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
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
  const installing = useStore((s) => s.installing)
  const isInstalled = !!installed[pack.id]
  const inflight = installing[pack.id]
  const entryCount = installed[pack.id]?.entries.length ?? 0
  const size = pack.sizeBytes ?? 0
  return (
    <div className="flex flex-col gap-2 rounded border border-[var(--border)] bg-[var(--surface-solid)] p-3">
      <div className="flex items-baseline justify-between">
        <div className="text-sm font-semibold text-[var(--text)]">{pack.name}</div>
        <div className="text-[10px] text-[var(--text-3)]">{fmtMB(size)}</div>
      </div>
      <p className="text-xs text-[var(--text-2)]">{pack.description}</p>
      <div className="text-[10px] text-[var(--text-3)]">
        {pack.attribution} ·{' '}
        <a className="underline" href={pack.sourceUrl} target="_blank" rel="noreferrer">
          source
        </a>
      </div>
      {inflight ? (
        <button
          disabled
          className="rounded bg-[var(--surface-3)] px-3 py-1.5 text-xs text-[var(--text-2)]"
        >
          Installing… {Math.round(inflight.progress * 100)}%
        </button>
      ) : isInstalled ? (
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[var(--accent-soft-text)]">
            ✓ {entryCount} items installed
          </span>
          <button
            onClick={() => void uninstallPack(pack.id)}
            className="text-[11px] text-[var(--danger)] underline"
          >
            Uninstall
          </button>
        </div>
      ) : (
        <button
          onClick={() => void installPack(pack)}
          className="rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-[var(--on-accent)] hover:bg-[var(--accent-2)]"
        >
          Install ({fmtMB(size)})
        </button>
      )}
    </div>
  )
}

/** Poly Pizza pack card: user-supplied API key + search term → in-browser GLB
 *  download via the CORS-friendly Poly Pizza API. Works in production builds. */
function PolyPizzaCard({ pack }: { pack: Pack }) {
  const installed = useStore((s) => s.installedPacks)
  const entryCount = installed[pack.id]?.entries.length ?? 0
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(apiKeyStorageKey(pack.id)) ?? '')
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onDownload() {
    const key = apiKey.trim()
    if (!key) {
      setError('Enter your Poly Pizza API key first.')
      return
    }
    localStorage.setItem(apiKeyStorageKey(pack.id), key)
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
    <div className="flex flex-col gap-2 rounded border border-[var(--border)] bg-[var(--surface-solid)] p-3">
      <div className="text-sm font-semibold text-[var(--text)]">{pack.name}</div>
      <p className="text-xs text-[var(--text-2)]">{pack.description}</p>
      <div className="text-[10px] text-[var(--text-3)]">
        {pack.attribution} ·{' '}
        <a className="underline" href={pack.sourceUrl} target="_blank" rel="noreferrer">
          get a free API key
        </a>
      </div>
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
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[var(--accent-soft-text)]">
            ✓ {entryCount} models in your catalog
          </span>
          <button
            onClick={() => void uninstallPack(pack.id)}
            className="text-[11px] text-[var(--danger)] underline"
          >
            Remove all
          </button>
        </div>
      )}
    </div>
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
