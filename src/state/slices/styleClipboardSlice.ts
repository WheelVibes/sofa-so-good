import { extractAppearance, mergeAppearance } from '../../furniture/appearanceProps'
import { buildMergedCatalog } from '../../furniture/catalog'
import type { FurnitureType, ParamProps } from '../../furniture/types'
import type { RootState } from '../store'
import type { SliceCreator } from './types'

/** A copied "look" — the appearance-only prop subset of a source item, plus the
 *  source def's id/name for the paste affordance label. */
export interface StyleClipboard {
  defId: FurnitureType
  name: string
  props: ParamProps
}

/**
 * Copy-appearance / paste-appearance + bulk-recolour-by-category. Unlike the
 * whole-item clipboard, this transfers only how a piece *looks* (finish / colour
 * / material / variant / tint), keeping each target's size, form and position —
 * so a finish can jump between differently-sized pieces. Ephemeral (not saved).
 */
export interface StyleClipboardSlice {
  appearanceClipboard: StyleClipboard | null
  /** Capture the selected item's appearance into the clipboard. */
  copyAppearance: (id: string) => boolean
  /** Paste the clipboard's appearance onto the given items (only the dims each
   *  target understands). Returns how many items actually changed. */
  pasteAppearanceTo: (ids: string[]) => number
  /** Apply one item's appearance to every other (unlocked) item in its category.
   *  Returns how many items changed. */
  applyAppearanceToCategory: (id: string) => number
}

export const STYLE_CLIPBOARD_INITIAL: Pick<StyleClipboardSlice, 'appearanceClipboard'> = {
  appearanceClipboard: null,
}

/** Build the merged catalog from the current store slices (non-reactive). */
function catalogOf(s: RootState) {
  return buildMergedCatalog({
    userFurniture: s.userFurniture,
    resolvedRemoteFurniture: s.resolvedRemoteFurniture,
    packFurniture: s.packFurniture,
  })
}

export const createStyleClipboardSlice: SliceCreator<StyleClipboardSlice, RootState> = (
  set,
  get,
) => ({
  ...STYLE_CLIPBOARD_INITIAL,
  copyAppearance: (id) => {
    const s = get()
    const item = s.items.find((it) => it.id === id)
    if (!item) return false
    const def = catalogOf(s)[item.defId]
    if (!def) return false
    set({
      appearanceClipboard: {
        defId: def.id,
        name: def.name,
        props: extractAppearance(item.props, def),
      },
    })
    return true
  },
  pasteAppearanceTo: (ids) => {
    const s = get()
    const clip = s.appearanceClipboard
    if (!clip || ids.length === 0) return 0
    const catalog = catalogOf(s)
    const target = new Set(ids)
    let changed = 0
    const items = s.items.map((it) => {
      if (!target.has(it.id) || it.locked) return it
      const def = catalog[it.defId]
      if (!def) return it
      const next = mergeAppearance(it.props, clip.props, def)
      if (next === it.props) return it
      changed += 1
      return { ...it, props: next }
    })
    if (changed === 0) return 0
    s.pushHistory()
    set({ items })
    return changed
  },
  applyAppearanceToCategory: (id) => {
    const s = get()
    const catalog = catalogOf(s)
    const src = s.items.find((it) => it.id === id)
    const srcDef = src && catalog[src.defId]
    if (!src || !srcDef) return 0
    const look = extractAppearance(src.props, srcDef)
    let changed = 0
    const items = s.items.map((it) => {
      if (it.id === id || it.locked) return it
      const def = catalog[it.defId]
      if (!def || def.category !== srcDef.category) return it
      const next = mergeAppearance(it.props, look, def)
      if (next === it.props) return it
      changed += 1
      return { ...it, props: next }
    })
    if (changed === 0) return 0
    s.pushHistory()
    set({ items })
    return changed
  },
})
