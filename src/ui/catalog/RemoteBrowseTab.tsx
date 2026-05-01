import { useMemo, useState } from 'react';
import { VirtuosoGrid } from 'react-virtuoso';
import { RemoteCard } from './RemoteCard';
import { ResolutionPicker } from './ResolutionPicker';
import { CachePane } from './CachePane';
import { useRemoteEntries } from '../../catalog/remote/hooks';
import { useStore } from '../../state/store';
import type { RemoteKind, ProviderId } from '../../catalog/remote/types';

const ALL: 'all' = 'all';

export function RemoteBrowseTab({
  kind,
  onResolved,
}: {
  kind: RemoteKind;
  onResolved: (id: string) => void;
}) {
  const [q, setQ] = useState('');
  const [provider, setProvider] = useState<ProviderId | typeof ALL>(ALL);
  const all = useRemoteEntries(kind);
  const phStatus = useStore((s) => s.remoteIndexes.polyhaven.status);
  const acgStatus = useStore((s) => s.remoteIndexes.ambientcg.status);

  const filtered = useMemo(() => {
    let list = all;
    if (provider !== ALL) list = list.filter((e) => e.provider === provider);
    if (q) {
      const ql = q.toLowerCase();
      list = list.filter(
        (e) => e.name.toLowerCase().includes(ql) || e.slug.toLowerCase().includes(ql),
      );
    }
    return list;
  }, [all, q, provider]);

  const loading =
    phStatus === 'loading' || (kind === 'material' && acgStatus === 'loading');

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-col gap-2 border-b border-neutral-200 px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="flex-1 rounded border border-neutral-200 px-2 py-1 text-xs"
          />
          <ResolutionPicker />
        </div>
        {kind === 'material' && (
          <div className="flex gap-1 text-[10px]">
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
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1">
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-xs text-neutral-500">
            {loading ? 'Loading catalog…' : 'No matching items.'}
          </p>
        ) : (
          <VirtuosoGrid
            style={{ height: '100%' }}
            data={filtered}
            listClassName="grid grid-cols-2 gap-2 p-3"
            itemContent={(_index, entry) => (
              <RemoteCard entry={entry} onResolved={onResolved} />
            )}
          />
        )}
      </div>
      <CachePane />
    </div>
  );
}
