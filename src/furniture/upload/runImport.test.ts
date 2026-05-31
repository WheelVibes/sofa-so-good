import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the heavy collaborators so we test runImport's orchestration, not IDB.
vi.mock('../ikea/importGroup', () => ({
  importGroup: vi.fn(async (meta: { product_name: string }) => ({
    ok: true,
    def: { name: meta.product_name },
  })),
}))
vi.mock('./bulkImport', async (orig) => {
  const actual = await orig<typeof import('./bulkImport')>()
  return {
    ...actual,
    importGlbFiles: vi.fn(
      async (files: File[], _opts: unknown, onProgress?: (d: number, t: number) => void) => {
        files.forEach((_, i) => {
          onProgress?.(i + 1, files.length)
        })
        return { total: files.length, imported: files.length, skipped: [] }
      },
    ),
  }
})

import { GROUP_CONCURRENCY, planUnits, runImport } from './runImport'

function metaFor(key: string) {
  return {
    group_key: key,
    product_name: key.toUpperCase(),
    design: { category: 'storage', placement: 'floor' },
    variants: [{ article_number: `${key}-1`, url: 'x', glb: `${key}.glb` }],
  }
}

function fileAt(path: string): File {
  const f = new File([new Uint8Array(4)], path.split('/').pop() ?? path)
  Object.defineProperty(f, 'webkitRelativePath', { value: path })
  return f
}

const plan = (groups: string[], loose: string[] = []) => ({
  files: [
    ...groups.flatMap((g) => [fileAt(`${g}/metadata.json`), fileAt(`${g}/${g}.glb`)]),
    ...loose.map((l) => fileAt(`extras/${l}.glb`)),
  ],
  groups: groups.map((g) => ({ dir: `${g}/`, meta: metaFor(g) })),
  looseCategory: 'others' as const,
  mounted: false,
  noClip: false,
})

describe('runImport', () => {
  beforeEach(() => vi.clearAllMocks())

  it('imports every group (not just the first)', async () => {
    const out = await runImport(plan(['malm', 'billy', 'kallax']))
    expect(out.groups.filter((g) => g.ok)).toHaveLength(3)
    expect(out.groups.map((g) => g.name).sort()).toEqual(['BILLY', 'KALLAX', 'MALM'])
  })

  it('reports progress ending at the total work units', async () => {
    const p = plan(['malm', 'billy'], ['chair'])
    const seen: Array<[number, number]> = []
    await runImport(p, (d, t) => seen.push([d, t]))
    const total = planUnits(p)
    expect(total).toBe(3) // 2 groups + 1 loose
    expect(seen.at(-1)).toEqual([3, 3])
  })

  it('runs groups concurrently up to the cap', async () => {
    const { importGroup } = await import('../ikea/importGroup')
    let inFlight = 0
    let peak = 0
    ;(importGroup as ReturnType<typeof vi.fn>).mockImplementation(
      async (meta: { product_name: string }) => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await Promise.resolve()
        await Promise.resolve()
        inFlight--
        return { ok: true, def: { name: meta.product_name } }
      },
    )
    await runImport(plan(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']))
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThanOrEqual(GROUP_CONCURRENCY)
  })

  it('keeps a failed group from aborting the rest', async () => {
    const { importGroup } = await import('../ikea/importGroup')
    ;(importGroup as ReturnType<typeof vi.fn>).mockImplementation(
      async (meta: { product_name: string }) =>
        meta.product_name === 'BILLY'
          ? { ok: false, reason: 'bad glb' }
          : { ok: true, def: { name: meta.product_name } },
    )
    const out = await runImport(plan(['malm', 'billy', 'kallax']))
    expect(out.groups.filter((g) => g.ok)).toHaveLength(2)
    expect(out.groups.find((g) => !g.ok)?.reason).toBe('bad glb')
  })
})
