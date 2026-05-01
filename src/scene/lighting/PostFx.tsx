import { EffectComposer, SSAO } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';

const SSAO_ENABLED = false; // Phase 5 toggles this on for high quality

function PostFxInner() {
  return (
    <EffectComposer multisampling={0} enableNormalPass>
      <SSAO
        blendFunction={BlendFunction.MULTIPLY}
        samples={16}
        radius={0.2}
        intensity={20}
        luminanceInfluence={0.6}
        worldDistanceThreshold={1}
        worldDistanceFalloff={0.1}
        worldProximityThreshold={1}
        worldProximityFalloff={0.1}
      />
    </EffectComposer>
  );
}

export function PostFx() {
  if (!SSAO_ENABLED) return null;
  return <PostFxInner />;
}
