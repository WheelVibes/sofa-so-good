import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'

/** Themed frame-rate HUD (Graphics panel "FPS counter" toggle). A lightweight
 *  DOM `requestAnimationFrame` sampler — independent of which `<Canvas>` is
 *  mounted — so it works in both the main and room-editor scenes. Sits at the
 *  `--z-hud` layer (just above the scene), so every panel / popover / modal
 *  renders above it. Also mirrors the latest value onto `window.__lastFps` for
 *  the screenshot harness. */
export function FpsCounter() {
  const showFps = useStore((s) => s.showFps)
  const [fps, setFps] = useState<number | null>(null)
  const ref = useRef({ frames: 0, acc: 0, last: 0 })

  useEffect(() => {
    if (!showFps) {
      setFps(null)
      return
    }
    let raf = 0
    const st = ref.current
    st.frames = 0
    st.acc = 0
    st.last = performance.now()
    const tick = (t: number) => {
      st.frames++
      st.acc += t - st.last
      st.last = t
      // Update the readout roughly twice a second to keep it legible.
      if (st.acc >= 500) {
        const v = Math.round((st.frames * 1000) / st.acc)
        setFps(v)
        ;(window as unknown as { __lastFps?: number }).__lastFps = v
        st.frames = 0
        st.acc = 0
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [showFps])

  if (!showFps || fps == null) return null
  const tone = fps >= 50 ? 'good' : fps >= 30 ? 'warn' : 'bad'
  return (
    <div className={`fps-hud fps-${tone}`} role="status" aria-label={`${fps} frames per second`}>
      <span className="fps-dot" />
      <span className="fps-n">{fps}</span>
      <span className="fps-u">fps</span>
    </div>
  )
}
