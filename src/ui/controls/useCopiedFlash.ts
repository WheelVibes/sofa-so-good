import { useEffect, useRef, useState } from 'react'

/**
 * Inline copy-confirmation state (UIUX-25, the Watermelon "copy-confirm"
 * state-morph): call `flash()` after a successful copy and `copied` holds true
 * for ~1.6s, during which the button swaps its icon/label to a checked
 * "Copied" state (with the `.done-pop` overshoot on the icon). Repeat calls
 * restart the window. The morph complements the toast — feedback lives *in*
 * the control the user just pressed.
 */
export function useCopiedFlash(ms = 1600): { copied: boolean; flash: () => void } {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  const flash = () => {
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), ms)
  }
  return { copied, flash }
}
