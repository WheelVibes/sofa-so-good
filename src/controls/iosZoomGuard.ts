/**
 * Stop iOS Safari from auto-zooming when a text field smaller than 16px gains
 * focus — WITHOUT bumping every field to an ugly 16px on mobile.
 *
 * iOS only performs the focus-zoom when the page is zoomable (no `maximum-scale`)
 * AND the focused control's font is < 16px. We keep the page freely pinch-zoomable
 * normally, and momentarily add `maximum-scale=1` to the viewport while a field is
 * focused (which suppresses the zoom), restoring it on blur so pinch-zoom returns.
 *
 * Harmless on Android/desktop (they don't focus-zoom and largely ignore the
 * `maximum-scale` toggle). Idempotent — safe to call once at boot.
 */

const BASE_VIEWPORT = 'width=device-width, initial-scale=1.0, viewport-fit=cover'
const FOCUSED_VIEWPORT = `${BASE_VIEWPORT}, maximum-scale=1.0`

let installed = false

function isTextEntry(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'TEXTAREA') return true
  if (tag !== 'INPUT') return false
  // Only text-entry input types trigger the iOS focus-zoom; buttons/checkboxes/
  // ranges/colour wells don't. `type` is empty/absent for the default text input.
  const type = (el as HTMLInputElement).type
  return (
    type === '' ||
    type === 'text' ||
    type === 'search' ||
    type === 'email' ||
    type === 'tel' ||
    type === 'url' ||
    type === 'password' ||
    type === 'number'
  )
}

export function installIosZoomGuard(): void {
  if (installed || typeof document === 'undefined') return
  installed = true
  const meta = document.querySelector('meta[name="viewport"]')
  if (!meta) return

  const setContent = (v: string) => {
    if (meta.getAttribute('content') !== v) meta.setAttribute('content', v)
  }

  document.addEventListener(
    'focusin',
    (e) => {
      if (isTextEntry(e.target)) setContent(FOCUSED_VIEWPORT)
    },
    true,
  )
  document.addEventListener(
    'focusout',
    () => {
      // Restore freely-zoomable viewport once the field is left.
      setContent(BASE_VIEWPORT)
    },
    true,
  )
}
