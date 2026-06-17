import { type ComponentType, type LazyExoticComponent, lazy } from 'react'

/**
 * Resilient lazy-loading for code-split chunks — the offline/deploy safety net.
 *
 * Every feature here is a dynamic `import()` of a hashed chunk. Two situations
 * make that import reject with a "Failed to fetch dynamically imported module" /
 * "Importing a module script failed" error, which would otherwise crash the whole
 * app to the top-level ErrorBoundary:
 *
 *  1. **Stale chunk after a deploy** — the loaded page references old hashes; the
 *     new build (and the PWA's `cleanupOutdatedCaches`) removed them. A reload
 *     pulls the fresh build + service worker, which fixes it.
 *  2. **Transient miss** — e.g. opening a feature offline during the very first
 *     visit, before the service worker finished precaching every chunk. A short
 *     retry covers the in-flight race.
 *
 * Strategy: retry the import a couple of times with backoff; if it still fails
 * with a chunk-load error and we're **online**, reload once (guarded against
 * reload loops) so the fresh build is fetched. When genuinely offline with the
 * chunk uncached, the error surfaces to the ErrorBoundary as before.
 */

const RELOAD_TS_KEY = 'sofa-so-good:chunk-reload-ts'
// Don't auto-reload more than once per window — if a reload didn't fix it, let
// the error surface instead of crash-looping.
const RELOAD_COOLDOWN_MS = 12_000

/** True for the "dynamic import / module script failed to load" error family. */
export function isChunkLoadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '')
  return /(\bimporting\b.*\bmodule\b|dynamically imported module|module script|failed to fetch|loading chunk|chunkloaderror|error loading)/i.test(
    msg,
  )
}

/** Whether the browser currently reports an online connection (defaults to true). */
function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

/**
 * Reload once to fetch a fresh build, unless we're offline (a reload can't help)
 * or we already reloaded within the cooldown (avoid loops). Returns whether a
 * reload was triggered.
 */
export function reloadForFreshChunks(): boolean {
  if (!isOnline()) return false
  try {
    const last = Number(sessionStorage.getItem(RELOAD_TS_KEY) || '0')
    if (Number.isFinite(last) && Date.now() - last < RELOAD_COOLDOWN_MS) return false
    sessionStorage.setItem(RELOAD_TS_KEY, String(Date.now()))
  } catch {
    // No sessionStorage (private mode / SSR): fall through and reload anyway —
    // a single recovery reload is better than a hard crash.
  }
  if (typeof location !== 'undefined') location.reload()
  return true
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Run a dynamic-import factory with retries, then a one-shot reload recovery.
 * Exported for unit testing; UI code uses {@link lazyWithRetry}.
 */
export async function importWithRetry<T>(
  factory: () => Promise<T>,
  retries = 2,
  delayMs = 300,
): Promise<T> {
  try {
    return await factory()
  } catch (err) {
    if (!isChunkLoadError(err)) throw err
    if (retries > 0) {
      await sleep(delayMs)
      return importWithRetry(factory, retries - 1, delayMs * 2)
    }
    // Retries exhausted. If online, a stale post-deploy chunk is the likely
    // cause — reload to get the fresh build. Keep the Suspense fallback up
    // (never-resolving promise) so the page doesn't flash the error card
    // before the reload takes effect.
    if (reloadForFreshChunks()) return new Promise<T>(() => {})
    throw err
  }
}

/**
 * Drop-in replacement for React's `lazy` that makes chunk loading resilient to
 * stale deploys and transient offline misses. Same signature as `lazy`.
 */
// biome-ignore lint/suspicious/noExplicitAny: matches React.lazy's own component constraint
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() => importWithRetry(factory))
}

/**
 * Install a global handler for Vite's `vite:preloadError` (a `<link
 * modulepreload>` chunk failing to load — same stale-deploy cause). Reloads once
 * to recover. Call once at startup.
 */
export function installChunkErrorRecovery(): void {
  if (typeof window === 'undefined') return
  window.addEventListener('vite:preloadError', (event) => {
    if (reloadForFreshChunks()) event.preventDefault()
  })
}
