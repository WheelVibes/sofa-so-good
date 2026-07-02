import { useStore } from '../state/store'
import { APP_VERSION, isNewerVersion } from '../version'

/**
 * "Check for updates" for the Electron desktop shell.
 *
 * The web/PWA update path (src/pwa/swUpdate.ts) is service-worker based; the
 * desktop build ships with the SW disabled (VITE_DISABLE_PWA=1), so it can
 * neither detect nor hot-apply a new deploy. Instead the shell asks GitHub for
 * the latest release (CORS-enabled API), compares its tag against the running
 * APP_VERSION, and offers the releases page — electron/main.mjs routes the
 * https link to the system browser.
 */

/** GitHub repo the desktop shell checks for new releases. */
const REPO = 'cwlroda/sofa-so-good'
export const RELEASES_API_URL = `https://api.github.com/repos/${REPO}/releases/latest`
export const RELEASES_PAGE_URL = `https://github.com/${REPO}/releases/latest`

/** True when running inside the Electron desktop shell — dist/ is served over
 *  the privileged `app://` scheme registered by electron/main.mjs. */
export function isDesktopShell(): boolean {
  return typeof window !== 'undefined' && window.location.protocol === 'app:'
}

/** Extract a comparable version from a release tag ('v0.9.1.0' → '0.9.1.0');
 *  null for anything that isn't a plain (optionally v-prefixed) version. Pure. */
export function releaseTagToVersion(tag: unknown): string | null {
  if (typeof tag !== 'string') return null
  const m = /^v?(\d+(?:\.\d+){1,3})$/.exec(tag.trim())
  return m ? m[1] : null
}

export type DesktopUpdate =
  | { status: 'update'; version: string }
  | { status: 'uptodate' }
  | { status: 'error' }

/** Decide from a release tag whether it's ahead of the running build. Pure. */
export function decideDesktopUpdate(tag: unknown, current: string = APP_VERSION): DesktopUpdate {
  const version = releaseTagToVersion(tag)
  if (!version) return { status: 'error' }
  return isNewerVersion(version, current) ? { status: 'update', version } : { status: 'uptodate' }
}

/** Manual "Check for updates" with toast feedback, desktop-shell flavour —
 *  mirrors swUpdate.runUpdateCheck's UX (spinner → result toast). */
export async function runDesktopUpdateCheck(): Promise<void> {
  const { notify } = useStore.getState()
  const id = notify.start({ title: 'Checking for updates…', kind: 'progress' })
  notify.update(id, { progress: null }) // indeterminate spinner

  let result: DesktopUpdate
  try {
    const res = await fetch(RELEASES_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    result = res.ok ? decideDesktopUpdate((await res.json())?.tag_name) : { status: 'error' }
  } catch {
    result = { status: 'error' }
  }

  notify.dismiss(id)
  if (result.status === 'update') {
    notify.start({
      title: 'Update available',
      message: `Sofa So Good v${result.version} is out — you’re on v${APP_VERSION}.`,
      kind: 'info',
      icon: 'Versions',
      autoDismissMs: null,
      actionLabel: 'Download',
      // window.open → setWindowOpenHandler in the shell → system browser.
      onAction: () => void window.open(RELEASES_PAGE_URL, '_blank'),
    })
  } else if (result.status === 'uptodate') {
    notify.start({ title: `You’re on the latest version (v${APP_VERSION})`, kind: 'info' })
  } else {
    notify.start({ title: 'Couldn’t reach the update server', kind: 'info' })
  }
}
