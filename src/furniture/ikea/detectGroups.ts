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

/** Max concurrent metadata.json reads (read + JSON.parse) in flight. Parsing is
 *  I/O-bound per file; reading a handful concurrently removes the serial stall on
 *  a folder of thousands of groups, bounded so it can't flood the main thread. */
const DETECT_CONCURRENCY = 12

/** Find every `metadata.json` among the picked files that looks like an IKEA
 *  group, scoped to the folder it lives in. A folder of several groups yields
 *  one DetectedGroup per group. */
export async function detectGroups(
  files: File[],
  onProgress?: (parsed: number, totalMetadata: number) => void,
  // Fires each time a new group is found, with the groups accumulated so far
  // (same array reference each call) — lets the UI grow the list granularly
  // instead of waiting for the whole scan. Copy it (`.slice()`) before storing.
  onGroup?: (groupsSoFar: readonly DetectedGroup[]) => void,
): Promise<DetectedGroup[]> {
  const groups: DetectedGroup[] = []
  // Pre-count metadata.json candidates so progress has a denominator (parsing
  // each — read + JSON.parse — is the cost; non-metadata files are skipped free).
  const metaFiles = files.filter((f) => {
    const path = pathOf(f)
    return (path.split('/').pop() ?? f.name).toLowerCase() === 'metadata.json'
  })
  onProgress?.(0, metaFiles.length)
  // Read metadata concurrently (each read + parse is I/O-bound; a serial loop
  // stalls for seconds on a folder of thousands of groups), but COMMIT results in
  // original order via a drain cursor: `groups`, `onGroup`, and the returned list
  // stay deterministic regardless of which read finishes first. A slot is
  // `undefined` while pending; once read it holds the group or `null` (skip).
  const slots: (DetectedGroup | null | undefined)[] = new Array(metaFiles.length)
  let cursor = 0 // next metadata index to dispatch to a worker
  let commit = 0 // next index to emit in order (drain cursor)
  let parsed = 0
  const drain = () => {
    while (commit < slots.length && slots[commit] !== undefined) {
      const g = slots[commit]
      if (g) {
        groups.push(g)
        onGroup?.(groups)
      }
      commit++
    }
  }
  const worker = async (): Promise<void> => {
    while (cursor < metaFiles.length) {
      const i = cursor++
      const f = metaFiles[i]
      try {
        const json = JSON.parse(await f.text())
        slots[i] = looksLikeIkeaMetadata(json)
          ? { dir: dirOf(pathOf(f)), meta: json as Record<string, unknown> }
          : null
      } catch {
        slots[i] = null // ignore unparseable metadata.json
      }
      onProgress?.(++parsed, metaFiles.length)
      drain()
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(DETECT_CONCURRENCY, metaFiles.length) }, () => worker()),
  )
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
