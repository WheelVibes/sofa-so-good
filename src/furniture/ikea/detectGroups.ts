import { isModelFile } from '../upload/bulkImport'
import { looksLikeIkeaMetadata } from './metadata'

/** One detected IKEA group: its parsed metadata plus the folder prefix that
 *  scopes its files (`''` for a top-level metadata.json). */
export interface DetectedGroup {
  dir: string
  meta: Record<string, unknown>
}

function pathOf(f: File): string {
  return (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name
}

/** The directory prefix (including trailing slash) of a file path; '' if none. */
function dirOf(path: string): string {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i + 1)
}

/** Find every `metadata.json` among the picked files that looks like an IKEA
 *  group, scoped to the folder it lives in. A folder of several groups yields
 *  one DetectedGroup per group. */
export async function detectGroups(
  files: File[],
  onProgress?: (parsed: number, totalMetadata: number) => void,
): Promise<DetectedGroup[]> {
  const groups: DetectedGroup[] = []
  // Pre-count metadata.json candidates so progress has a denominator (parsing
  // each — read + JSON.parse — is the cost; non-metadata files are skipped free).
  const metaFiles = files.filter((f) => {
    const path = pathOf(f)
    return (path.split('/').pop() ?? f.name).toLowerCase() === 'metadata.json'
  })
  onProgress?.(0, metaFiles.length)
  let parsed = 0
  for (const f of metaFiles) {
    try {
      const json = JSON.parse(await f.text())
      if (looksLikeIkeaMetadata(json))
        groups.push({ dir: dirOf(pathOf(f)), meta: json as Record<string, unknown> })
    } catch {
      // ignore unparseable metadata.json
    }
    onProgress?.(++parsed, metaFiles.length)
  }
  return groups
}

/** Files whose path is within `dir` (its own folder). An empty `dir` matches
 *  every file (top-level group). Scoping by path — not basename — keeps
 *  same-named files (e.g. white.glb) from leaking across sibling groups. */
export function filesUnder(files: File[], dir: string): File[] {
  if (dir === '') return files
  return files.filter((f) => pathOf(f).startsWith(dir))
}

/** Model files not belonging to any detected group — imported via the bulk path. */
export function looseModelFiles(files: File[], groups: DetectedGroup[]): File[] {
  return files.filter((f) => {
    const path = pathOf(f)
    if (!isModelFile(path)) return false
    return !groups.some((g) => g.dir !== '' && path.startsWith(g.dir))
  })
}
