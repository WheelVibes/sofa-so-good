import { beforeEach, describe, expect, it, vi } from 'vitest'
import { serialize } from '../schema'
import { useStore } from '../store'
import {
  DesignFileError,
  exportDesignToFile,
  importDesignFromFile,
  MAX_DESIGN_FILE_BYTES,
} from './designFile'

/** Minimal File polyfill for jsdom: `.text()` + an optional reported `.size`. */
function fileOf(content: string, size?: number): File {
  return { text: async () => content, size: size ?? content.length } as unknown as File
}

describe('designFile import', () => {
  beforeEach(() => {
    useStore.getState().resetToDefault()
  })

  it('round-trips the current serialized design', async () => {
    const json = JSON.stringify(serialize(useStore.getState()))
    const data = await importDesignFromFile(fileOf(json))
    expect(data.version).toBe(2)
    expect(Array.isArray(data.items)).toBe(true)
  })

  it('rejects non-JSON with a friendly error', async () => {
    await expect(importDesignFromFile(fileOf('not json {{'))).rejects.toBeInstanceOf(
      DesignFileError,
    )
  })

  it('rejects JSON that is not a design file', async () => {
    await expect(importDesignFromFile(fileOf('{"hello":"world"}'))).rejects.toBeInstanceOf(
      DesignFileError,
    )
  })

  it('rejects an oversized file before reading it', async () => {
    let read = false
    const huge = {
      size: MAX_DESIGN_FILE_BYTES + 1,
      text: async () => {
        read = true
        return '{}'
      },
    } as unknown as File
    await expect(importDesignFromFile(huge)).rejects.toBeInstanceOf(DesignFileError)
    expect(read).toBe(false) // guarded before the read
  })
})

describe('designFile export', () => {
  beforeEach(() => {
    useStore.getState().resetToDefault()
  })

  it('triggers a download with a .sofa.json filename', () => {
    const click = vi.fn()
    const created: HTMLAnchorElement[] = []
    const realCreate = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag) as HTMLElement
      if (tag === 'a') {
        ;(el as HTMLAnchorElement).click = click
        created.push(el as HTMLAnchorElement)
      }
      return el as never
    })
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:x')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

    exportDesignToFile(useStore.getState(), 'My Living Room!')
    expect(click).toHaveBeenCalledTimes(1)
    expect(created[0]?.download).toBe('My-Living-Room.sofa.json')
    vi.restoreAllMocks()
  })
})
