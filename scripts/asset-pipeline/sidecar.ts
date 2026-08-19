import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'

export interface FurnitureSidecar {
  id: string
  name: string
  category: 'beds' | 'seating' | 'tables' | 'storage' | 'kitchen' | 'lighting' | 'decor'
  footprint: { w: number; d: number; h: number }
  scale: number
  anchor: 'floor-center' | 'origin'
  /** Flat/tabletop set-dressing prop (vase, books, frame): never collides with
   *  walls or items, so the auto-styling pass (decorStyling.ts) can drop it onto
   *  a host surface without a placement conflict — matches the noClip parametric
   *  decor primitives it sits beside. Floor-standing GLBs (a tall plant, a lamp)
   *  omit it so they collide like real furniture. */
  noClip?: boolean
  license?: 'CC0' | 'CC-BY'
  attribution?: string
  sourceUrl?: string
}

export interface MaterialSidecar {
  id: string
  name: string
  category: 'floor' | 'wall'
  /** Picker-chip preview colour (mean albedo tone). Optional — the emitter
   *  falls back to a neutral grey placeholder when absent. */
  swatch?: string
  uvScale: [number, number]
  channels: {
    albedo: string
    normal?: string
    rough?: string
    ao?: string
  }
  license?: 'CC0'
  attribution?: string
  sourceUrl?: string
}

function sidecarPath(filePath: string): string {
  return `${filePath}.json`
}

export function writeSidecar(filePath: string, data: object): void {
  writeFileSync(sidecarPath(filePath), JSON.stringify(data, null, 2))
}

export function readSidecar<T>(filePath: string): T | null {
  const p = sidecarPath(filePath)
  if (!existsSync(p)) return null
  return JSON.parse(readFileSync(p, 'utf8')) as T
}

function titleCase(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join(' ')
}

export interface ResolveFurnitureArgs {
  glbPath: string
  sidecar: FurnitureSidecar | null
  bboxFn: (path: string) => Promise<{ w: number; d: number; h: number }>
}

export async function resolveFurnitureMetadata(
  args: ResolveFurnitureArgs,
): Promise<FurnitureSidecar> {
  if (args.sidecar) return args.sidecar
  const filename = basename(args.glbPath).replace(/\.glb$/i, '')
  const id = `dropped-${filename}`
  const bbox = await args.bboxFn(args.glbPath)
  return {
    id,
    name: titleCase(filename),
    category: 'decor',
    footprint: bbox,
    scale: 1.0,
    anchor: 'floor-center',
  }
}
