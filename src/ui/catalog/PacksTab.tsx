import { useStore } from '../../state/store';
import { AVAILABLE_PACKS } from '../../catalog/packs/registry';
import { installPack } from '../../catalog/packs/install';
import { uninstallPack } from '../../catalog/packs/uninstall';

const fmtMB = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export function PacksTab() {
  const installed = useStore((s) => s.installedPacks);
  const installing = useStore((s) => s.installing);

  return (
    <div className="flex flex-col gap-3 overflow-y-auto p-3">
      <h2 className="text-xs font-semibold text-neutral-700">Downloadable content</h2>
      {AVAILABLE_PACKS.map((pack) => {
        const isInstalled = !!installed[pack.id];
        const inflight = installing[pack.id];
        const entryCount = installed[pack.id]?.entries.length ?? 0;
        return (
          <div
            key={pack.id}
            className="flex flex-col gap-2 rounded border border-neutral-200 bg-white p-3"
          >
            <div className="flex items-baseline justify-between">
              <div className="text-sm font-semibold text-neutral-900">{pack.name}</div>
              <div className="text-[10px] text-neutral-500">{fmtMB(pack.sizeBytes)}</div>
            </div>
            <p className="text-xs text-neutral-700">{pack.description}</p>
            <div className="text-[10px] text-neutral-500">
              {pack.attribution} ·{' '}
              <a
                className="underline"
                href={pack.sourceUrl}
                target="_blank"
                rel="noreferrer"
              >
                source
              </a>
            </div>
            {inflight ? (
              <button
                disabled
                className="rounded bg-neutral-300 px-3 py-1.5 text-xs text-neutral-700"
              >
                Installing… {Math.round(inflight.progress * 100)}%
              </button>
            ) : isInstalled ? (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-emerald-700">
                  ✓ {entryCount} items installed
                </span>
                <button
                  onClick={() => void uninstallPack(pack.id)}
                  className="text-[11px] text-rose-600 underline"
                >
                  Uninstall
                </button>
              </div>
            ) : (
              <button
                onClick={() => void installPack(pack)}
                className="rounded bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
              >
                Install ({fmtMB(pack.sizeBytes)})
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
