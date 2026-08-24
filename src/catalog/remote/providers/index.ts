import { isFeatureEnabled } from '../../../features/featureFlags'
import type { ProviderId, RemoteProvider } from '../types'
import { acgLibrary } from './acgLibrary'
import { polyhaven } from './polyhaven'

/**
 * ambientCG is served **only** from our own R2 mirror (`acgLibrary`, the
 * `acg/` prefix behind the same-origin `/api/assets` proxy).
 *
 * The live ambientcg.com API used to be a dev-only fallback behind the Vite
 * `/acg` + `/acg-cdn` proxies. It is gone (2026-08-25) because every one of its
 * assumptions had rotted:
 *  - its CDN moved to `acg-media.struffelproductions.com`, which the proxy
 *    rewrite never covered, so thumbnails resolved cross-origin;
 *  - `full_json` pages at 100 results, so the index was 100 of ~2000 assets;
 *  - `category` is now `null` on every material, so everything classified as a
 *    floor and the Wall filter came back empty.
 * The mirror has none of those problems, works in production, and ships the
 * pre-packed maps the runtime actually binds — there is nothing left for a
 * second transport to add.
 */
export const PROVIDERS: Record<ProviderId, RemoteProvider> = {
  polyhaven,
  ambientcg: acgLibrary,
}

/** Providers whose API + CDN send CORS headers, so they work from a static
 *  production build (GitHub Pages) with no proxy and no backend. Poly Haven
 *  qualifies; ambientCG rides the auth-gated R2 proxy instead, so it is added
 *  by `activeProviderIds` only while its flag is on.
 *  @public — the remote-catalog tests `vi.mock` this module and supply their own value. */
export const PROD_PROVIDER_IDS: ProviderId[] = ['polyhaven']

/**
 * Providers to bootstrap. Identical in dev and production now that ambientCG
 * has a single same-origin transport: the CORS-capable providers, plus the
 * R2-backed ambientCG mirror whenever `ambientcgLibrary` is enabled.
 */
export function activeProviderIds(): ProviderId[] {
  const ids = [...PROD_PROVIDER_IDS]
  if (isFeatureEnabled('ambientcgLibrary') && !ids.includes('ambientcg')) ids.push('ambientcg')
  return ids
}
