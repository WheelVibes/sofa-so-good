import type { MaterialSidecar } from './sidecar'

// Drop-folder material auto-detection.
//
// When a material folder has no `material.json` sidecar, we infer the PBR
// channel map from the texture filenames using the common Poly Haven /
// ambientCG naming conventions, so a bare download folder ("just drop it in")
// works with zero hand-authored metadata.
//
// The runtime material system (src/materials/cache.ts) binds seven channels:
// albedo (map), normal (normalMap), roughness (roughnessMap), AO (aoMap),
// metalness (metalnessMap), opacity (alphaMap, alpha-tested) and displacement
// — the last NOT as three's vertex-displacing `displacementMap` but as the
// height field the parallax-occlusion floor path ray-marches (`pomFloor.ts`).
// A combined-ARM (AO/Roughness/Metalness in RGB) file is still only recognised
// so it can be reported as ignored: splitting its channels would need a raster
// pass this pure filename-level module deliberately does not do.

/** Web-usable raster extensions the runtime can load. EXR/TIFF/HDR sources
 *  (common for Poly Haven displacement/normal) are intentionally excluded —
 *  the browser can't sample them. */
const IMAGE_EXT_RE = /\.(png|jpe?g|webp)$/i

/** Channels the runtime actually binds. */
export type SupportedChannel = 'albedo' | 'normal' | 'rough' | 'ao' | 'metal' | 'opacity' | 'height'

interface ChannelSpec {
  channel: SupportedChannel
  /** Marker tokens (lowercased) that identify this channel. Matched against the
   *  normalised token set of a filename (camelCase split, separators → spaces). */
  tokens: string[]
}

// Ordered by specificity/priority: the first spec whose tokens intersect a
// file's token set claims it. AO before roughness so "AmbientOcclusion" (which
// contains no roughness marker) and roughness stay distinct; normal early so a
// "_nor_gl" file isn't caught by a stray short token elsewhere.
const CHANNEL_SPECS: ChannelSpec[] = [
  {
    channel: 'albedo',
    tokens: ['diff', 'diffuse', 'albedo', 'basecolor', 'base', 'col', 'color', 'colour'],
  },
  { channel: 'normal', tokens: ['nor', 'normal', 'nrm', 'norm'] },
  { channel: 'ao', tokens: ['ao', 'occlusion', 'occ'] },
  { channel: 'rough', tokens: ['rough', 'roughness', 'rgh'] },
  // 'metal'/'metallic'/'metalness' — NOT bare 'met', which collides with
  // unrelated words often present in a scan's filename.
  { channel: 'metal', tokens: ['metal', 'metallic', 'metalness'] },
  { channel: 'opacity', tokens: ['opacity', 'alpha', 'transparency'] },
  { channel: 'height', tokens: ['disp', 'displacement', 'height', 'bump', 'depth'] },
]

// Recognised-but-unsupported channels: detected only so we can log them as
// ignored (the runtime has no slot for them) instead of misclassifying.
const UNSUPPORTED_SPECS: { channel: string; tokens: string[] }[] = [
  { channel: 'arm', tokens: ['arm'] }, // combined AO/Roughness/Metalness (ORM-style)
]

/** Resolution tokens (Poly Haven `_2k`, ambientCG `_1K`) and format hints we
 *  strip before matching so they never masquerade as a channel token. */
const NOISE_TOKEN_RE = /^(\d+k|\d+|jpg|jpeg|png|webp|exr|tif|tiff|hdr)$/i

/** Normalise a filename into a lowercased token set: split camelCase
 *  ("NormalGL" → normal, gl), split on separators and digit↔letter boundaries,
 *  drop the extension and resolution/format noise. */
function tokenize(filename: string): string[] {
  const base = filename.replace(IMAGE_EXT_RE, '').replace(/\.[^.]*$/, '')
  const spaced = base
    // camelCase / PascalCase boundary: aA → a A
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    // digit → uppercase letter boundary: 1K → 1 K
    .replace(/([0-9])([A-Z])/g, '$1 $2')
    // acronym → word boundary: GLNormal → GL Normal
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
  return spaced
    .split(/[^a-zA-Z0-9]+/)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 0 && !NOISE_TOKEN_RE.test(t))
}

function classifyFile(filename: string): { supported?: SupportedChannel; unsupported?: string } {
  const tokens = new Set(tokenize(filename))
  for (const spec of CHANNEL_SPECS) {
    if (spec.tokens.some((t) => tokens.has(t))) return { supported: spec.channel }
  }
  for (const spec of UNSUPPORTED_SPECS) {
    if (spec.tokens.some((t) => tokens.has(t))) return { unsupported: spec.channel }
  }
  return {}
}

/** Prefer OpenGL-convention normal maps (`_nor_gl` / `NormalGL`) over DirectX
 *  (`_nor_dx` / `NormalDX`) — three.js expects the GL convention. */
function isGlNormal(filename: string): boolean {
  return tokenize(filename).includes('gl')
}
function isDxNormal(filename: string): boolean {
  return tokenize(filename).includes('dx')
}

export interface DetectedChannels {
  channels: {
    albedo?: string
    normal?: string
    rough?: string
    ao?: string
    metal?: string
    opacity?: string
    height?: string
  }
  /** Human-readable notes (ambiguous picks, ignored maps, missing albedo). */
  warnings: string[]
  /** Recognised files the runtime can't use (combined ARM/ORM packs). */
  ignored: { file: string; channel: string }[]
}

/**
 * Infer a PBR channel map from a flat list of texture filenames. Pure and
 * deterministic: given the same filenames it always picks the same file for
 * each channel (candidates are sorted, GL normals win over DX, and any
 * runner-up is reported as a warning). Only web-usable raster files are
 * considered; everything else is ignored.
 */
export function detectMaterialChannels(files: string[]): DetectedChannels {
  const images = files.filter((f) => IMAGE_EXT_RE.test(f)).sort()
  const buckets = new Map<SupportedChannel, string[]>()
  const ignored: { file: string; channel: string }[] = []
  const warnings: string[] = []

  for (const file of images) {
    const { supported, unsupported } = classifyFile(file)
    if (supported) {
      const list = buckets.get(supported) ?? []
      list.push(file)
      buckets.set(supported, list)
    } else if (unsupported) {
      ignored.push({ file, channel: unsupported })
    }
  }

  const channels: DetectedChannels['channels'] = {}
  for (const channel of [
    'albedo',
    'normal',
    'rough',
    'ao',
    'metal',
    'opacity',
    'height',
  ] as const) {
    const candidates = buckets.get(channel)
    if (!candidates || candidates.length === 0) continue
    let pick = candidates[0]
    if (channel === 'normal' && candidates.length > 1) {
      // Prefer a GL normal; if none, prefer a non-DX one; else first sorted.
      pick = candidates.find(isGlNormal) ?? candidates.find((c) => !isDxNormal(c)) ?? candidates[0]
    }
    if (candidates.length > 1) {
      const discarded = candidates.filter((c) => c !== pick)
      warnings.push(
        `multiple ${channel} candidates [${candidates.join(', ')}] — using "${pick}", ignoring ${discarded.map((d) => `"${d}"`).join(', ')}`,
      )
    }
    channels[channel] = pick
  }

  if (!channels.albedo) {
    warnings.push('no albedo/diffuse/color texture found — cannot build a material')
  }

  return { channels, warnings, ignored }
}

function titleCase(slug: string): string {
  return slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join(' ')
}

/** Infer floor vs wall from the folder name (our convention: `floor-*` /
 *  `wall-*`); default to floor. */
function inferCategory(folderName: string): MaterialSidecar['category'] {
  return /(^|[-_])wall([-_]|$)/i.test(folderName) ? 'wall' : 'floor'
}

/**
 * Build a full `MaterialSidecar` for a sidecar-less drop folder from its folder
 * name + contained filenames. Returns `null` (with the reason in `warnings`) if
 * no albedo channel could be identified — a material with no base colour is not
 * useful. `id` is the folder name; metadata defaults are conservative (CC0, no
 * attribution, 1:1 UV scale) since none is available without a sidecar.
 */
export function inferMaterialSidecar(
  folderName: string,
  files: string[],
): { sidecar: MaterialSidecar | null; detection: DetectedChannels } {
  const detection = detectMaterialChannels(files)
  if (!detection.channels.albedo) return { sidecar: null, detection }
  const sidecar: MaterialSidecar = {
    id: folderName,
    name: titleCase(folderName),
    category: inferCategory(folderName),
    uvScale: [1, 1],
    channels: {
      albedo: detection.channels.albedo,
      ...(detection.channels.normal ? { normal: detection.channels.normal } : {}),
      ...(detection.channels.rough ? { rough: detection.channels.rough } : {}),
      ...(detection.channels.ao ? { ao: detection.channels.ao } : {}),
    },
    license: 'CC0',
  }
  return { sidecar, detection }
}
