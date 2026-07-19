/**
 * Sweet Home 3D furniture-library (`.sh3f`) parser (PARITY-SH3F).
 *
 * A `.sh3f` is a ZIP holding one or more `PluginFurnitureCatalog*.properties`
 * files (Java `.properties`, indexed keys `name#1`, `model#1`, `width#1`, …)
 * plus the referenced 3D model files (OBJ/DAE/3DS…) and PNG icons. This module
 * is PURE (no DOM / no three / no store): it unzips the archive (`fflate`),
 * parses the catalog(s), and maps each entry to a normalized {@link Sh3fEntry}
 * (dimensions cm→m, category best-effort, model path + detected format). It
 * does NOT convert models — the DOM/three conversion + persistence is the
 * importer glue's job (`src/ui/openSh3fImport.ts`), so the mapping stays
 * unit-testable without a browser.
 *
 * The catalog format mirrors Sweet Home 3D's `DefaultFurnitureCatalog`
 * plugin-properties contract; only the fields we need are read, unknown keys
 * are ignored, and malformed entries degrade to `warnings` (never throw).
 */

import { unzipSync } from 'fflate'
import { categoryForPieceName } from '../../floorplan/import/sh3d'
import { type ModelFormat, modelFormatFromName } from '../convert/formats'
import type { FurnitureCategory } from '../types'

/** SH3D centimetres → our metres (matches the `.sh3d` importer). */
const CM_TO_M = 0.01

/** One parsed furniture entry from a `.sh3f` catalog, normalized to our units.
 *  Geometry-only; the importer resolves `modelPath` to bytes + converts it. */
export interface Sh3fEntry {
  /** 1-based index within its catalog file (the `#<n>` suffix). */
  index: number
  /** Catalog file the entry came from (multiple catalogs can coexist). */
  catalog: string
  /** Display name (falls back to the model basename, else `Furniture <n>`). */
  name: string
  /** Best-effort mapped catalog category (`null` when unmapped). */
  category: FurnitureCategory | null
  /** Raw SH3D category label (localized string), if any — for diagnostics. */
  rawCategory?: string
  /** Author/creator string, carried for attribution (user-supplied content). */
  creator?: string
  /** Footprint width (m). `null` when the catalog omitted/garbled it. */
  width: number | null
  /** Footprint depth (m). */
  depth: number | null
  /** Height (m). */
  height: number | null
  /** Elevation off the floor (m) — wall-mounted pieces sit above 0. */
  elevation: number
  /** SH3D `movable` flag (false = a fixed built-in like a staircase). */
  movable: boolean
  /** SH3D `doorOrWindow` flag (a wall-hosted opening model). */
  doorOrWindow: boolean
  /** Archive-relative path to the 3D model (or a per-model `.zip`), if declared. */
  modelPath: string | null
  /** True when `modelPath` points at a nested ZIP bundling the model + its
   *  textures/materials (`multiPartModel=true`). */
  multiPartModel: boolean
  /** Detected model format from the path extension; `null` = unknown/unsupported
   *  → the importer skips the entry with a warning. */
  modelFormat: ModelFormat | null
  /** Archive-relative path to the icon PNG, if declared. */
  iconPath?: string
}

/** Result of parsing a `.sh3f` archive. */
export interface Sh3fParseResult {
  /** The library display name (the archive file name, extension stripped). */
  libraryName: string
  /** Parsed catalog entries across every `PluginFurnitureCatalog*.properties`. */
  entries: Sh3fEntry[]
  /** The unzipped archive (entry name → bytes) — the importer resolves models. */
  files: Record<string, Uint8Array>
  /** Non-fatal problems (unreadable catalog line, entry missing a model, …). */
  warnings: string[]
}

/** Thrown only for unrecoverable input (not a zip / no catalog). Soft problems
 *  go to `warnings` so the import degrades gracefully. */
export class Sh3fParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'Sh3fParseError'
  }
}

/** SH3D property keys we read (each suffixed `#<index>` in the file). */
const KEYS = {
  name: 'name',
  category: 'category',
  creator: 'creator',
  model: 'model',
  multiPartModel: 'multiPartModel',
  icon: 'icon',
  width: 'width',
  depth: 'depth',
  height: 'height',
  elevation: 'elevation',
  movable: 'movable',
  doorOrWindow: 'doorOrWindow',
} as const

// --- Java .properties parsing -----------------------------------------------

/** Process a single `\`-escape sequence body (the char[s] after the backslash),
 *  returning the decoded text and how many source chars were consumed. */
function decodeEscape(src: string, i: number): { text: string; consumed: number } {
  const c = src[i]
  switch (c) {
    case 't':
      return { text: '\t', consumed: 1 }
    case 'n':
      return { text: '\n', consumed: 1 }
    case 'r':
      return { text: '\r', consumed: 1 }
    case 'f':
      return { text: '\f', consumed: 1 }
    case 'u': {
      const hex = src.slice(i + 1, i + 5)
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        return { text: String.fromCharCode(Number.parseInt(hex, 16)), consumed: 5 }
      }
      // Malformed \u — emit a literal 'u' and keep going.
      return { text: 'u', consumed: 1 }
    }
    default:
      // \\, \=, \:, \#, \!, \<space>, … → the literal character.
      return { text: c ?? '', consumed: 1 }
  }
}

/** Unescape a `.properties` key/value fragment (after logical-line assembly). */
function unescapeProp(s: string): string {
  if (!s.includes('\\')) return s
  let out = ''
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && i + 1 < s.length) {
      const { text, consumed } = decodeEscape(s, i + 1)
      out += text
      i += consumed
    } else {
      out += s[i]
    }
  }
  return out
}

/** True when a physical line ends in an ODD run of backslashes (→ continues). */
function endsWithContinuation(line: string): boolean {
  let n = 0
  for (let i = line.length - 1; i >= 0 && line[i] === '\\'; i--) n++
  return n % 2 === 1
}

/**
 * Parse Java `.properties` text into a key→value map. Handles `#`/`!` comments,
 * blank lines, `=`/`:`/whitespace separators, line continuations, and the
 * standard escape set (incl. `\uXXXX`). Keys retain their `#index` suffix.
 */
export function parseJavaProperties(text: string): Map<string, string> {
  const out = new Map<string, string>()
  // Normalize line endings, then assemble logical lines across continuations.
  const physical = text.replace(/\r\n?/g, '\n').split('\n')
  const logical: string[] = []
  for (let i = 0; i < physical.length; i++) {
    let line = physical[i]!
    const stripped = line.replace(/^[ \t\f]+/, '')
    // Blank or comment (only at the START of a logical line).
    if (stripped === '' || stripped[0] === '#' || stripped[0] === '!') continue
    line = stripped
    while (endsWithContinuation(line) && i + 1 < physical.length) {
      // Drop the trailing backslash; append the next line sans leading blanks.
      line = line.slice(0, -1) + physical[++i]!.replace(/^[ \t\f]+/, '')
    }
    logical.push(line)
  }

  for (const line of logical) {
    // Find the first UNESCAPED separator: '=' , ':' , or whitespace.
    let sepIdx = -1
    let sepIsWs = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!
      if (ch === '\\') {
        i++
        continue
      }
      if (ch === '=' || ch === ':') {
        sepIdx = i
        break
      }
      if (ch === ' ' || ch === '\t' || ch === '\f') {
        sepIdx = i
        sepIsWs = true
        break
      }
    }
    let key: string
    let value: string
    if (sepIdx === -1) {
      key = line
      value = ''
    } else {
      key = line.slice(0, sepIdx)
      let rest = line.slice(sepIdx + 1)
      if (sepIsWs) {
        // Skip further whitespace, then an optional '='/':' + its whitespace.
        rest = rest.replace(/^[ \t\f]*/, '')
        if (rest[0] === '=' || rest[0] === ':') rest = rest.slice(1).replace(/^[ \t\f]*/, '')
      } else {
        rest = rest.replace(/^[ \t\f]*/, '')
      }
      value = rest
    }
    out.set(unescapeProp(key.trim()), unescapeProp(value))
  }
  return out
}

// --- catalog → entries ------------------------------------------------------

/** Latin-1 (ISO-8859-1) decode — the `.properties` default charset. Non-ASCII
 *  glyphs ride the `\uXXXX` escapes handled by `unescapeProp`. */
function decodeLatin1(bytes: Uint8Array): string {
  return new TextDecoder('iso-8859-1').decode(bytes)
}

/** Parse a numeric property → finite number, else `null`. */
function num(v: string | undefined): number | null {
  if (v == null || v.trim() === '') return null
  const n = Number(v.trim())
  return Number.isFinite(n) ? n : null
}

/** Parse a boolean property (`true`/`false`, case-insensitive); `def` on miss. */
function bool(v: string | undefined, def: boolean): boolean {
  if (v == null) return def
  const t = v.trim().toLowerCase()
  if (t === 'true') return true
  if (t === 'false') return false
  return def
}

/** The set of 1-based indices present in a catalog map (any `name#n`/`model#n`). */
function indicesIn(props: Map<string, string>): number[] {
  const seen = new Set<number>()
  for (const key of props.keys()) {
    const hash = key.lastIndexOf('#')
    if (hash < 0) continue
    const n = Number(key.slice(hash + 1))
    if (Number.isInteger(n) && n > 0) seen.add(n)
  }
  return Array.from(seen).sort((a, b) => a - b)
}

/** Positive metres from a cm property, or `null`. */
function cmToM(v: string | undefined): number | null {
  const n = num(v)
  return n != null && n > 0 ? n * CM_TO_M : null
}

/** Map a single index's properties to an entry (best-effort). */
function entryFromProps(props: Map<string, string>, index: number, catalog: string): Sh3fEntry {
  const get = (base: string) => props.get(`${base}#${index}`)
  const rawName = get(KEYS.name)?.trim()
  const modelPath = get(KEYS.model)?.trim() || null
  const rawCategory = get(KEYS.category)?.trim() || undefined
  const modelBase = modelPath ? (modelPath.split('/').pop() ?? '') : ''
  const name =
    rawName && rawName !== ''
      ? rawName
      : modelBase.replace(/\.[a-z0-9]+$/i, '') || `Furniture ${index}`
  // Category: try the localized category label first, then the piece name.
  const category =
    (rawCategory ? categoryForPieceName(rawCategory) : null) ?? categoryForPieceName(name)
  return {
    index,
    catalog,
    name,
    category,
    rawCategory,
    creator: get(KEYS.creator)?.trim() || undefined,
    width: cmToM(get(KEYS.width)),
    depth: cmToM(get(KEYS.depth)),
    height: cmToM(get(KEYS.height)),
    elevation: (num(get(KEYS.elevation)) ?? 0) * CM_TO_M,
    movable: bool(get(KEYS.movable), true),
    doorOrWindow: bool(get(KEYS.doorOrWindow), false),
    modelPath,
    multiPartModel: bool(get(KEYS.multiPartModel), false),
    modelFormat: modelPath ? modelFormatFromName(modelPath) : null,
    iconPath: get(KEYS.icon)?.trim() || undefined,
  }
}

/** True for a plugin furniture catalog file name (any locale variant, e.g.
 *  `PluginFurnitureCatalog.properties`, `..._en.properties`, `..._1.properties`). */
function isCatalogFile(name: string): boolean {
  const base = (name.split('/').pop() ?? name).toLowerCase()
  return base.startsWith('pluginfurniturecatalog') && base.endsWith('.properties')
}

/**
 * Parse a `.sh3f` archive into normalized entries. Throws {@link Sh3fParseError}
 * only when the input isn't a usable furniture library (not a zip / no catalog);
 * every softer problem is a `warnings` line.
 */
export function parseSh3f(bytes: Uint8Array, libraryName = 'Imported library'): Sh3fParseResult {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch (e) {
    throw new Sh3fParseError(`Not a valid .sh3f archive: ${(e as Error).message}`)
  }
  const names = Object.keys(files)
  if (names.length === 0) throw new Sh3fParseError('The .sh3f archive is empty')

  const catalogNames = names.filter(isCatalogFile).sort()
  if (catalogNames.length === 0) {
    throw new Sh3fParseError(
      'No PluginFurnitureCatalog.properties found — this .sh3f has no furniture catalog.',
    )
  }

  const warnings: string[] = []
  const entries: Sh3fEntry[] = []
  for (const catalog of catalogNames) {
    let props: Map<string, string>
    try {
      props = parseJavaProperties(decodeLatin1(files[catalog]!))
    } catch (e) {
      warnings.push(`Could not read catalog “${catalog}”: ${(e as Error).message}`)
      continue
    }
    for (const index of indicesIn(props)) {
      const entry = entryFromProps(props, index, catalog)
      if (!entry.modelPath) {
        warnings.push(`Skipped “${entry.name}” — no model file declared`)
        continue
      }
      entries.push(entry)
    }
  }

  if (entries.length === 0) {
    throw new Sh3fParseError('No furniture entries found in the .sh3f catalog(s).')
  }
  return { libraryName, entries, files, warnings }
}

/** Resolve an archive-relative model/icon path to its bytes. Tries an exact
 *  match, then a case-insensitive suffix match, then a basename match — SH3D
 *  paths sometimes carry a leading slash or a package-style prefix. */
export function resolveArchivePath(
  files: Record<string, Uint8Array>,
  path: string,
): Uint8Array | null {
  if (files[path]) return files[path]
  const want = path.replace(/^\/+/, '').toLowerCase()
  const wantBase = want.split('/').pop() ?? want
  let bySuffix: Uint8Array | null = null
  let byBase: Uint8Array | null = null
  for (const [name, bytes] of Object.entries(files)) {
    const lower = name.toLowerCase()
    if (lower === want) return bytes
    if (!bySuffix && lower.endsWith(`/${want}`)) bySuffix = bytes
    if (!byBase && (lower.split('/').pop() ?? lower) === wantBase) byBase = bytes
  }
  return bySuffix ?? byBase
}
