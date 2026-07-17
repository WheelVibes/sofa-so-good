import { Environment, Lightformer } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'

/**
 * Stage 8a — the GLB Asset Designer's "Room" preview environment: a drei
 * `<Environment>` image-based-lighting probe built from Lightformers, scoped to
 * the designer canvas. It gives physical finishes (sheen / clearcoat /
 * transmission / anisotropy) the same believable reflections + ambient bounce
 * the real scene renders under, so finish judgment happens under representative
 * lighting instead of the flat 3-light Studio rig.
 *
 * The Lightformer set is a LOCAL COPY of the app's procedural probe in
 * `src/scene/lighting/SceneEnvironment.tsx` (kept in sync by hand). It is
 * duplicated rather than shared because that module is a live, RD-409
 * bloom-lock-step main-scene component that must not be edited or imported into
 * the designer's separate canvas — a drift here only affects the preview, never
 * the shipped render. If the main probe's Lightformers change materially, mirror
 * the change here.
 *
 * Rendered inside the designer Canvas's `frameloop="demand"` tree; `frames={1}`
 * bakes the probe once and the mount `invalidate()` guarantees that bake lands a
 * frame the moment Room mode is selected.
 */
export function DesignerEnvironment() {
  const invalidate = useThree((s) => s.invalidate)
  // Demand frameloop: mounting (a Room-mode toggle) already invalidates, but pump
  // one explicit frame so the one-shot environment bake is never skipped.
  useEffect(() => {
    invalidate()
  }, [invalidate])
  return (
    <Environment resolution={256} frames={1} environmentIntensity={1} background={false}>
      {/* Bright sky cap + cooler horizon for a soft top-down gradient. */}
      <Lightformer
        form="rect"
        intensity={1.4}
        color="#cfe0f2"
        scale={[12, 12, 1]}
        position={[0, 8, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      />
      <Lightformer
        form="rect"
        intensity={0.5}
        color="#9fb0c4"
        scale={[14, 6, 1]}
        position={[0, 2, -9]}
        rotation={[0, 0, 0]}
      />
      <Lightformer
        form="rect"
        intensity={0.5}
        color="#9fb0c4"
        scale={[14, 6, 1]}
        position={[0, 2, 9]}
        rotation={[0, Math.PI, 0]}
      />
      <Lightformer
        form="rect"
        intensity={0.45}
        color="#b8c2cf"
        scale={[6, 6, 1]}
        position={[-9, 2, 0]}
        rotation={[0, Math.PI / 2, 0]}
      />
      <Lightformer
        form="rect"
        intensity={0.45}
        color="#b8c2cf"
        scale={[6, 6, 1]}
        position={[9, 2, 0]}
        rotation={[0, -Math.PI / 2, 0]}
      />
      {/* Warm ground bounce. */}
      <Lightformer
        form="rect"
        intensity={0.25}
        color="#6b5b48"
        scale={[14, 14, 1]}
        position={[0, -3, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      />
      {/* Warm key aimed down-and-inward from the sun-side corner for spec variation on wood/metal. */}
      <Lightformer
        form="rect"
        intensity={0.8}
        color="#ffe6c2"
        scale={[5, 5, 1]}
        position={[5, 5, 5]}
        rotation={[Math.PI / 4, -Math.PI / 4, 0]}
      />
      {/* Cool counter-fill from the opposite corner so reflections aren't flat. */}
      <Lightformer
        form="rect"
        intensity={0.35}
        color="#c2d4ff"
        scale={[5, 5, 1]}
        position={[-5, 4, -5]}
        rotation={[Math.PI / 4, (3 * Math.PI) / 4, 0]}
      />
    </Environment>
  )
}
