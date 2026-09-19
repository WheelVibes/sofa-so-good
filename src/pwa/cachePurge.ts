/**
 * "Everything updates" (UPDATE-FLOW part B): purge the Workbox RUNTIME caches on
 * a version bump, so a stale `shared-library-assets` / `remote-cc0-assets` /
 * `user-guide` entry (a lightmap PNG, a GLB, a CC0 texture, a guide page) can
 * never outlive an app update.
 *
 * The PRECACHE (the app shell — JS/CSS/HTML/wasm/woff2 + same-origin
 * `assets/**` incl. `assets/lightmaps/*.png` + `index.json`, per
 * `vite.config.ts`'s `globPatterns`) does NOT need this: `generateSW` names
 * every precache entry by a content hash of its bytes, so a changed lightmap
 * (or any other precached file) gets a NEW cache key on its own — the browser
 * fetches it under the new key and `cleanupOutdatedCaches: true` deletes the
 * whole previous precache once the new service worker activates. That
 * mechanism already existed and needed no change.
 *
 * The three RUNTIME caches are different: they're keyed by REQUEST URL, not
 * content hash (`CacheFirst`/`StaleWhileRevalidate` with only a `maxAgeSeconds`
 * TTL — weeks), so an entry fetched under one app version survives untouched
 * into the next unless something explicitly evicts it. `generateSW` (see
 * `vite.config.ts` — this app does not use `injectManifest`) offers no hook to
 * run custom code in the service worker's own `activate` event, so the purge
 * runs PAGE-SIDE instead: on the first boot of a new `APP_VERSION` (detected by
 * comparing against the last-booted version in `localStorage`), delete every
 * named runtime cache via the `CacheStorage` API and let each one refill
 * naturally on next use. This intentionally does NOT touch the precache
 * (`workbox-precache-*`) — deleting that here would just make the SW refetch
 * everything it already has correctly hashed.
 */

/** Runtime cache names Workbox creates from `vite.config.ts`'s `runtimeCaching`
 *  `cacheName` options — kept in sync by `cachePurge.test.ts`, which greps
 *  `vite.config.ts` for each of these strings so a renamed/added/removed cache
 *  can't silently drift out of the purge list. */
export const RUNTIME_CACHE_NAMES = [
  'shared-library-assets',
  'user-guide',
  'remote-cc0-assets',
] as const

const LAST_BOOTED_VERSION_KEY = 'sofa.lastBootedVersion'

export interface CachePurgeDeps {
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  caches?: Pick<CacheStorage, 'delete'>
}

function defaultDeps(): CachePurgeDeps {
  return {
    storage: typeof localStorage !== 'undefined' ? localStorage : undefined,
    caches: typeof caches !== 'undefined' ? caches : undefined,
  }
}

/**
 * Record the current `APP_VERSION` as booted; if it differs from the
 * PREVIOUSLY recorded version (and this isn't the very first boot ever — there
 * is nothing stale to purge then), delete every runtime cache in
 * `RUNTIME_CACHE_NAMES`. Returns `true` when a purge actually ran (useful for
 * logging/tests), `false` otherwise (same version, first boot, or no
 * `localStorage`). Best-effort: a `caches.delete` failure is swallowed — a
 * stale runtime entry is a staleness bug, never a crash.
 */
export async function purgeRuntimeCachesOnVersionChange(
  currentVersion: string,
  deps: CachePurgeDeps = defaultDeps(),
): Promise<boolean> {
  const { storage, caches: cachesApi } = deps
  if (!storage) return false

  let lastBooted: string | null = null
  try {
    lastBooted = storage.getItem(LAST_BOOTED_VERSION_KEY)
  } catch {
    return false // storage unavailable (private mode, quota) — nothing to compare against
  }

  try {
    storage.setItem(LAST_BOOTED_VERSION_KEY, currentVersion)
  } catch {
    /* storage unavailable for writing — proceed; we still know whether to purge */
  }

  if (lastBooted === null || lastBooted === currentVersion) return false

  if (cachesApi) {
    try {
      await Promise.all(RUNTIME_CACHE_NAMES.map((name) => cachesApi.delete(name)))
    } catch {
      /* best-effort — a failed delete leaves that cache to age out on its own TTL */
    }
  }
  return true
}
