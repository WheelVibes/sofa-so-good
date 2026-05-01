import { useMemo, useState } from 'react';
import { RemoteCard } from './RemoteCard';
import { ResolutionPicker } from './ResolutionPicker';
import { CachePane } from './CachePane';
import { useRemoteEntries } from '../../catalog/remote/hooks';
import { useStore } from '../../state/store';
import type { RemoteKind, ProviderId } from '../../catalog/remote/types';
import type { Surface } from '../../state/slices/finishesSlice';

const ALL: 'all' = 'all';
type CategoryFilter = Surface | typeof ALL;

function matchesQuery(
  entry: { name: string; slug: string; tags?: string[] },
  q: string,
): boolean {
  if (!q) return true;
  const ql = q.toLowerCase();
  if (entry.name.toLowerCase().includes(ql)) return true;
  if (entry.slug.toLowerCase().includes(ql)) return true;
  if (entry.tags?.some((t) => t.toLowerCase().includes(ql))) return true;
  return false;
}

export function RemoteBrowseTab({
  kind,
  onResolved,
  initialSurface,
}: {
  kind: RemoteKind;
  onResolved: (id: string) => void;
  /** When set on a `kind="material"` browser, the category chip starts on
   *  this surface (floor / wall). The user can switch to "All" via the
   *  chip row. Ignored for furniture browsers. */
  initialSurface?: Surface;
}) {
  const [q, setQ] = useState('');
  const [provider, setProvider] = useState<ProviderId | typeof ALL>(ALL);
  const [category, setCategory] = useState<CategoryFilter>(
    kind === 'material' ? (initialSurface ?? ALL) : ALL,
  );
  const all = useRemoteEntries(kind);
  const phStatus = useStore((s) => s.remoteIndexes.polyhaven.status);
  const phError = useStore((s) => s.remoteIndexes.polyhaven.error);
  const acgStatus = useStore((s) => s.remoteIndexes.ambientcg.status);
  const acgError = useStore((s) => s.remoteIndexes.ambientcg.error);
  const refresh = useStore((s) => s.refreshProviderIndex);

  const filtered = useMemo(() => {
    let list = all;
    if (provider !== ALL) list = list.filter((e) => e.provider === provider);
    if (kind === 'material' && category !== ALL) {
      list = list.filter((e) => e.category === category);
    }
    return list.filter((e) => matchesQuery(e, q));
  }, [all, q, provider, category, kind]);

  // Cap rendered nodes; show a "load more" tail so we don't slam the DOM
  // with 3000+ cards on first paint. Each card lazy-loads its own thumb.
  const [limit, setLimit] = useState(120);
  const visible = filtered.slice(0, limit);
  const hiddenCount = Math.max(0, filtered.length - limit);

  const phCount = useStore(
    (s) => s.remoteIndexes.polyhaven.entries.filter((e) => e.kind === kind).length,
  );
  const acgCount = useStore(
    (s) =>
      kind === 'material'
        ? s.remoteIndexes.ambientcg.entries.filter((e) => e.kind === kind).length
        : 0,
  );
  const totalLoaded = phCount + acgCount;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2 border-b border-neutral-200 px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setLimit(120);
            }}
            placeholder={`Search ${totalLoaded} ${kind === 'furniture' ? 'models' : 'textures'}…`}
            className="flex-1 rounded border border-neutral-200 px-2 py-1 text-xs"
          />
          <ResolutionPicker />
        </div>
        {kind === 'material' && (
          <div className="flex flex-wrap gap-1 text-[10px]">
            {([ALL, 'polyhaven', 'ambientcg'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setProvider(p)}
                className={`rounded px-2 py-0.5 ${
                  provider === p
                    ? 'bg-neutral-800 text-white'
                    : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                {p === ALL ? 'All' : p === 'polyhaven' ? 'Poly Haven' : 'ambientCG'}
              </button>
            ))}
            <span className="mx-1 self-center text-neutral-300">·</span>
            {([ALL, 'floor', 'wall'] as const).map((c) => (
              <button
                key={c}
                onClick={() => {
                  setCategory(c);
                  setLimit(120);
                }}
                className={`rounded px-2 py-0.5 capitalize ${
                  category === c
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-100 text-neutral-600'
                }`}
              >
                {c === ALL ? 'Any surface' : c}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between text-[9px] text-neutral-500">
          <span>
            {filtered.length} match{filtered.length === 1 ? '' : 'es'}
            {q ? '' : ` of ${totalLoaded}`}
          </span>
          <span className="flex gap-2">
            <span title={phError}>
              PH:{' '}
              <span
                className={
                  phStatus === 'error'
                    ? 'text-red-600'
                    : phStatus === 'ready'
                      ? 'text-green-600'
                      : 'text-neutral-400'
                }
              >
                {phStatus}
              </span>
            </span>
            {kind === 'material' && (
              <span title={acgError}>
                ACG:{' '}
                <span
                  className={
                    acgStatus === 'error'
                      ? 'text-red-600'
                      : acgStatus === 'ready'
                        ? 'text-green-600'
                        : 'text-neutral-400'
                  }
                >
                  {acgStatus}
                </span>
              </span>
            )}
          </span>
        </div>
        {(phStatus === 'error' || (kind === 'material' && acgStatus === 'error')) && (
          <div className="rounded bg-red-50 p-2 text-[10px] text-red-700">
            <div className="font-medium">Index failed to load.</div>
            {phError && <div className="truncate" title={phError}>Poly Haven: {phError}</div>}
            {acgError && kind === 'material' && (
              <div className="truncate" title={acgError}>ambientCG: {acgError}</div>
            )}
            <div className="mt-1 flex gap-1">
              {phStatus === 'error' && (
                <button
                  onClick={() => void refresh('polyhaven')}
                  className="rounded bg-red-600 px-2 py-0.5 text-white"
                >
                  Retry Poly Haven
                </button>
              )}
              {kind === 'material' && acgStatus === 'error' && (
                <button
                  onClick={() => void refresh('ambientcg')}
                  className="rounded bg-red-600 px-2 py-0.5 text-white"
                >
                  Retry ambientCG
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-xs text-neutral-500">
            {phStatus === 'loading' || acgStatus === 'loading'
              ? 'Loading catalog…'
              : totalLoaded === 0
                ? 'Index empty — check connectivity.'
                : 'No matching items. Try a different keyword.'}
          </p>
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
              <button
                onClick={() => setLimit((n) => n + 120)}
                className="mt-3 w-full rounded bg-neutral-100 py-1 text-[11px] text-neutral-700 hover:bg-neutral-200"
              >
                Show {Math.min(120, hiddenCount)} more ({hiddenCount} remaining)
              </button>
            )}
          </>
        )}
      </div>
      <CachePane />
    </div>
  );
}
