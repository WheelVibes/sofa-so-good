import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `runConvert` (the convert pool's main-thread entry point) needs a fresh
 * module per test since the pool is module-level mutable state (same reason
 * `runOptimize.pool.test.ts` does `vi.resetModules()`). Two groups:
 *
 * - No `Worker` global (the default here, matching the real Node/happy-dom
 *   test environment production code runs under, per `runOptimize`'s own
 *   precedent) → `runConvert` always takes the direct-call fallback, which we
 *   verify by spying on `convertModel` (a REAL round-trip through the actual
 *   three.js loaders needs a real browser — three's loaders fetch the sibling
 *   pool via `blob:` URLs, which jsdom/happy-dom cannot resolve
 *   ("URL scheme 'blob' is not supported"); this is the same limitation
 *   `convertModel.test.ts` already documents and skips its own round-trip
 *   test for. The real end-to-end proof is the browser scenario in
 *   `docs/visual-verification-playbook.md`, driving the actual pooled Worker.
 * - A mock `Worker` (`vi.stubGlobal('Worker', FakeWorker)`) → drives the
 *   pool's success/expected-error/unexpected-error branches directly.
 */

vi.mock('./convertModel', async () => {
  const actual = await vi.importActual<typeof import('./convertModel')>('./convertModel')
  return { ...actual, convertModel: vi.fn() }
})

interface PostedMsg {
  id: number
  entry: File
  siblings: File[]
}

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage: ((e: { data: unknown }) => void) | null = null
  onerror: ((e: unknown) => void) | null = null
  onmessageerror: ((e: unknown) => void) | null = null
  posted: PostedMsg[] = []
  terminated = false

  constructor(_url: unknown, _opts?: unknown) {
    FakeWorker.instances.push(this)
  }

  postMessage(msg: PostedMsg): void {
    this.posted.push(msg)
  }

  terminate(): void {
    this.terminated = true
  }

  replyOk(id: number, name = 'chair.glb', format = 'obj'): void {
    this.onmessage?.({
      data: { id, ok: true, buffer: new ArrayBuffer(4), format, name },
    })
  }

  replyErr(id: number, error: string, expected: boolean): void {
    this.onmessage?.({ data: { id, ok: false, error, expected } })
  }
}

async function freshModule() {
  vi.resetModules()
  return import('./runConvert')
}

beforeEach(() => {
  FakeWorker.instances = []
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('runConvert — no Worker available (default test environment)', () => {
  it('falls back to a direct convertModel call and reports usedWorker:false', async () => {
    const { convertModel } = await import('./convertModel')
    const entry = new File(['x'], 'chair.obj')
    const glb = new File([new Uint8Array([1, 2, 3])], 'chair.glb', { type: 'model/gltf-binary' })
    vi.mocked(convertModel).mockResolvedValue({ glb, format: 'obj' })

    const { runConvert } = await freshModule()
    const result = await runConvert(entry, [])
    expect(convertModel).toHaveBeenCalledWith(entry, [])
    expect(result.usedWorker).toBe(false)
    expect(result.format).toBe('obj')
    expect(result.glb).toBe(glb)
  })

  it('propagates a genuine convertModel failure (e.g. unsupported format) from the fallback', async () => {
    const { convertModel, ConvertError } = await import('./convertModel')
    vi.mocked(convertModel).mockRejectedValue(new ConvertError('nope'))

    const { runConvert } = await freshModule()
    await expect(runConvert(new File(['x'], 'x.mtl'), [])).rejects.toThrow('nope')
  })
})

describe('runConvert — mock Worker pool', () => {
  beforeEach(() => {
    vi.stubGlobal('Worker', FakeWorker)
    vi.stubGlobal('navigator', { hardwareConcurrency: 3 })
  })

  it('returns the worker result with usedWorker:true on success', async () => {
    const { runConvert } = await freshModule()
    const entry = new File(['x'], 'chair.obj')
    const p = runConvert(entry, [])
    expect(FakeWorker.instances).toHaveLength(1)
    const w = FakeWorker.instances[0]
    expect(w.posted[0].entry).toBe(entry)
    w.replyOk(w.posted[0].id, 'chair.glb', 'obj')

    const result = await p
    expect(result.usedWorker).toBe(true)
    expect(result.format).toBe('obj')
    expect(result.glb.name).toBe('chair.glb')
  })

  it('throws (no main-thread retry) when the worker reports an EXPECTED ConvertError', async () => {
    const { convertModel } = await import('./convertModel')
    const { runConvert } = await freshModule()
    const p = runConvert(new File(['x'], 'huge.obj'), [])
    const w = FakeWorker.instances[0]
    w.replyErr(w.posted[0].id, 'too large', true)

    await expect(p).rejects.toThrow('too large')
    expect(convertModel).not.toHaveBeenCalled()
  })

  it('falls back to the main thread when the worker reports an UNEXPECTED failure', async () => {
    const { convertModel } = await import('./convertModel')
    const glb = new File([new Uint8Array([1])], 'chair.glb', { type: 'model/gltf-binary' })
    vi.mocked(convertModel).mockResolvedValue({ glb, format: 'obj' })

    const { runConvert } = await freshModule()
    const entry = new File(['x'], 'chair.obj')
    const p = runConvert(entry, [])
    const w = FakeWorker.instances[0]
    w.replyErr(w.posted[0].id, 'boom', false)

    const result = await p
    expect(convertModel).toHaveBeenCalledWith(entry, [])
    expect(result.usedWorker).toBe(false)
    expect(result.glb).toBe(glb)
  })

  it('falls back to the main thread when the worker crashes mid-task', async () => {
    const { convertModel } = await import('./convertModel')
    const glb = new File([new Uint8Array([1])], 'chair.glb', { type: 'model/gltf-binary' })
    vi.mocked(convertModel).mockResolvedValue({ glb, format: 'obj' })

    const { runConvert } = await freshModule()
    const entry = new File(['x'], 'chair.obj')
    const p = runConvert(entry, [])
    const w = FakeWorker.instances[0]
    w.onerror?.(new Event('error'))

    const result = await p
    expect(result.usedWorker).toBe(false)
    expect(result.glb).toBe(glb)
    expect(w.terminated).toBe(true)
  })
})
