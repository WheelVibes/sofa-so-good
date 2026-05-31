/** Max concurrent entries-API reads (file() / readEntries()) in flight at once.
 *  The API is async-I/O-bound — each call is a separate callback round-trip — so
 *  reading siblings concurrently is a big speedup on large folders. Bounded so a
 *  folder with thousands of files can't spike memory or get throttled by the
 *  browser; the walk fans out up to this many reads, no more. */
export const READ_CONCURRENCY = 24

/** Read files out of a drag-and-drop `DataTransfer`, recursing into any dropped
 *  directories via the (non-standard but widely supported) entries API so a
 *  whole folder tree comes through with its relative paths preserved on each
 *  File's `webkitRelativePath`. Falls back to `DataTransfer.files` (loose files
 *  only) when the entries API is unavailable.
 *
 *  The `DataTransferItem` list and its entries are only valid synchronously
 *  during the drop event, so `webkitGetAsEntry()` is called up front (before any
 *  await); the captured `FileSystemEntry` objects then stay valid for the async
 *  walk. The walk runs a bounded worker pool (`READ_CONCURRENCY`) — entries are
 *  read concurrently rather than one-at-a-time, which is far faster on big
 *  folders. Collection order is therefore not preserved (consumers key off path,
 *  not position). `onProgress(count)` fires as each file is read so the UI can
 *  show the scan advancing. */
export async function readDroppedItems(
  dt: DataTransfer,
  onProgress?: (count: number) => void,
): Promise<File[]> {
  const items = Array.from(dt.items ?? [])
  const getEntry = (it: DataTransferItem): FileSystemEntry | null =>
    typeof (it as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null })
      .webkitGetAsEntry === 'function'
      ? (
          it as DataTransferItem & { webkitGetAsEntry: () => FileSystemEntry | null }
        ).webkitGetAsEntry()
      : null

  // Capture every entry synchronously — they detach once this turn yields.
  const entries = items.map(getEntry).filter((e): e is FileSystemEntry => e != null)
  if (entries.length === 0) return Array.from(dt.files ?? [])

  const out: File[] = []
  // A work queue of pending entries plus a fixed set of workers draining it.
  // Directory reads enqueue their children, so the queue grows as we descend
  // and the pool stays saturated up to READ_CONCURRENCY across the whole tree.
  const queue: FileSystemEntry[] = [...entries]
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
    while (active < READ_CONCURRENCY && queue.length > 0) {
      const entry = queue.shift()!
      active++
      void process(entry).finally(() => {
        active--
        pump()
      })
    }
  }

  const process = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      const file = await fileFromEntry(entry as FileSystemFileEntry)
      // Preserve the full drop path so IKEA group detection sees folder structure.
      if (!('webkitRelativePath' in file) || !file.webkitRelativePath)
        Object.defineProperty(file, 'webkitRelativePath', {
          value: entry.fullPath.replace(/^\//, ''),
          configurable: true,
        })
      out.push(file)
      onProgress?.(out.length)
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      // readEntries returns at most a batch (~100) per call; loop until empty,
      // enqueueing children so the pool reads them (and deeper subtrees) in
      // parallel with the rest of the tree.
      for (;;) {
        const batch = await readEntries(reader)
        if (batch.length === 0) break
        queue.push(...batch)
      }
    }
  }

  pump()
  await done
  return out
}

function fileFromEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject))
}
