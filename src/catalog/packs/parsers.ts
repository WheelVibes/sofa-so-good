import type { FurnitureCategory } from '../../furniture/types'
import type { PackEntryDescriptor } from './types'

const KENNEY_GLB_PREFIX = 'Models/GLTF format/'
const ARCHITECTURAL_PREFIXES = ['wall', 'floor', 'door', 'stairs', 'ceilingFan', 'paneling']

interface CategoryRule {
  match: string[]
  category: FurnitureCategory
}

const CATEGORY_RULES: CategoryRule[] = [
  { match: ['bed'], category: 'beds' },
  { match: ['chair', 'sofa', 'lounge', 'bench', 'stool', 'pillow'], category: 'seating' },
  { match: ['desk', 'table'], category: 'tables' },
  { match: ['bookcase', 'cabinet', 'coatRack', 'cardboardBox'], category: 'storage' },
  { match: ['kitchen'], category: 'kitchen' },
  { match: ['lamp'], category: 'lighting' },
]

function categoryFor(id: string): FurnitureCategory {
  const lower = id.toLowerCase()
  for (const rule of CATEGORY_RULES) {
    for (const m of rule.match) {
      if (lower.includes(m.toLowerCase())) return rule.category
    }
  }
  return 'decor'
}

function isArchitectural(id: string): boolean {
  const lower = id.toLowerCase()
  return ARCHITECTURAL_PREFIXES.some((p) => lower.startsWith(p.toLowerCase()))
}

function camelCaseToTitle(s: string): string {
  return s
    .replace(/([a-z])([A-Z0-9])/g, '$1 $2')
    .replace(/(\d+)([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
}

export function parseKenneyFurnitureKit(files: Record<string, Uint8Array>): PackEntryDescriptor[] {
  const out: PackEntryDescriptor[] = []
  for (const path of Object.keys(files)) {
    if (!path.startsWith(KENNEY_GLB_PREFIX) || !path.endsWith('.glb')) continue
    const id = path.slice(KENNEY_GLB_PREFIX.length, -'.glb'.length)
    if (isArchitectural(id)) continue
    out.push({
      id,
      name: camelCaseToTitle(id),
      category: categoryFor(id),
      glbPath: path,
    })
  }
  out.sort((a, b) => a.id.localeCompare(b.id))
  return out
}
