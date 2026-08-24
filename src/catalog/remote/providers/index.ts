import { isFeatureEnabled } from '../../../features/featureFlags'
import type { ProviderId, RemoteProvider } from '../types'
import { acgLibrary } from './acgLibrary'
import { ambientcg } from './ambientcg'
import { polyhaven } from './polyhaven'

/**
 * ambientCG has two transports for one provider id:
 *  - `acgLibrary` — our R2 mirror over the same-origin `/api/assets` proxy.
 *    CC0 and CORS-free, so it works in a production build.
 *  - `ambientcg` — the live ambientcg.com API. Sends no
 *    `Access-Control-Allow-Origin`, so it only works behind the dev-only Vite
 *    proxy (`/acg`, `/acg-cdn`).
 *
 * The choice is made per call rather than at module load, so flipping the
 * `ambientcgLibrary` flag at runtime takes effect without a reload. Both keep
 * the `ambientcg` id, so finish ids stay `ambientcg:<slug>:<res>` and designs
 * saved against either transport resolve against the other.
 */
function acgTransport(): RemoteProvider {
  return isFeatureEnabled('ambientcgLibrary') ? acgLibrary : ambientcg
}

const ambientcgDispatch: RemoteProvider = {
  id: 'ambientcg',
  fetchIndex: (signal) => acgTransport().fetchIndex(signal),
  fetchThumbnail: (entry, signal) => acgTransport().fetchThumbnail(entry, signal),
  fetchAsset: (entry, resolution, signal) => acgTransport().fetchAsset(entry, resolution, signal),
}

export const PROVIDERS: Record<ProviderId, RemoteProvider> = {
  polyhaven,
  ambientcg: ambientcgDispatch,
}

/** Providers whose API + CDN send CORS headers, so they work from a static
 *  production build (GitHub Pages) with no proxy. Poly Haven qualifies; the
 *  LIVE ambientCG API does not — but the R2 mirror is same-origin, so
 *  `activeProviderIds` adds ambientCG in prod whenever its flag is on.
 *  @public — the remote-catalog tests `vi.mock` this module and supply their own value. */
export const PROD_PROVIDER_IDS: ProviderId[] = ['polyhaven']

/** Providers to bootstrap given the environment — all in dev, and in prod the
 *  CORS-capable ones plus the R2-backed ambientCG mirror when it is enabled. */
export function activeProviderIds(isDev: boolean): ProviderId[] {
  if (isDev) return Object.keys(PROVIDERS) as ProviderId[]
  const ids = [...PROD_PROVIDER_IDS]
  if (isFeatureEnabled('ambientcgLibrary') && !ids.includes('ambientcg')) ids.push('ambientcg')
  return ids
}
