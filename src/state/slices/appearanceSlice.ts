import type { RootState } from '../store'
import type { SliceCreator } from './types'

/** The four palettes of the design system. Each is authored in OKLCH so the
 *  same UI keeps identical contrast and hierarchy whichever palette is active.
 *  Driven by `[data-theme]` on <html>. */
export type ThemeName = 'clay' | 'kampong' | 'porcelain' | 'estate' | 'harbour'

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
  harbour: {
    name: 'Harbour',
    accent: 'oklch(0.64 0.12 235)',
    chip: 'oklch(0.88 0.01 248)',
    desc: 'Cool slate & marina blue',
  },
}

export const THEME_NAMES: ThemeName[] = ['clay', 'kampong', 'porcelain', 'estate', 'harbour']

export interface AppearanceSlice {
  /** Active palette. */
  theme: ThemeName
  /** User preference for light/dark/auto. */
  modePref: ModePref
  /** Whether the Appearance popover is open in the toolbar. */
  appearanceOpen: boolean
  /**
   * Glass tint hex colour applied to sunlight entering through windows.
   * '#ffffff' or '' = neutral/clear glass (no tint). Optional — defaults to ''.
   * Examples: '#f5d8a0' (warm amber), '#b8d8e8' (cool blue), '#d4ead0' (tinted green).
   * Applied as a component-wise multiply of the sun colour — a subtle but visible
   * effect at midday, especially for strong tints.
   */
  glassTint: string
  setTheme: (theme: ThemeName) => void
  setModePref: (mode: ModePref) => void
  toggleAppearance: () => void
  setAppearanceOpen: (open: boolean) => void
  /** Set the window glass tint colour (hex). Pass '' or '#ffffff' to clear. */
  setGlassTint: (hex: string) => void
}

export const APPEARANCE_INITIAL = {
  theme: 'clay' as ThemeName,
  modePref: 'light' as ModePref,
  appearanceOpen: false,
  glassTint: '',
}

export const createAppearanceSlice: SliceCreator<AppearanceSlice, RootState> = (set) => ({
  ...APPEARANCE_INITIAL,
  setTheme: (theme) => set({ theme }),
  setModePref: (modePref) => set({ modePref }),
  toggleAppearance: () => set((s) => ({ appearanceOpen: !s.appearanceOpen })),
  setAppearanceOpen: (appearanceOpen) => set({ appearanceOpen }),
  setGlassTint: (glassTint) => set({ glassTint }),
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
