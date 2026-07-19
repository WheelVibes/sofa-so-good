/**
 * Curated colour-palette presets (R3-FEAT-2, `palettePresets` flag) — one-click
 * themes for the apartment master palette (or a room override), the local
 * answer to Coohom / Planner 5D's theme galleries. Pure static data consumed by
 * `MasterPaletteEditor`; applying one just calls the existing
 * `setMasterPalette`/`setRoomPalette` (sanitised by `cleanPalette`, undoable).
 * Every palette is ≤ `MAX_PALETTE_COLORS` valid `#rrggbb` entries — pinned by
 * `palettePresets.test.ts`.
 */

export interface PalettePreset {
  id: string
  name: string
  /** 5 hex colours, light → dark, tuned for Singapore interior schemes. */
  colors: string[]
}

export const PALETTE_PRESETS: PalettePreset[] = [
  {
    id: 'scandi-calm',
    name: 'Scandinavian calm',
    colors: ['#f5f1ea', '#d9d2c5', '#a8988a', '#5d5147', '#2f2a25'],
  },
  {
    id: 'japandi',
    name: 'Japandi',
    colors: ['#ece5da', '#cbbfae', '#97836e', '#7d8b74', '#4f463c'],
  },
  {
    id: 'terracotta',
    name: 'Terracotta warmth',
    colors: ['#f3e7d9', '#e0b089', '#c4703f', '#8a4b2d', '#4e3222'],
  },
  {
    id: 'coastal',
    name: 'Coastal breeze',
    colors: ['#f4f6f5', '#cfe0e3', '#8db4bd', '#4f7d8c', '#2c4a56'],
  },
  {
    id: 'sage-cream',
    name: 'Sage & cream',
    colors: ['#f6f3ec', '#dde3d5', '#a9b8a0', '#6f8266', '#3f4d3c'],
  },
  {
    id: 'monochrome',
    name: 'Modern monochrome',
    colors: ['#f7f7f7', '#d4d4d4', '#9b9b9b', '#555555', '#1f1f1f'],
  },
  {
    id: 'blush-walnut',
    name: 'Blush & walnut',
    colors: ['#f8f0ec', '#e8cfc4', '#c99b8c', '#7a5648', '#3e2e27'],
  },
  {
    id: 'navy-brass',
    name: 'Navy & brass',
    colors: ['#eee9e0', '#cdb98a', '#59616e', '#2e3646', '#191d26'],
  },
  {
    id: 'modern-luxe',
    name: 'Modern Luxe',
    colors: ['#f2ede4', '#e8e0d2', '#b8a894', '#b8975e', '#4b3a2f'],
  },
  {
    id: 'peranakan',
    name: 'Peranakan Accent',
    colors: ['#f2e9d3', '#e2725b', '#1f6f5c', '#1a3f8f', '#4a352a'],
  },
]
