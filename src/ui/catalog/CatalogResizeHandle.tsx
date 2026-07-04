import { useEffect, useRef, useState } from 'react'

/** Persist key + clamp range for the docked catalog width (per-device UI pref,
 *  like favourites — not part of the design save schema). */
const WIDTH_KEY = 'hdb_catalog_width'
const MIN_W = 260
const MAX_W = 560
const DEFAULT_W = 320

function clampWidth(px: number): number {
  return Math.max(MIN_W, Math.min(MAX_W, Math.round(px)))
}

/** Apply the width to the root as `--catalog-w` (drives `--left-rail` + the
 *  panel width in components.css). Guarded for jsdom/SSR. */
function applyWidth(px: number): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty('--catalog-w', `${px}px`)
}

function loadWidth(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_W
  try {
    const raw = localStorage.getItem(WIDTH_KEY)
    const n = raw ? Number.parseInt(raw, 10) : Number.NaN
    return Number.isFinite(n) ? clampWidth(n) : DEFAULT_W
  } catch {
    return DEFAULT_W
  }
}

/**
 * A `col-resize` drag handle on the catalog dock's right edge (desktop only —
 * the parent gates on `!isMobile`). Dragging sets `--catalog-w` live (pointer
 * events, so mouse + trackpad + touch all work) and persists the final width to
 * localStorage; the width is restored on mount. Keyboard: ←/→ nudge by 16px.
 */
export function CatalogResizeHandle() {
  const [dragging, setDragging] = useState(false)
  const widthRef = useRef(DEFAULT_W)
  const activePointer = useRef<number | null>(null)

  // Restore the persisted width on mount (and clear the var on unmount so a
  // closed catalog doesn't leave a stale rail width around).
  useEffect(() => {
    widthRef.current = loadWidth()
    applyWidth(widthRef.current)
    return () => {
      if (typeof document !== 'undefined') {
        document.documentElement.style.removeProperty('--catalog-w')
      }
    }
  }, [])

  const persist = (px: number) => {
    try {
      localStorage.setItem(WIDTH_KEY, String(px))
    } catch {
      /* private mode / quota — width still applies for this session */
    }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault()
    activePointer.current = e.pointerId
    setDragging(true)
    try {
      ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
    } catch {}
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (activePointer.current !== e.pointerId) return
    // The dock is left-anchored, so its width tracks the pointer's X directly.
    widthRef.current = clampWidth(e.clientX)
    applyWidth(widthRef.current)
  }
  const onPointerUp = (e: React.PointerEvent) => {
    if (activePointer.current !== e.pointerId) return
    activePointer.current = null
    setDragging(false)
    persist(widthRef.current)
  }
  const onKeyDown = (e: React.KeyboardEvent) => {
    const delta = e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0
    if (!delta) return
    e.preventDefault()
    widthRef.current = clampWidth(widthRef.current + delta)
    applyWidth(widthRef.current)
    persist(widthRef.current)
  }

  return (
    <button
      type="button"
      className={`catalog-resize-handle${dragging ? ' dragging' : ''}`}
      aria-label="Resize catalog panel"
      title="Drag to resize"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    />
  )
}
