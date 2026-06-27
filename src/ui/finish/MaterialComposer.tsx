import { useEffect, useState } from 'react'
import {
  COMPOSE_TEXTURES,
  composeMaterialId,
  DEFAULT_COMPOSE_COLOR,
  DEFAULT_COMPOSE_PATTERN,
  parseComposedMaterialId,
  parseTintMaterialId,
  tintMaterialId,
} from '../../materials/composeMaterial'
import { proceduralThumbnailDataUrl } from '../../materials/procedural/generators'
import type { MaterialDef, ProceduralPattern } from '../../materials/types'

/**
 * Compose a finish from a **texture/pattern** + a **colour** (MAT-COMPOSE), OR
 * recolour an **existing catalog material** — including the textured CC0 / Poly
 * Haven ones (the colour multiplies their albedo). A collapsible row under each
 * surface's swatch grid: pick a source (a procedural pattern or any material in
 * this surface's catalog), pick a colour, see a live preview, Apply.
 *
 * The result is either a `compose:<pattern>:<#hex>` (synthesised procedural) or a
 * `tint:<baseId>:<#hex>` (recoloured existing) finish id — both resolved by
 * `useMaterialDef`, so no catalog entry is needed and it serialises as a string.
 */
export function MaterialComposer({
  label,
  active,
  materials,
  onApply,
}: {
  label: string
  active: string
  /** This surface's catalog materials, offered as tintable sources. */
  materials: MaterialDef[]
  onApply: (id: string) => void
}) {
  // Source is encoded as `p:<pattern>` (procedural) or `m:<materialId>` (tint an
  // existing material) so a single <select> can offer both groups.
  const seedSource = (): string => {
    const composed = parseComposedMaterialId(active)
    if (composed) return `p:${composed.pattern}`
    const tint = parseTintMaterialId(active)
    if (tint && materials.some((m) => m.id === tint.baseId)) return `m:${tint.baseId}`
    return `p:${DEFAULT_COMPOSE_PATTERN}`
  }
  const seedColor = (): string =>
    parseComposedMaterialId(active)?.color ??
    parseTintMaterialId(active)?.color ??
    DEFAULT_COMPOSE_COLOR

  const [source, setSource] = useState<string>(seedSource)
  const [color, setColor] = useState<string>(seedColor)

  // Re-seed when the active finish becomes a composed / tinted one elsewhere.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-seed only on `active` change
  useEffect(() => {
    setSource(seedSource())
    setColor(seedColor())
  }, [active])

  const isPattern = source.startsWith('p:')
  const key = source.slice(2)
  const baseMat = isPattern ? null : materials.find((m) => m.id === key)

  // Resolve the finish id + a preview swatch for the current source + colour.
  const id = isPattern
    ? composeMaterialId(key as ProceduralPattern, color)
    : tintMaterialId(key, color)
  const preview = isPattern
    ? proceduralThumbnailDataUrl(id, key as ProceduralPattern, color)
    : baseMat?.kind === 'procedural'
      ? proceduralThumbnailDataUrl(id, baseMat.pattern, color)
      : undefined
  const isActive = active === id

  return (
    <details className="compose">
      <summary className="compose-summary">Compose your own…</summary>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s-2)',
          marginTop: 'var(--s-2)',
        }}
      >
        <span
          className="swatch-lg"
          aria-hidden
          style={{
            width: 44,
            height: 36,
            flex: '0 0 auto',
            backgroundImage: preview ? `url("${preview}")` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundColor: color,
          }}
        />
        <select
          className="input"
          style={{ flex: 1, minWidth: 0 }}
          aria-label={`${label} texture or material`}
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          <optgroup label="Textures">
            {COMPOSE_TEXTURES.map((t) => (
              <option key={t.pattern} value={`p:${t.pattern}`}>
                {t.label}
              </option>
            ))}
          </optgroup>
          {materials.length > 0 ? (
            <optgroup label="Tint a material">
              {materials.map((m) => (
                <option key={m.id} value={`m:${m.id}`}>
                  {m.name}
                </option>
              ))}
            </optgroup>
          ) : null}
        </select>
        <label
          className="swatch-lg"
          title="Colour"
          style={{
            width: 36,
            height: 36,
            flex: '0 0 auto',
            position: 'relative',
            cursor: 'pointer',
            background: color,
          }}
        >
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#cccccc'}
            onChange={(e) => setColor(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={`${label} colour`}
          />
        </label>
      </div>
      <button
        type="button"
        className="btn btn-soft btn-block"
        style={{ marginTop: 'var(--s-2)' }}
        onClick={() => onApply(id)}
        disabled={isActive}
        aria-label={`Apply composed ${label.toLowerCase()} finish`}
      >
        {isActive ? 'Applied' : 'Apply composed finish'}
      </button>
    </details>
  )
}
