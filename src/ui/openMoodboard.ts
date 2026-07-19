import { buildMergedCatalog } from '../furniture/catalog'
import { itemPrice } from '../furniture/furniturePrices'
import { useStore } from '../state/store'
import type { MoodboardInput } from './moodboard'

const sgd = (n: number) => `$${Math.round(n).toLocaleString('en-SG')}`

/**
 * Build a shareable moodboard / style-board from the live design (palette +
 * named finishes + a furniture tile grid + the hero render) and open it in a new
 * window. Mirrors `openDesignReport`; reuses the report's palette derivation so
 * the colour story matches.
 *
 * The window is opened synchronously (inside the click's user activation) and
 * the moodboard/palette builders are dynamic-imported afterwards — they stay
 * out of the boot bundle (P-CHUNK).
 */
export async function openMoodboard(): Promise<void> {
  const s = useStore.getState()
  const win = window.open('', '_blank')
  if (!win) {
    s.notify.start({
      title: 'Moodboard blocked',
      kind: 'error',
      message: 'Allow pop-ups for this site, then open the moodboard again.',
    })
    return
  }
  const canvas = document.querySelector('canvas')
  let hero: string | null = null
  try {
    hero = canvas ? canvas.toDataURL('image/png') : null
  } catch {
    hero = null
  }
  let html: string
  try {
    const [{ buildMoodboardHtml }, { designPalette }] = await Promise.all([
      import('./moodboard'),
      import('./reportData'),
    ])
    const palette = designPalette(s.finishes)
    const catalog = buildMergedCatalog(s)
    const groups = new Map<
      string,
      { name: string; category?: string; count: number; each: number }
    >()
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
          // First-occurrence pricing (like `name`/`category` above) — see the
          // matching note in `openBoq.ts`.
          each: itemPrice(def, def.category, undefined, it.meta?.price),
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
    html = buildMoodboardHtml(input)
  } catch {
    win.close()
    s.notify.start({
      title: 'Moodboard failed',
      kind: 'error',
      message: 'Could not load the moodboard builder — check your connection and try again.',
    })
    return
  }
  win.document.write(html)
  win.document.close()
  win.focus()
}
