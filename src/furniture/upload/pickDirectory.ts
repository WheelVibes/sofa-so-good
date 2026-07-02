/** Max concurrent File System Access reads (getFile / entries) in flight at
 *  once. The walk is async-I/O-bound per entry, so reading siblings concurrently
 *  is a big speedup on large folders; bounded so a folder with thousands of files
 *  can't spike memory or open handles. Mirrors readDrop.ts's READ_CONCURRENCY. */
export const DIR_READ_CONCURRENCY = 24

/** True when the browser exposes the File System Access directory picker
 *  (Chromium). Other browsers (Firefox/Safari) return false → callers fall back
 *  to the native <input webkitdirectory>. */
export function supportsDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

// Minimal shape of the File System Access handles we touch (lib.dom types for
// these are not present in every TS target).
interface FsFileHandle {
  kind: 'file'
  name: string
  getFile(): Promise<File>
}
interface FsDirHandle {
  kind: 'directory'
  name: string
  entries(): AsyncIterableIterator<[string, FsFileHandle | FsDirHandle]>
}
type FsHandle = FsFileHandle | FsDirHandle

/** Open the FSA directory picker and read every file out of the chosen folder,
 *  recursing into subfolders. Each File gets its `webkitRelativePath` set to its
 *  path from the picked root (no leading slash) so IKEA group detection sees the
 *  folder structure — identical to the drag-drop path. Returns `null` if the user
 *  cancels the picker (AbortError). The walk runs a bounded worker pool
 *  (DIR_READ_CONCURRENCY): entries are read concurrently rather than one-at-a-time.
 *  `onProgress(count)` fires as each file is read so the UI can show the scan
 *  advancing from the first file — no native "Upload N files?" prompt. */
export async function pickDirectoryFiles(
  onProgress?: (count: number) => void,
): Promise<File[] | null> {
  let root: FsDirHandle
  try {
    root = await (
      window as unknown as { showDirectoryPicker: () => Promise<FsDirHandle> }
    ).showDirectoryPicker()
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null
    throw e
  }

  const out: File[] = []
  // A work queue of pending handles + a fixed set of workers draining it.
  // Expanding a directory enqueues its children, so the queue grows as we descend
  // and the pool stays saturated up to DIR_READ_CONCURRENCY across the whole tree.
  const queue: { handle: FsHandle; path: string }[] = [{ handle: root, path: '' }]
  let active = 0
  let drained: () => void
  const done = new Promise<void>((r) => {
    drained = r
  })

  const pump = () => {
    if (queue.length === 0 && active === 0) {
      drained()
      return
    }
    while (active < DIR_READ_CONCURRENCY && queue.length > 0) {
      const task = queue.shift()!
      active++
      void process(task).finally(() => {
        active--
        pump()
      })
    }
  }

  const process = async ({ handle, path }: { handle: FsHandle; path: string }): Promise<void> => {
    if (handle.kind === 'file') {
      const file = await handle.getFile()
      if (!('webkitRelativePath' in file) || !file.webkitRelativePath)
        Object.defineProperty(file, 'webkitRelativePath', { value: path, configurable: true })
      out.push(file)
      onProgress?.(out.length)
    } else {
      for await (const [name, child] of handle.entries()) {
        queue.push({ handle: child, path: path ? `${path}/${name}` : name })
        pump() // new work available — saturate the pool as children surface
      }
    }
  }

  pump()
  await done
  return out
}
