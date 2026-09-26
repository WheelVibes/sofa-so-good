/**
 * Persists the appearance preference (theme + light/dark/auto mode + the U4
 * reduce-motion override) to localStorage so it survives reloads, and applies
 * it to the <html> element's `[data-theme]` / `[data-mode]` /
 * `[data-reduce-motion]` attributes (which drive the design-token palette and
 * the motion-suppression CSS). The key + shape mirror the pre-paint bootstrap
 * script in index.html so there is never a flash of the wrong theme — or of
 * full-speed animation on a reduce-motion session.
 *
 * ## Why `[data-reduce-motion]` exists (MOTION-PREF-CSS)
 *
 * `ui/motionPreference.ts:shouldReduceMotion()` resolves the tri-state for
 * *JavaScript* call sites, but the app's principal animation suppressor is the
 * blanket `@media (prefers-reduced-motion: reduce)` block in `styles/app.css`
 * (plus `parts.css`, `LoadingOverlay`, `TierChangeVeil` and the boot loader in
 * `index.html`). A bare media query reads the OS and nothing else, so it can
 * express neither half of the documented contract: an in-app "Reduce" could
 * not suppress CSS motion, and an in-app "Full" could not restore it for a
 * user whose OS asks to reduce. Both were shipped as false captions in the
 * Appearance popover until this attribute existed.
 *
 * The raw (unresolved) preference is written, i.e. `'system' | 'on' | 'off'`,
 * NOT a resolved boolean. That is deliberate: it lets CSS do the resolving
 * natively, so `'system'` needs no `matchMedia` listener to track a live OS
 * change, and it keeps the media query as the *baseline*. Each motion block is
 * authored in two halves:
 *
 * ```css
 * @media (prefers-reduced-motion: reduce) { :root:not([data-reduce-motion='off']) … }
 * :root[data-reduce-motion='on'] …
 * ```
 *
 * The doubled form is chosen over collapsing everything onto the attribute
 * alone (the single-selector `:root[data-reduce-motion]` form argued for in
 * e.g. KyleMit/Splotch#2093, 2026-09-19) because of which way each fails: with
 * the media query as the baseline, a bug in the boot script, blocked
 * localStorage or JS that never runs still honours an OS reduce-motion request
 * — the attribute can only ever *add* an explicit user override on top. The
 * attribute-only form fails the other way, handing full motion to exactly the
 * vestibular-disorder user the feature exists for. Smashing Magazine's
 * "Respecting Users' Motion Preferences" (2021-10-21) documents the same
 * override-in-both-directions requirement via a custom-property escape hatch;
 * the attribute form is the selector-level equivalent and survives the
 * `!important` blanket reset, which a custom property cannot drive.
 * https://www.smashingmagazine.com/2021/10/respecting-users-motion-preferences/
 *
 * `styles/styleGuards.test.ts` fails the build if a `prefers-reduced-motion`
 * block in `src/styles/` is authored without the escape hatch.
 */
import type { ModePref, ReduceMotionPref, ThemeName } from '../slices/appearanceSlice'
import { resolveMode } from '../slices/appearanceSlice'
import { useStore } from '../store'

const KEY = 'hdb_appearance'

/** Write the resolved theme + mode and the raw motion preference onto <html>. */
function applyAppearance(
  theme: ThemeName,
  modePref: ModePref,
  reduceMotion: ReduceMotionPref,
): void {
  const mode = resolveMode(modePref)
  const el = document.documentElement
  el.setAttribute('data-theme', theme)
  el.setAttribute('data-mode', mode)
  el.setAttribute('data-reduce-motion', reduceMotion)
  el.style.colorScheme = mode
}

export function loadAppearancePrefs(): void {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const p = JSON.parse(raw) as {
        theme?: ThemeName
        modePref?: ModePref
        reduceMotion?: ReduceMotionPref
      }
      useStore.setState({
        theme: p.theme ?? 'clay',
        modePref: p.modePref ?? 'light',
        // Back-compat default for a record written before U4 — 'system' keeps
        // pre-existing behaviour (OS query only, no in-app override) exactly.
        reduceMotion: p.reduceMotion ?? 'system',
      })
    }
  } catch {
    /* ignore corrupt prefs */
  }
  const { theme, modePref, reduceMotion } = useStore.getState()
  applyAppearance(theme, modePref, reduceMotion)
}

export function watchAppearancePrefs(): void {
  let last = ''
  useStore.subscribe((s) => {
    const snap = JSON.stringify({
      theme: s.theme,
      modePref: s.modePref,
      reduceMotion: s.reduceMotion,
    })
    if (snap === last) return
    last = snap
    applyAppearance(s.theme, s.modePref, s.reduceMotion)
    try {
      localStorage.setItem(KEY, snap)
    } catch {
      /* storage full / unavailable */
    }
  })

  // When the OS theme changes and the user is on Auto, re-resolve live.
  if (typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      const { theme, modePref, reduceMotion } = useStore.getState()
      if (modePref === 'auto') applyAppearance(theme, modePref, reduceMotion)
    }
    mq.addEventListener?.('change', onChange)
  }
}
