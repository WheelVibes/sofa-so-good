import { useMemo, useState } from 'react'
import { useRemoteEntries } from '../../catalog/remote/hooks'
import type { ProviderId, RemoteKind } from '../../catalog/remote/types'
import { useStore } from '../../state/store'
import { Button } from '../controls/Button'
import { EmptyState } from '../EmptyState'
import { Icon } from '../toolbar/icons'
import { CachePane } from './CachePane'
import { RemoteCard } from './RemoteCard'
import { ResolutionPicker } from './ResolutionPicker'

const ALL: 'all' = 'all'

function matchesQuery(entry: { name: string; slug: string; tags?: string[] }, q: string): boolean {
  if (!q) return true
  const ql = q.toLowerCase()
  if (entry.name.toLowerCase().includes(ql)) return true
  if (entry.slug.toLowerCase().includes(ql)) return true
  if (entry.tags?.some((t) => t.toLowerCase().includes(ql))) return true
  return false
}

export function RemoteBrowseTab({
  kind,
  onResolved,
  defaultCategory,
}: {
  kind: RemoteKind
  onResolved: (id: string) => void
  /** For materials: pre-filter to the surface being edited (floor/wall). */
  defaultCategory?: 'floor' | 'wall'
}) {
  const [q, setQ] = useState('')
  const [provider, setProvider] = useState<ProviderId | typeof ALL>(ALL)
  const [cat, setCat] = useState<'floor' | 'wall' | typeof ALL>(defaultCategory ?? ALL)
  const all = useRemoteEntries(kind)
  const phStatus = useStore((s) => s.remoteIndexes.polyhaven.status)
  const phError = useStore((s) => s.remoteIndexes.polyhaven.error)
  const acgStatus = useStore((s) => s.remoteIndexes.ambientcg.status)
  const acgError = useStore((s) => s.remoteIndexes.ambientcg.error)
  const refresh = useStore((s) => s.refreshProviderIndex)

  const filtered = useMemo(() => {
    let list = all
    if (provider !== ALL) list = list.filter((e) => e.provider === provider)
    if (kind === 'material' && cat !== ALL) list = list.filter((e) => e.category === cat)
    return list.filter((e) => matchesQuery(e, q))
  }, [all, q, provider, cat, kind])

  // Cap rendered nodes; show a "load more" tail so we don't slam the DOM
  // with 3000+ cards on first paint. Each card lazy-loads its own thumb.
  const [limit, setLimit] = useState(120)
  const visible = filtered.slice(0, limit)
  const hiddenCount = Math.max(0, filtered.length - limit)

  const phCount = useStore(
    (s) => s.remoteIndexes.polyhaven.entries.filter((e) => e.kind === kind).length,
  )
  const acgCount = useStore((s) =>
    kind === 'material'
      ? s.remoteIndexes.ambientcg.entries.filter((e) => e.kind === kind).length
      : 0,
  )
  const totalLoaded = phCount + acgCount

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className="flex flex-col gap-2"
        style={{ borderBottom: '1px solid var(--border)', padding: 'var(--s-3) var(--s-4)' }}
      >
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setLimit(120)
            }}
            placeholder={`Search ${totalLoaded} ${kind === 'furniture' ? 'models' : 'textures'}…`}
            className="input flex-1"
          />
          <ResolutionPicker />
        </div>
        {kind === 'material' && (
          <div className="flex gap-1">
            {([ALL, 'polyhaven', 'ambientcg'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setProvider(p)}
                className={`seg-btn${provider === p ? ' on' : ''}`}
              >
                {p === ALL ? 'All' : p === 'polyhaven' ? 'Poly Haven' : 'ambientCG'}
              </button>
            ))}
          </div>
        )}
        {kind === 'material' && (
          <div className="flex gap-1">
            {([ALL, 'floor', 'wall'] as const).map((c) => (
              <button
                key={c}
                onClick={() => {
                  setCat(c)
                  setLimit(120)
                }}
                className={`seg-btn capitalize${cat === c ? ' on' : ''}`}
              >
                {c === ALL ? 'All surfaces' : c}
              </button>
            ))}
          </div>
        )}
        <div
          className="flex items-center justify-between"
          style={{ fontSize: 'var(--t-2xs)', color: 'var(--text-3)' }}
        >
          <span>
            {filtered.length} match{filtered.length === 1 ? '' : 'es'}
            {q ? '' : ` of ${totalLoaded}`}
          </span>
          <span className="flex gap-2">
            <span title={phError}>
              PH:{' '}
              <span
                style={{
                  color:
                    phStatus === 'error'
                      ? 'var(--danger)'
                      : phStatus === 'ready'
                        ? 'var(--ok)'
                        : 'var(--text-3)',
                }}
              >
                {phStatus}
              </span>
            </span>
            {kind === 'material' && (
              <span title={acgError}>
                ACG:{' '}
                <span
                  style={{
                    color:
                      acgStatus === 'error'
                        ? 'var(--danger)'
                        : acgStatus === 'ready'
                          ? 'var(--ok)'
                          : 'var(--text-3)',
                  }}
                >
                  {acgStatus}
                </span>
              </span>
            )}
          </span>
        </div>
        {(phStatus === 'error' || (kind === 'material' && acgStatus === 'error')) && (
          <div
            style={{
              background: 'var(--danger-soft)',
              color: 'var(--danger)',
              borderRadius: 'var(--r-2)',
              padding: 'var(--s-3)',
              fontSize: 'var(--t-2xs)',
            }}
          >
            <div className="font-medium">Couldn’t reach the online library.</div>
            <div style={{ opacity: 0.8 }}>
              Online assets need an internet connection — the built-in catalog works offline. Retry
              below.
            </div>
            {phError && (
              <div className="truncate" title={phError}>
                Poly Haven: {phError}
              </div>
            )}
            {acgError && kind === 'material' && (
              <div className="truncate" title={acgError}>
                ambientCG: {acgError}
              </div>
            )}
            <div className="mt-1 flex gap-1">
              {phStatus === 'error' && (
                <Button variant="danger" size="sm" onClick={() => void refresh('polyhaven')}>
                  Retry Poly Haven
                </Button>
              )}
              {kind === 'material' && acgStatus === 'error' && (
                <Button variant="danger" size="sm" onClick={() => void refresh('ambientcg')}>
                  Retry ambientCG
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          phStatus === 'loading' || acgStatus === 'loading' ? (
            <p className="panel-sub plain py-6 text-center">Loading catalog…</p>
          ) : totalLoaded === 0 ? (
            <EmptyState
              icon={Icon.Cube}
              title="Index empty"
              description="No items loaded yet — check your connection and try refreshing."
            />
          ) : (
            <EmptyState
              icon={Icon.Search}
              title="No matching items"
              description={
                q.trim() ? `Nothing matches “${q.trim()}”. Try a different keyword.` : undefined
              }
              cta={q.trim() ? { label: 'Clear search', onClick: () => setQ('') } : undefined}
            />
          )
        ) : (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2">
              {visible.map((entry) => (
                <RemoteCard
                  key={`${entry.provider}:${entry.slug}`}
                  entry={entry}
                  onResolved={onResolved}
                />
              ))}
            </div>
            {hiddenCount > 0 && (
              <Button size="sm" block className="mt-3" onClick={() => setLimit((n) => n + 120)}>
                Show {Math.min(120, hiddenCount)} more ({hiddenCount} remaining)
              </Button>
            )}
          </>
        )}
      </div>
      <CachePane />
    </div>
  )
}
