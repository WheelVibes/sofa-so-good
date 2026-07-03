import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the heavy collaborators so we test runImport's orchestration, not IDB.
vi.mock('../ikea/importGroup', () => ({
  importGroup: vi.fn(async (meta: { group_key: string; product_name: string }) => ({
    ok: true,
    def: { id: `ikea-${meta.group_key}`, name: meta.product_name },
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

import { GROUP_CONCURRENCY, planUnits, runImport, startBackgroundImport } from './runImport'

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
      async (meta: { group_key: string; product_name: string }) => {
        inFlight++
        peak = Math.max(peak, inFlight)
        await Promise.resolve()
        await Promise.resolve()
        inFlight--
        return { ok: true, def: { id: `ikea-${meta.group_key}`, name: meta.product_name } }
      },
    )
    await runImport(plan(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']))
    expect(peak).toBeGreaterThan(1)
    expect(peak).toBeLessThanOrEqual(GROUP_CONCURRENCY)
  })

  it('keeps a failed group from aborting the rest', async () => {
    const { importGroup } = await import('../ikea/importGroup')
    ;(importGroup as ReturnType<typeof vi.fn>).mockImplementation(
      async (meta: { group_key: string; product_name: string }) =>
        meta.product_name === 'BILLY'
          ? { ok: false, reason: 'bad glb' }
          : { ok: true, def: { id: `ikea-${meta.group_key}`, name: meta.product_name } },
    )
    const out = await runImport(plan(['malm', 'billy', 'kallax']))
    expect(out.groups.filter((g) => g.ok)).toHaveLength(2)
    expect(out.groups.find((g) => !g.ok)?.reason).toBe('bad glb')
  })

  it('commits groups in batches (few store writes, not one per group)', async () => {
    const { useStore } = await import('../../state/store')
    const { COMMIT_BATCH } = await import('./bulkImport')
    useStore.setState({ userFurniture: [] })
    let writes = 0
    const unsub = useStore.subscribe((s, prev) => {
      if (s.userFurniture !== prev.userFurniture) writes++
    })
    const n = COMMIT_BATCH * 3 + 4 // spans several batches + a tail
    const groups = Array.from({ length: n }, (_, i) => `g${i}`)
    await runImport(plan(groups))
    unsub()
    // All committed…
    expect(useStore.getState().userFurniture).toHaveLength(n)
    // …but in a handful of writes, NOT one per group (the white-flicker fix).
    expect(writes).toBeLessThanOrEqual(Math.ceil(n / COMMIT_BATCH) + 1)
    expect(writes).toBeLessThan(n)
  })
})

// P31: lock that the progress toast's 0..1 bar and its "X / Y" text are always
// derived from the SAME coalesced { d, t } counter, so they can never disagree
// (one read mid-import, one at completion). Drives startBackgroundImport for
// real against the real notificationsSlice — only the heavy IKEA/GLB work
// above is mocked — with requestAnimationFrame stubbed away so coalesceProgress
// falls back to its ~16ms setTimeout path, which fake timers can step through
// deterministically.
describe('startBackgroundImport — progress toast bar/text coupling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('requestAnimationFrame', undefined)
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('mid-import toast progress equals d/t and message is "d / t" from one counter', async () => {
    const { useStore } = await import('../../state/store')
    const { importGroup } = await import('../ikea/importGroup')
    useStore.setState({ notifications: [] })

    // Gate one group so the other GROUP_CONCURRENCY-1 finish first, giving us
    // a genuine mid-import point to inspect before the import completes.
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    ;(importGroup as ReturnType<typeof vi.fn>).mockImplementation(
      async (meta: { group_key: string; product_name: string }) => {
        if (meta.product_name === 'GATED') await gate
        return { ok: true, def: { id: `ikea-${meta.group_key}`, name: meta.product_name } }
      },
    )

    const p = plan(['a', 'gated', 'b', 'c']) // sized to GROUP_CONCURRENCY (4)
    expect(GROUP_CONCURRENCY).toBe(4)
    const outcomePromise = startBackgroundImport(p)

    // Let the microtask queue drain: a/b/c resolve immediately, 'gated' is
    // still blocked, so runImport's shared counter sits at 3/4 but hasn't
    // been flushed to the store yet (coalesceProgress schedules, doesn't
    // deliver synchronously).
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    let toast = useStore.getState().notifications.find((n) => n.kind === 'progress')
    expect(toast).toBeDefined()
    const id = toast?.id as string

    // Fire the coalesced setTimeout fallback — exactly one delivery for
    // however many pushes queued up.
    await vi.advanceTimersByTimeAsync(16)

    toast = useStore.getState().notifications.find((n) => n.id === id)
    expect(toast?.progress).toBeCloseTo(3 / 4)
    expect(toast?.message).toBe('3 / 4')

    release()
    await vi.advanceTimersByTimeAsync(16)
    const outcome = await outcomePromise
    expect(outcome.groups.filter((g) => g.ok)).toHaveLength(4)

    const final = useStore.getState().notifications.find((n) => n.id === id)
    expect(final?.kind).toBe('success')
  })

  it('final flush lands the bar at 1 and the text at "t / t" together', async () => {
    const { useStore } = await import('../../state/store')
    useStore.setState({ notifications: [] })

    const p = plan(['x', 'y'], ['z'])
    const total = planUnits(p)
    expect(total).toBe(3)

    // Spy on notify.update (the notify object is a stable reference on the
    // slice, so spying on its method intercepts the real calls too) to
    // capture every (progress, message) pair the adapter ever sends — the
    // invariant is that EVERY delivered pair is internally consistent
    // (message encodes the same d/t the bar reports), not just the last one.
    const seen: Array<{ progress?: number | null; message?: string }> = []
    const real = useStore.getState().notify.update.bind(useStore.getState().notify)
    const updateSpy = vi
      .spyOn(useStore.getState().notify, 'update')
      .mockImplementation((id, patch) => {
        seen.push({ progress: patch.progress, message: patch.message })
        return real(id, patch)
      })

    try {
      const outcomePromise = startBackgroundImport(p)
      await vi.runAllTimersAsync()
      const outcome = await outcomePromise
      expect(outcome.loose?.imported).toBe(1)

      expect(seen.length).toBeGreaterThan(0)
      for (const { progress, message } of seen) {
        const match = message?.match(/^(\d+) \/ (\d+)$/)
        expect(match).not.toBeNull()
        const [, d, t] = match as RegExpMatchArray
        expect(progress).toBeCloseTo(Number(d) / Number(t))
      }
      // The last coalesced delivery before completion must be the terminal count.
      const last = seen.at(-1)
      expect(last?.message).toBe(`${total} / ${total}`)
      expect(last?.progress).toBeCloseTo(1)
    } finally {
      updateSpy.mockRestore()
    }
  })
})
