import { describe, expect, it } from 'vitest'
import { readDroppedItems } from './readDrop'

// Minimal fakes for the (non-standard) HTML5 entries API.
function fileEntry(fullPath: string, bytes = 4): FileSystemFileEntry {
  const name = fullPath.split('/').pop() ?? fullPath
  return {
    isFile: true,
    isDirectory: false,
    name,
    fullPath,
    file: (cb: (f: File) => void) => cb(new File([new Uint8Array(bytes)], name)),
  } as unknown as FileSystemFileEntry
}

function dirEntry(fullPath: string, children: FileSystemEntry[]): FileSystemDirectoryEntry {
  const name = fullPath.split('/').pop() ?? fullPath
  return {
    isFile: false,
    isDirectory: true,
    name,
    fullPath,
    createReader: () => {
      let served = false
      return {
        // readEntries yields the batch once, then an empty array (end of dir).
        readEntries: (cb: (e: FileSystemEntry[]) => void) => {
          cb(served ? [] : children)
          served = true
        },
      } as FileSystemDirectoryReader
    },
  } as unknown as FileSystemDirectoryEntry
}

function dataTransfer(entries: FileSystemEntry[]): DataTransfer {
  return {
    items: entries.map((entry) => ({ webkitGetAsEntry: () => entry })),
    files: [],
  } as unknown as DataTransfer
}

describe('readDroppedItems', () => {
  it('recurses a dropped folder, preserving relative paths', async () => {
    const dt = dataTransfer([
      dirEntry('/malm', [fileEntry('/malm/white.glb'), fileEntry('/malm/metadata.json')]),
    ])
    const files = await readDroppedItems(dt)
    const paths = files
      .map((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath)
      .sort()
    expect(paths).toEqual(['malm/metadata.json', 'malm/white.glb'])
  })

  it('recurses nested folders of multiple groups', async () => {
    const dt = dataTransfer([
      dirEntry('/catalog', [
        dirEntry('/catalog/malm', [fileEntry('/catalog/malm/white.glb')]),
        dirEntry('/catalog/billy', [fileEntry('/catalog/billy/white.glb')]),
      ]),
    ])
    const files = await readDroppedItems(dt)
    const paths = files
      .map((f) => (f as File & { webkitRelativePath?: string }).webkitRelativePath)
      .sort()
    expect(paths).toEqual(['catalog/billy/white.glb', 'catalog/malm/white.glb'])
  })

  it('handles loose dropped files', async () => {
    const dt = dataTransfer([fileEntry('/chair.glb')])
    const files = await readDroppedItems(dt)
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('chair.glb')
  })

  it('falls back to dt.files when the entries API is unavailable', async () => {
    const dt = {
      items: [{ webkitGetAsEntry: undefined }],
      files: [new File([new Uint8Array(4)], 'loose.glb')],
    } as unknown as DataTransfer
    const files = await readDroppedItems(dt)
    expect(files.map((f) => f.name)).toEqual(['loose.glb'])
  })
})
