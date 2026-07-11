import type { ProviderId, RemoteProvider } from '../types'
import { ambientcg } from './ambientcg'
import { polyhaven } from './polyhaven'

export const PROVIDERS: Record<ProviderId, RemoteProvider> = {
  polyhaven,
  ambientcg,
}

/** Providers whose API + CDN send CORS headers, so they work from a static
 *  production build (GitHub Pages) with no proxy. Poly Haven qualifies;
 *  ambientCG ships no `Access-Control-Allow-Origin` and is only reachable
 *  through the dev-only Vite proxy (`/acg`, `/acg-cdn`), so it's dev-only.
 *  @public — used in-file by `activeProviderIds` and the documented extension point
 *  for adding a prod provider (e.g. ambientCG once a prod CORS proxy exists, TODO.md);
 *  the remote-catalog tests `vi.mock` this module and supply their own value. */
export const PROD_PROVIDER_IDS: ProviderId[] = ['polyhaven']

/** Providers to bootstrap given the environment — all in dev, only the
 *  CORS-capable ones in a production build. */
export function activeProviderIds(isDev: boolean): ProviderId[] {
  return isDev ? (Object.keys(PROVIDERS) as ProviderId[]) : PROD_PROVIDER_IDS
}
