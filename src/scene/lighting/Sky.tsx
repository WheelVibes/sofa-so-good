import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import { BackSide, CanvasTexture, type Mesh, type Texture } from 'three'
import { noExportUserData } from '../../export/sceneGltf'
import { useStore } from '../../state/store'
import { isPhotoBackdropActive } from '../SceneBackdrop'
import { skyFromAltitude } from './altitudeCurve'
import { SKY_DOME_RADIUS } from './skyDome'
import { type SkyState, shouldRebuildSky } from './skyRebuild'
import { paintSkySurround } from './skySurround'
import { orientedSunDirection } from './sunPosition'
import { useSunPosition } from './useSunPosition'

/** Radius of the surround dome — see `skyDome.ts` (SKY-DOME-FAR) for why this is a
 *  shared, test-asserted constant rather than a literal, and why the dome tracks the
 *  camera. The previous world-anchored 400 EQUALLED the camera far plane and left
 *  more than half the dome clipped. */
const DOME_RADIUS = SKY_DOME_RADIUS

/** Equirect size for the baked surround. The field is smooth by construction — no
 *  sun disc, no high-frequency detail — so this is ample, and a small texture keeps
 *  the re-bake (which runs on the main thread) cheap. */
const TEX_W = 256
const TEX_H = 128

/** Debounce before a sun move triggers a re-bake, matching `SkyBackdrop`. */
const REBUILD_DEBOUNCE_MS = 120

/**
 * The orbit/dollhouse surround (SKY-ANALYTIC-ORBIT).
 *
 * Replaces drei's `<Sky>` dome, which emitted a colourless near-white in this app's
 * exposure range — zenith HSV saturation 0.017 at 13:00, indistinguishable from its
 * own horizon, and never above 0.03 at ANY hour. Five causes were tested and
 * rejected before concluding the dome itself had to go: the tone curve, the
 * scattering parameters, the global exposure, the sun angle, and reusing the
 * walk-mode equirect (which paints a brown GROUND below the horizon — wrong for a
 * camera that looks down at a dollhouse). See `skySurround.ts` for the numbers.
 *
 * This bakes `paintSkySurround` into a small equirect and maps it onto a `BackSide`
 * sphere. Three properties matter:
 *  - **Background only.** It writes neither `scene.background` nor
 *    `scene.environment` — the IBL stays the procedural Lightformer probe in
 *    `SceneEnvironment.tsx` — so interior lighting, the key:fill ratio and the bloom
 *    lock-step (RD-409) cannot move. Only background pixels change.
 *  - **Not behind the `proceduralSky` flag.** That flag is `tier: 'pro'` and Simple
 *    mode (the app default) forces pro flags OFF, so gating on it would leave the
 *    white dome in place for exactly the users who see the default look. This is not
 *    a new feature either — it swaps one always-on surround for a better one.
 *  - **Walk-mode photo backdrops still win.** They paint `scene.background`, which
 *    would be occluded by a dome, so this stands down whenever one is active exactly
 *    as the drei dome did.
 */
export function Sky() {
  const sunPos = useSunPosition()
  const orientation = useStore((s) => s.orientationDeg)
  const kind = useStore((s) => s.backdrop)
  const cameraMode = useStore((s) => s.cameraMode)
  const hasCustom = useStore((s) => !!s.customBackdropUrl)
  const backdropActive = isPhotoBackdropActive(kind, cameraMode, hasCustom)

  const sunDir = orientedSunDirection(sunPos, orientation)
  const turbidity = skyFromAltitude(sunPos.altitude).turbidity

  const [texture, setTexture] = useState<Texture | null>(null)
  const lastBaked = useRef<SkyState | null>(null)
  const texRef = useRef<Texture | null>(null)
  const meshRef = useRef<Mesh>(null)

  // Re-bake (debounced) only when the sun crosses `shouldRebuildSky`'s threshold —
  // the same predicate and cadence the walk-mode backdrop uses, so a time-of-day
  // slider drag coalesces into one upload instead of one per tick.
  useEffect(() => {
    if (backdropActive) return
    const candidate: SkyState = { sunDir, turbidity, orientationDeg: orientation }
    if (!shouldRebuildSky(lastBaked.current, candidate)) return
    const handle = setTimeout(() => {
      const canvas = document.createElement('canvas')
      canvas.width = TEX_W
      canvas.height = TEX_H
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const image = ctx.createImageData(TEX_W, TEX_H)
      paintSkySurround(image.data, TEX_W, TEX_H, { sunDir, turbidity })
      ctx.putImageData(image, 0, 0)
      const tex = new CanvasTexture(canvas)
      // Default (UV) mapping is correct here: `sphereGeometry`'s own UVs already
      // run 0..1 in azimuth and elevation, so the equirect maps straight on. An
      // `EquirectangularReflectionMapping` would be for a texture sampled by a
      // reflection vector, not by mesh UVs.
      tex.colorSpace = 'srgb'
      const old = texRef.current
      texRef.current = tex
      lastBaked.current = candidate
      setTexture(tex)
      old?.dispose()
    }, REBUILD_DEBOUNCE_MS)
    return () => clearTimeout(handle)
  }, [sunDir, turbidity, orientation, backdropActive])

  // Dispose on unmount — the texture is ours and nothing else references it.
  useEffect(
    () => () => {
      texRef.current?.dispose()
      texRef.current = null
      lastBaked.current = null
    },
    [],
  )

  const geometryArgs = useMemo(() => [DOME_RADIUS, 32, 24] as const, [])

  // Track the camera so the dome is exactly DOME_RADIUS away in EVERY direction, at
  // every orbit distance and on every plan (SKY-DOME-FAR). A sky has no parallax, so
  // this is also the physically right model — and it is what makes a fixed radius
  // provably safe against the far plane instead of safe-looking. Default priority,
  // so it runs after drei's `<OrbitControls>` update (priority -1) has moved the
  // camera for this frame.
  useFrame(({ camera }) => {
    const m = meshRef.current
    if (m) m.position.copy(camera.position)
  })

  if (backdropActive || !texture) return null
  return (
    <group userData={noExportUserData()}>
      <mesh ref={meshRef} frustumCulled={false} renderOrder={-1}>
        <sphereGeometry args={geometryArgs as unknown as [number, number, number]} />
        <meshBasicMaterial map={texture} side={BackSide} depthWrite={false} fog={false} />
      </mesh>
    </group>
  )
}
