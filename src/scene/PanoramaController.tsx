import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { Matrix4, PerspectiveCamera, Vector3 } from 'three'
import { WALLS } from '../apartment/constants'
import { getWallOpacity } from '../apartment/walls/wallReveal'
import { isDefaultPlan } from '../floorplan/planGeometry'
import { useStore } from '../state/store'
import { registerAnimatedSource } from './animatedSources'
import {
  type PanoramaCaptureOptions,
  type PanoramaResult,
  setPanoramaCapture,
} from './panorama/capturePanorama'
import { assembleEquirect, FACES, type FaceName, type PixelGrid } from './panorama/equirect'

/** Standing eye height (m) for orbit-mode captures. */
const EYE_HEIGHT = 1.55
/** Equirect width cap — 4×face gives full equator fidelity; capped for memory. */
const MAX_PANO_WIDTH = 4096
/** How long to let the wall-reveal fade settle back to opaque. */
const SETTLE_TIMEOUT_MS = 3000
const SETTLE_MIN_MS = 350

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Registers the 360° panorama capture: six 90° renders through the NORMAL
 * screen pipeline (so tone mapping / exposure / colour match the on-screen
 * look — offscreen targets skip three's tone mapping), the central square of
 * each cropped from the live canvas, then CPU-assembled into an equirect
 * image (`panorama/equirect.ts`). Renders at the hi-fi quality tier like the
 * PNG export and restores the prior tier after. The capture eye is the walk
 * camera in walk mode, else the orbit pivot at standing height — "stand where
 * you're looking", not the dollhouse camera position outside the flat.
 *
 * Async: the camera-facing wall reveal is disabled first (wallReveal quality
 * override) and the capture waits for the fades to animate back to opaque —
 * those run in useFrame, so a `registerAnimatedSource` handle keeps the
 * demand-mode render loop alive during the wait.
 */
export function PanoramaController() {
  const { gl, scene, camera, controls } = useThree()
  useEffect(() => {
    const captureEquirect = async (
      opts?: PanoramaCaptureOptions,
    ): Promise<PanoramaResult | null> => {
      const store = useStore.getState()
      const prev = {
        qualityTier: store.qualityTier,
        qualityUserSet: store.qualityUserSet,
        qualityOverrides: store.qualityOverrides,
        autoShadowsOff: store.autoShadowsOff,
      }
      // Keep the render loop pumping so the reveal fades actually animate.
      const releasePump = registerAnimatedSource()
      try {
        store.setQualityTier('high')
        store.setQualityOverride('showcase', true)
        store.setQualityOverride('postprocessing', true)
        store.setQualityOverride('wallReveal', false)

        // Wait for every revealable wall to fade back to opaque. The default
        // flat publishes per-wall opacity (wallReveal.ts); custom-plan FadeWall
        // doesn't, so fall back to the timeout for those.
        const started = Date.now()
        await sleep(SETTLE_MIN_MS)
        if (isDefaultPlan(useStore.getState().floorPlan)) {
          while (Date.now() - started < SETTLE_TIMEOUT_MS) {
            const allOpaque = WALLS.every((w) => getWallOpacity(w.id) >= 0.985)
            if (allOpaque) break
            await sleep(80)
          }
        } else {
          await sleep(Math.max(0, 1500 - (Date.now() - started)))
        }

        const canvas = gl.domElement
        const S = Math.min(canvas.width, canvas.height)
        if (S < 8) return null

        // Eye: an explicit override (360° tour stops capture at their own
        // recorded position) → else walk camera as-is, else the orbit pivot
        // at standing eye height.
        const eye = new Vector3()
        const target = (controls as { target?: Vector3 } | null)?.target
        if (opts?.eye) {
          eye.set(...opts.eye)
        } else if (useStore.getState().cameraMode === 'orbit' && target) {
          eye.set(target.x, EYE_HEIGHT, target.z)
        } else {
          eye.copy(camera.position)
        }

        const cam = new PerspectiveCamera(90, canvas.width / canvas.height, 0.05, 300)
        cam.position.copy(eye)

        // The postprocessing composer leaves renderer state behind (autoClear
        // off, possibly a bound target) — reset so each face render actually
        // clears and draws to the visible canvas, then restore.
        const prevAutoClear = gl.autoClear
        const prevTarget = gl.getRenderTarget()
        gl.setRenderTarget(null)
        gl.autoClear = true

        // Render each face and crop the central S×S square — a 90° vertical
        // fov camera's central square spans exactly 90° horizontally too.
        const faces = {} as Record<FaceName, PixelGrid>
        const cropX = Math.floor((canvas.width - S) / 2)
        const cropY = Math.floor((canvas.height - S) / 2)
        const m = new Matrix4()
        const r = new Vector3()
        const u = new Vector3()
        const b = new Vector3()
        for (const face of FACES) {
          r.set(...face.right)
          u.set(...face.up)
          b.set(...face.forward).negate() // camera looks down local -Z
          m.makeBasis(r, u, b)
          cam.quaternion.setFromRotationMatrix(m)
          cam.updateMatrixWorld(true)
          gl.render(scene, cam)
          // Read the freshly-rendered buffer synchronously (same task — no
          // preserveDrawingBuffer needed, same trick as ScreenshotController).
          const fc = document.createElement('canvas')
          fc.width = S
          fc.height = S
          const ctx = fc.getContext('2d')
          if (!ctx) return null
          ctx.drawImage(canvas, cropX, cropY, S, S, 0, 0, S, S)
          faces[face.name] = ctx.getImageData(0, 0, S, S) as unknown as PixelGrid
        }
        gl.autoClear = prevAutoClear
        gl.setRenderTarget(prevTarget)

        const outW = Math.min(MAX_PANO_WIDTH, 4 * S)
        const grid = assembleEquirect(faces, outW)
        const out = document.createElement('canvas')
        out.width = grid.width
        out.height = grid.height
        const octx = out.getContext('2d')
        if (!octx) return null
        octx.putImageData(new ImageData(grid.data, grid.width, grid.height), 0, 0)
        return { canvas: out }
      } catch (err) {
        // Surface the cause in dev — the UI shows a friendly retry either way.
        if (import.meta.env.DEV) console.warn('panorama capture failed:', err)
        return null
      } finally {
        releasePump()
        useStore.setState(prev)
      }
    }

    setPanoramaCapture(captureEquirect)
    return () => setPanoramaCapture(null)
  }, [gl, scene, camera, controls])
  return null
}
