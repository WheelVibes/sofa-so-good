import type { ProviderId, RemoteProvider } from '../types'
import { ambientcg } from './ambientcg'
import { polyhaven } from './polyhaven'

export const PROVIDERS: Record<ProviderId, RemoteProvider> = {
  polyhaven,
  ambientcg,
}
