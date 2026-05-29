import { Suspense, lazy } from 'react';
import { useQuality } from './useQuality';

// The post-processing stack (Bloom + SMAA + N8AO) and its dependencies are
// only used on the high tier. Lazy-load them so low/medium users — the fast
// path — never download the heavy postprocessing/n8ao code.
const EffectsImpl = lazy(() => import('./EffectsImpl'));

/**
 * Mounts the high-tier post-processing stack when quality enables it; renders
 * nothing (and pulls in no postprocessing code) otherwise.
 */
export function Effects() {
  const { postprocessing } = useQuality();
  if (!postprocessing) return null;
  return (
    <Suspense fallback={null}>
      <EffectsImpl />
    </Suspense>
  );
}
