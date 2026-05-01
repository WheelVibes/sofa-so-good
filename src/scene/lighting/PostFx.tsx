import { EffectComposer, SSAO, SMAA, Bloom } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { useStore } from '../../state/store';

function PostFxInner() {
  const gi = useStore((s) => s.quality.globalIllumination);
  const withSSAO = gi === 'ibl+ssao';
  // SMAA is cheap; run it at every GI level so wall edges don't stair-step.
  // SSAO + Bloom only at the highest preset.
  if (withSSAO) {
    return (
      <EffectComposer multisampling={0} enableNormalPass>
        <SMAA />
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
        <Bloom
          luminanceThreshold={1.0}
          luminanceSmoothing={0.2}
          intensity={0.3}
          mipmapBlur
        />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer multisampling={0}>
      <SMAA />
    </EffectComposer>
  );
}

export function PostFx() {
  return <PostFxInner />;
}
