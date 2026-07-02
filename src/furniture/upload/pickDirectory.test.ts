import { afterEach, describe, expect, it, vi } from 'vitest'
import { DIR_READ_CONCURRENCY, pickDirectoryFiles, supportsDirectoryPicker } from './pickDirectory'

// Fakes for the File System Access API handle tree.
// biome-ignore lint/suspicious/noExplicitAny: minimal fakes for the FSA handle shape
function fileHandle(name: string, bytes = 4, getFile?: () => Promise<File>): any {
  return {
    kind: 'file' as const,
    name,
    getFile: getFile ?? (async () => new File([new Uint8Array(bytes)], name)),
  }
}
// biome-ignore lint/suspicious/noExplicitAny: minimal fakes for the FSA handle shape
function dirHandle(name: string, children: any[]): any {
  return {
    kind: 'directory' as const,
    name,
    async *entries() {
      // biome-ignore lint/suspicious/noExplicitAny: fake entry tuples
      for (const c of children) yield [c.name, c] as [string, any]
    },
  }
}
// biome-ignore lint/suspicious/noExplicitAny: fake root handle
function stubPicker(root: any) {
  vi.stubGlobal('window', { showDirectoryPicker: async () => root })
}

afterEach(() => vi.unstubAllGlobals())

describe('supportsDirectoryPicker', () => {
  it('true when window.showDirectoryPicker exists', () => {
    vi.stubGlobal('window', { showDirectoryPicker: () => {} })
    expect(supportsDirectoryPicker()).toBe(true)
  })
  it('false when absent', () => {
    vi.stubGlobal('window', {})
    expect(supportsDirectoryPicker()).toBe(false)
  })
})

describe('pickDirectoryFiles', () => {
  it('recurses the picked tree, preserving relative paths', async () => {
    stubPicker(
      dirHandle('root', [
        dirHandle('malm', [fileHandle('white.glb'), fileHandle('metadata.json')]),
        fileHandle('loose.glb'),
      ]),
    )
    const files = await pickDirectoryFiles()
    const paths = (files ?? [])
      .map((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath)
      .sort()
    expect(paths).toEqual(['loose.glb', 'malm/metadata.json', 'malm/white.glb'])
  })

  it('reports progress once per file ending at the total', async () => {
    const kids = Array.from({ length: 30 }, (_, i) => fileHandle(`f${i}.glb`))
    stubPicker(dirHandle('root', [dirHandle('big', kids)]))
    const seen: number[] = []
    const files = await pickDirectoryFiles((n) => seen.push(n))
    expect(files).toHaveLength(30)
    expect(seen).toHaveLength(30)
    expect(Math.max(...seen)).toBe(30)
  })

  it('returns null when the user cancels (AbortError)', async () => {
    vi.stubGlobal('window', {
      showDirectoryPicker: async () => {
        throw new DOMException('cancelled', 'AbortError')
      },
    })
    expect(await pickDirectoryFiles()).toBeNull()
  })

  it('propagates non-abort errors', async () => {
    vi.stubGlobal('window', {
      showDirectoryPicker: async () => {
        throw new DOMException('blocked', 'SecurityError')
      },
    })
    await expect(pickDirectoryFiles()).rejects.toThrow('blocked')
  })

  it('bounds concurrency — never more than the cap of reads in flight', async () => {
    let inFlight = 0
    let maxInFlight = 0
    const slow = (name: string) =>
      fileHandle(name, 4, () => {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        return Promise.resolve()
          .then(() => Promise.resolve())
          .then(() => {
            inFlight--
            return new File([new Uint8Array(2)], name)
          })
      })
    const kids = Array.from({ length: 100 }, (_, i) => slow(`f${i}.glb`))
    stubPicker(dirHandle('root', [dirHandle('big', kids)]))
    const files = await pickDirectoryFiles()
    expect(files).toHaveLength(100)
    expect(maxInFlight).toBeGreaterThan(1)
    expect(maxInFlight).toBeLessThanOrEqual(DIR_READ_CONCURRENCY)
  })
})
