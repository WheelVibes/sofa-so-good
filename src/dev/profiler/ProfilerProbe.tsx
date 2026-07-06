import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { isRenderingContinuously } from '../../scene/renderPumpSignal'
import { useStore } from '../../state/store'
import { profilerBridge } from './profilerBridge'
import type { MetricsSample } from './profilerTypes'

/** How often to push a sample to the bridge (ms) — ~10 Hz keeps the UI cheap. */
const EMIT_INTERVAL = 100

/**
 * Dev-only. Mounted inside the main `<Canvas>`; registers the renderer/scene/
 * invalidate with the bridge and, throttled to ~10 Hz, pushes a metrics sample
 * read from `gl.info`. Renders nothing.
 *
 * `gl.info.autoReset` is turned OFF so counts are read-then-reset here: reading
 * in `useFrame` (which runs before R3F's `gl.render`) yields the previous
 * frame's fully-accumulated counts, then we reset for the next. Restored on
 * unmount.
 */
export function ProfilerProbe() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const invalidate = useThree((s) => s.invalidate)
  const tier = useStore((s) => s.qualityTier)

  useEffect(() => {
    profilerBridge.register({ gl, scene, invalidate })
    const prevAuto = gl.info.autoReset
    gl.info.autoReset = false
    return () => {
      gl.info.autoReset = prevAuto
    }
  }, [gl, scene, invalidate])

  useEffect(() => {
    profilerBridge.setTier(tier)
  }, [tier])

  const last = useRef(0)
  useFrame((_, dt) => {
    const now = performance.now()
    const render = gl.info.render
    const memory = gl.info.memory
    if (now - last.current >= EMIT_INTERVAL) {
      last.current = now
      let lights = 0
      scene.traverse((o) => {
        const l = o as unknown as {
          isPointLight?: boolean
          isSpotLight?: boolean
          visible: boolean
        }
        if ((l.isPointLight || l.isSpotLight) && l.visible) lights++
      })
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
      const sample: MetricsSample = {
        t: now,
        fps: dt > 0 ? 1 / dt : 0,
        frameMs: dt * 1000,
        calls: render.calls,
        triangles: render.triangles,
        lines: render.lines,
        points: render.points,
        geometries: memory.geometries,
        textures: memory.textures,
        heapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null,
        lights,
        continuous: isRenderingContinuously(),
      }
      profilerBridge.pushSample(sample)
    }
    // Read-then-reset so each frame's gl.info counts are isolated.
    gl.info.reset()
  })

  return null
}
