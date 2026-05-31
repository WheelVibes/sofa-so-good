import { looksLikeIkeaMetadata } from './metadata'

/** Find and parse a metadata.json among the picked files that looks like an IKEA
 *  group. Returns the raw parsed JSON (for parseMetadata) or null. */
export async function findMetadataFile(files: File[]): Promise<Record<string, unknown> | null> {
  for (const f of files) {
    const path = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
    const base = path.split('/').pop() ?? f.name
    if (base.toLowerCase() !== 'metadata.json') continue
    try {
      const json = JSON.parse(await f.text())
      if (looksLikeIkeaMetadata(json)) return json as Record<string, unknown>
    } catch {
      // ignore unparseable metadata.json
    }
  }
  return null
}
