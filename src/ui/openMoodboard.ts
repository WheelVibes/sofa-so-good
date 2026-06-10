import { buildMergedCatalog } from '../furniture/catalog'
import { itemPrice } from '../furniture/furniturePrices'
import { useStore } from '../state/store'
import { buildMoodboardHtml, type MoodboardInput } from './moodboard'
import { designPalette } from './reportData'

const sgd = (n: number) => `$${Math.round(n).toLocaleString('en-SG')}`

/**
 * Build a shareable moodboard / style-board from the live design (palette +
 * named finishes + a furniture tile grid + the hero render) and open it in a new
 * window. Mirrors `openDesignReport`; reuses the report's palette derivation so
 * the colour story matches.
 */
export function openMoodboard(): void {
  const s = useStore.getState()
  const canvas = document.querySelector('canvas')
  let hero: string | null = null
  try {
    hero = canvas ? canvas.toDataURL('image/png') : null
  } catch {
    hero = null
  }
  const palette = designPalette(s.finishes)
  const catalog = buildMergedCatalog(s)
  const groups = new Map<string, { name: string; category?: string; count: number; each: number }>()
  for (const it of s.items) {
    const def = catalog[it.defId]
    if (!def) continue
    const g = groups.get(it.defId)
    if (g) g.count += 1
    else
      groups.set(it.defId, {
        name: def.name,
        category: def.category,
        count: 1,
        each: itemPrice(def, def.category),
      })
  }
  const input: MoodboardInput = {
    title: s.floorPlan.name || 'Moodboard',
    subtitle: 'Style board',
    note: s.designNote,
    heroDataUrl: hero,
    palette: palette.map((p) => ({ hex: p.swatch, name: p.name })),
    materials: palette.map((p) => ({ name: p.name, swatch: p.swatch })),
    items: [...groups.values()]
      .sort((a, b) => b.count - a.count)
      .map((g) => ({
        name: g.name,
        category: g.category,
        count: g.count,
        priceText: g.each > 0 ? sgd(g.each) : undefined,
      })),
  }
  const win = window.open('', '_blank')
  if (!win) {
    s.notify.start({
      title: 'Moodboard blocked',
      kind: 'error',
      message: 'Allow pop-ups for this site, then open the moodboard again.',
    })
    return
  }
  win.document.write(buildMoodboardHtml(input))
  win.document.close()
  win.focus()
}
