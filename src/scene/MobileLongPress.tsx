import { useEffect } from 'react'

const IS_COARSE_POINTER =
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches

const HOLD_MS = 500
const MOVE_TOLERANCE = 12 // px — past this the touch is a drag/orbit, not a press

/** Touch long-press → right-click. On coarse-pointer devices there's no native
 *  right-click, so a stationary ~500ms press on the 3D canvas synthesizes a
 *  `contextmenu` event at the touch point — R3F raycasts it to the item under
 *  the finger and opens the same context menu as a desktop right-click. The iOS
 *  text-selection callout is suppressed in CSS (`body.mobile`). Renders nothing. */
export function MobileLongPress() {
  useEffect(() => {
    if (!IS_COARSE_POINTER) return

    let timer = 0
    let startX = 0
    let startY = 0
    let canvas: HTMLCanvasElement | null = null

    const clear = () => {
      if (timer) {
        clearTimeout(timer)
        timer = 0
      }
    }

    const fire = () => {
      timer = 0
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const ev = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: startX,
        clientY: startY,
        button: 2,
      })
      // R3F raycasts from offsetX/offsetY (not set on synthetic events) — define
      // them relative to the canvas so the press hits the item under the finger.
      Object.defineProperty(ev, 'offsetX', { value: startX - rect.left })
      Object.defineProperty(ev, 'offsetY', { value: startY - rect.top })
      canvas.dispatchEvent(ev)
      try {
        navigator.vibrate?.(8)
      } catch {
        /* vibrate unsupported / blocked — ignore */
      }
    }

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        clear()
        return
      }
      const t = e.target
      if (!(t instanceof HTMLCanvasElement)) return
      canvas = t
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
      clear()
      timer = window.setTimeout(fire, HOLD_MS)
    }
    const onMove = (e: TouchEvent) => {
      if (!timer) return
      const dx = e.touches[0].clientX - startX
      const dy = e.touches[0].clientY - startY
      if (dx * dx + dy * dy > MOVE_TOLERANCE * MOVE_TOLERANCE) clear()
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', clear, { passive: true })
    window.addEventListener('touchcancel', clear, { passive: true })
    return () => {
      clear()
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', clear)
      window.removeEventListener('touchcancel', clear)
    }
  }, [])

  return null
}
