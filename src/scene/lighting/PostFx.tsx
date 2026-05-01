import { EffectComposer, SSAO } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { useStore } from '../../state/store';

function PostFxInner() {
  const gi = useStore((s) => s.quality.globalIllumination);
  if (gi !== 'ibl+ssao') return null;
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
  return <PostFxInner />;
}
