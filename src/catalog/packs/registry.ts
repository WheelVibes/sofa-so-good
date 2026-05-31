import { parseKenneyFurnitureKit } from './parsers'
import type { Pack } from './types'

export const AVAILABLE_PACKS: Pack[] = [
  {
    id: 'kenney-furniture-kit',
    name: 'Kenney Furniture Kit',
    description:
      'Stylized low-poly furniture — bedrooms, kitchens, bathrooms, lounges, decor (~125 items).',
    attribution: 'Kenney — kenney.nl (CC0)',
    license: 'CC0',
    sourceUrl: 'https://kenney.nl/assets/furniture-kit',
    downloadUrl:
      '/kenney/media/pages/assets/furniture-kit/e56d2a9828-1677580847/kenney_furniture-kit.zip',
    sizeBytes: 5_130_729,
    parseEntries: parseKenneyFurnitureKit,
  },
  {
    id: 'ikea-sg-live',
    kind: 'ikea-live',
    name: 'IKEA Singapore (live scrape)',
    description:
      'Scrapes IKEA SG product models on demand via the local scraper sidecar, optimizing each model as it downloads. Requires `npm run scraper-server`.',
    // Not a CC0 claim — the literal only satisfies the Pack type; the card shows
    // the IKEA attribution. IKEA models are IKEA IP, local/dev-only.
    attribution: 'IKEA — ikea.com/sg (imported models, local/dev-only)',
    license: 'CC0',
    sourceUrl: 'https://www.ikea.com/sg/en/',
  },
]

/** Packs to surface in the UI. The IKEA Singapore live-scrape pack is dev-only —
 *  it depends on the local scraper sidecar and exposes IKEA-branded, non-CC0
 *  content, so it must never appear in a production build. (Importing IKEA model
 *  folders, grouping, and sets still work in production — only this discoverable
 *  scrape entry is hidden.) */
export function visiblePacks(isDev: boolean): Pack[] {
  return AVAILABLE_PACKS.filter((p) => isDev || p.kind !== 'ikea-live')
}
