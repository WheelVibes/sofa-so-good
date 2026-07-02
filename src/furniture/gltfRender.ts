import { isIkeaDef } from './catalog'
import type { FurnitureItem, GltfDef } from './types'

export interface GltfRender {
  url: string
  /** Uniform scale (back-compat / base). */
  scale: number
  /** Per-axis scale [x(width), y(height), z(depth)] — non-uniform resize
   *  (SweetHome3DJS parity). Each axis falls back to the uniform `scale`. */
  scale3: [number, number, number]
  tint?: string
  finishOverrides?: Record<string, string>
  /** Per-instance: make the model's largest flat surface a real mirror
   *  (High/Maximum tiers only). Set from the inspector on uploaded models. */
  reflective?: boolean
}

/** Resolve which URL + per-component overrides a GLTF item should render with.
 *  Returns null when no URL is resolvable (e.g. unhydrated). */
export function selectGltfRender(item: FurnitureItem, def: GltfDef): GltfRender | null {
  const scale = (typeof item.props['scale'] === 'number' ? item.props['scale'] : def.scale) ?? 1
  const ax = (k: string) => (typeof item.props[k] === 'number' ? (item.props[k] as number) : scale)
  const scale3: [number, number, number] = [ax('scaleX'), ax('scaleY'), ax('scaleZ')]
  const tint = typeof item.props['tint'] === 'string' ? item.props['tint'] : undefined
  const reflective = item.props['reflective'] === 1

  // Per-part colour overrides typed in the inspector, keyed `finish:<material>`.
  // A blank value is a "clear" and must be dropped before it reaches
  // `new Color()` (which would silently paint the part black). Applies to every
  // GLB kind — IKEA variants, built-ins, and user uploads alike.
  const itemOverrides: Record<string, string> = {}
  for (const [k, val] of Object.entries(item.props)) {
    if (k.startsWith('finish:') && typeof val === 'string' && val.trim() !== '')
      itemOverrides[k.slice('finish:'.length)] = val
  }

  if (isIkeaDef(def)) {
    const wanted =
      typeof item.props['variant'] === 'string' ? item.props['variant'] : def.activeVariant
    const byWanted = def.variants.find((v) => v.finish === wanted && v.runtimeUrl)
    const active =
      byWanted ??
      def.variants.find((v) => v.finish === def.activeVariant && v.runtimeUrl) ??
      def.variants.find((v) => v.runtimeUrl)
    if (!active?.runtimeUrl) return null
    return {
      url: active.runtimeUrl,
      scale,
      scale3,
      tint,
      finishOverrides: Object.keys(itemOverrides).length ? itemOverrides : undefined,
      reflective,
    }
  }

  // `builtin` + dev-only `local` defs carry a plain `url`; the rest resolve a
  // runtime blob/object URL.
  const url = def.source === 'builtin' || def.source === 'local' ? def.url : def.runtimeUrl
  if (!url) return null
  // Merge the def's baked-in overrides (if any) with the per-item picks; the
  // item's choices win.
  const defOverrides = 'finishOverrides' in def ? def.finishOverrides : undefined
  const merged = { ...(defOverrides ?? {}), ...itemOverrides }
  return {
    url,
    scale,
    scale3,
    tint,
    finishOverrides: Object.keys(merged).length ? merged : undefined,
    reflective,
  }
}
