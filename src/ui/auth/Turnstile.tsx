import { useEffect, useRef } from 'react'

/**
 * Cloudflare Turnstile widget for the login form. Renders only when a site key
 * is configured (`VITE_TURNSTILE_SITE_KEY`); otherwise it's a no-op so local /
 * preview builds aren't blocked. Loads the Turnstile script once and renders
 * explicitly, reporting the solved token via `onToken`.
 */

const SITE_KEY = (import.meta.env?.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() ?? ''
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface TurnstileApi {
  render: (
    el: HTMLElement,
    opts: { sitekey: string; callback: (token: string) => void; 'expired-callback'?: () => void },
  ) => string
  remove: (id: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<void> | null = null

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Turnstile failed to load'))
    document.head.appendChild(s)
  })
  return scriptPromise
}

/** True when Turnstile is configured for this build. */
export function turnstileEnabled(): boolean {
  return SITE_KEY !== ''
}

export function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!SITE_KEY) return
    let widgetId: string | null = null
    let cancelled = false
    void loadScript()
      .then(() => {
        if (cancelled || !ref.current || !window.turnstile) return
        widgetId = window.turnstile.render(ref.current, {
          sitekey: SITE_KEY,
          callback: onToken,
          'expired-callback': () => onToken(''),
        })
      })
      .catch(() => {
        /* leave the form usable; the server will reject if verification is required */
      })
    return () => {
      cancelled = true
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId)
    }
  }, [onToken])

  if (!SITE_KEY) return null
  return <div ref={ref} style={{ marginTop: 'var(--s-2)' }} />
}
