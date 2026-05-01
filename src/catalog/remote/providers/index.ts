import type { ProviderId, RemoteProvider } from '../types';
import { polyhaven } from './polyhaven';
import { ambientcg } from './ambientcg';

export const PROVIDERS: Record<ProviderId, RemoteProvider> = {
  polyhaven,
  ambientcg,
};
