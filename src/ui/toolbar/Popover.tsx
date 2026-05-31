import { type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface PopoverProps {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
  children: ReactNode
  /** Horizontal alignment of the panel relative to the trigger. */
  align?: 'left' | 'center'
}

/** Portaled, fixed-position panel anchored under a trigger. Escapes the
 *  toolbar island's overflow clip; closes on Escape + outside pointerdown +
 *  scroll/resize; clamps to the viewport horizontally. */
export function Popover({ open, anchorRef, onClose, children, align = 'left' }: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return
    const r = anchorRef.current.getBoundingClientRect()
    const panelW = panelRef.current?.offsetWidth ?? 0
    let left = align === 'center' ? r.left + r.width / 2 - panelW / 2 : r.left
    const top = r.bottom + 6
    // Clamp to viewport with an 8px margin.
    const maxLeft = window.innerWidth - panelW - 8
    if (panelW) left = Math.max(8, Math.min(left, maxLeft))
    setPos({ left, top })
  }, [open, anchorRef, align])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (panelRef.current?.contains(t)) return
      if (anchorRef.current?.contains(t)) return
      onClose()
    }
    const onReflow = () => onClose()
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('resize', onReflow)
    window.addEventListener('scroll', onReflow, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('resize', onReflow)
      window.removeEventListener('scroll', onReflow, true)
    }
  }, [open, anchorRef, onClose])

  if (!open) return null
  return createPortal(
    <div
      ref={panelRef}
      style={{ position: 'fixed', left: pos?.left ?? -9999, top: pos?.top ?? -9999, zIndex: 60 }}
    >
      {children}
    </div>,
    document.body,
  )
}
