import type { RootState } from '../store'
import type { SliceCreator } from './types'

/** The four palettes of the design system. Each is authored in OKLCH so the
 *  same UI keeps identical contrast and hierarchy whichever palette is active.
 *  Driven by `[data-theme]` on <html>. */
export type ThemeName = 'clay' | 'kampong' | 'porcelain' | 'estate'

/** Light / Dark / Auto (follows the OS). Resolved to a concrete `'light' |
 *  'dark'` mode that is written to `[data-mode]` on <html>. */
export type ModePref = 'light' | 'dark' | 'auto'

/** Static metadata for the Appearance switcher cards. `chip` + `accent` are the
 *  two-swatch preview; `desc` is the one-line mood. */
export const THEME_META: Record<
  ThemeName,
  { name: string; accent: string; chip: string; desc: string }
> = {
  clay: {
    name: 'Clay',
    accent: 'oklch(0.6 0.125 42)',
    chip: 'oklch(0.9 0.022 55)',
    desc: 'Warm paper & terracotta',
  },
  kampong: {
    name: 'Kampong',
    accent: 'oklch(0.55 0.1 152)',
    chip: 'oklch(0.91 0.028 110)',
    desc: 'Sand & tropical green',
  },
  porcelain: {
    name: 'Porcelain',
    accent: 'oklch(0.58 0.075 200)',
    chip: 'oklch(0.91 0.012 220)',
    desc: 'Cool porcelain & jade',
  },
  estate: {
    name: 'Estate',
    accent: 'oklch(0.64 0.12 62)',
    chip: 'oklch(0.88 0.01 80)',
    desc: 'HDB concrete & amber',
  },
}

export const THEME_NAMES: ThemeName[] = ['clay', 'kampong', 'porcelain', 'estate']

export interface AppearanceSlice {
  /** Active palette. */
  theme: ThemeName
  /** User preference for light/dark/auto. */
  modePref: ModePref
  /** Whether the Appearance popover is open in the toolbar. */
  appearanceOpen: boolean
  setTheme: (theme: ThemeName) => void
  setModePref: (mode: ModePref) => void
  toggleAppearance: () => void
  setAppearanceOpen: (open: boolean) => void
}

export const APPEARANCE_INITIAL = {
  theme: 'clay' as ThemeName,
  modePref: 'light' as ModePref,
  appearanceOpen: false,
}

export const createAppearanceSlice: SliceCreator<AppearanceSlice, RootState> = (set) => ({
  ...APPEARANCE_INITIAL,
  setTheme: (theme) => set({ theme }),
  setModePref: (modePref) => set({ modePref }),
  toggleAppearance: () => set((s) => ({ appearanceOpen: !s.appearanceOpen })),
  setAppearanceOpen: (appearanceOpen) => set({ appearanceOpen }),
})

/** Resolve a `ModePref` to a concrete light/dark mode, consulting the OS only
 *  for `'auto'`. */
export function resolveMode(pref: ModePref): 'light' | 'dark' {
  if (pref === 'auto') {
    return typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
  }
  return pref
}
