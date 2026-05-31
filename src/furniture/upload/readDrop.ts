/** Read files out of a drag-and-drop `DataTransfer`, recursing into any dropped
 *  directories via the (non-standard but widely supported) entries API so a
 *  whole folder tree comes through with its relative paths preserved on each
 *  File's `webkitRelativePath`. Falls back to `DataTransfer.files` (loose files
 *  only) when the entries API is unavailable. */
export async function readDroppedItems(dt: DataTransfer): Promise<File[]> {
  const items = Array.from(dt.items ?? [])
  const getEntry = (it: DataTransferItem): FileSystemEntry | null =>
    typeof (it as DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntry | null })
      .webkitGetAsEntry === 'function'
      ? (
          it as DataTransferItem & { webkitGetAsEntry: () => FileSystemEntry | null }
        ).webkitGetAsEntry()
      : null

  const entries = items.map(getEntry).filter((e): e is FileSystemEntry => e != null)
  if (entries.length === 0) return Array.from(dt.files ?? [])

  const out: File[] = []
  for (const entry of entries) await walkEntry(entry, out)
  return out
}

async function walkEntry(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await fileFromEntry(entry as FileSystemFileEntry)
    // Preserve the full drop path so IKEA group detection sees folder structure.
    if (!('webkitRelativePath' in file) || !file.webkitRelativePath)
      Object.defineProperty(file, 'webkitRelativePath', {
        value: entry.fullPath.replace(/^\//, ''),
        configurable: true,
      })
    out.push(file)
    return
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    // readEntries returns at most a batch per call; loop until it's empty.
    for (;;) {
      const batch = await readEntries(reader)
      if (batch.length === 0) break
      for (const child of batch) await walkEntry(child, out)
    }
  }
}

function fileFromEntry(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

function readEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject))
}
