import { describe, expect, it } from 'vitest'
import { fuzzySearch } from '../ui/catalog/fuzzySearch'
import { BUILTIN_CATALOG } from './builtinCatalog'
import type { FurnitureDef } from './types'

const defs = Object.values(BUILTIN_CATALOG)

// Same text fields the catalog drawer searches: name + keywords.
const search = (q: string): FurnitureDef[] =>
  fuzzySearch(q, defs, (d) => [d.name, ...(d.keywords ?? [])])

describe('builtin catalog search synonyms', () => {
  // A common alternate term → the def the user expects, ranked first.
  const cases: [string, string][] = [
    ['oven', 'stove'],
    ['hob', 'stove'],
    ['fridge', 'refrigerator'],
    ['television', 'flatscreen-tv'],
    ['air conditioner', 'aircon-unit'],
    ['bedside table', 'nightstand'],
    ['bookcase', 'bookshelf'],
    ['desk chair', 'office-chair'],
    ['carpet', 'rug'],
    ['drapes', 'curtains'],
    ['houseplant', 'potted-plant'],
    ['wc', 'toilet'],
    ['washbasin', 'bathroom-sink'],
    ['pendant', 'ceiling-light'],
  ]
  for (const [query, id] of cases) {
    it(`"${query}" finds ${id}`, () => {
      const hit = search(query)
      // The synonym should surface the expected item near the top (some queries
      // like "oven" legitimately tie with "microwave oven", so allow top-3).
      expect(hit.slice(0, 3).map((d) => d.id)).toContain(id)
    })
  }
})
