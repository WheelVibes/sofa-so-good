import { useEffect, useState } from 'react'
import {
  COMPOSE_SCALE_MAX,
  COMPOSE_SCALE_MIN,
  COMPOSE_TEXTURES,
  composeMaterialId,
  DEFAULT_COMPOSE_COLOR,
  DEFAULT_COMPOSE_PATTERN,
  DEFAULT_COMPOSE_SCALE,
  parseComposedMaterialId,
  parseTintMaterialId,
  tintMaterialId,
} from '../../materials/composeMaterial'
import { proceduralThumbnailDataUrl } from '../../materials/procedural/generators'
import type { MaterialDef, ProceduralPattern } from '../../materials/types'
import { ColorPicker } from '../controls/ColorPicker'
import { Disclosure } from '../controls/Disclosure'
import { Select } from '../controls/Select'

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
  onSave,
  savedNameOf,
}: {
  label: string
  active: string
  /** This surface's catalog materials, offered as tintable sources. */
  materials: MaterialDef[]
  onApply: (id: string) => void
  /** When provided, shows a "name + Save" row so the composed/tinted finish can
   *  be saved as a reusable named material (CUSTOMIZE-SAVE-MATERIAL). */
  onSave?: (finishId: string, name: string) => void
  /** Looks up the saved name for a finish id (so the Save button reads "Saved"/
   *  "Update" and the field pre-fills when the *current* composition is saved —
   *  this is what makes editing a saved material coherent). */
  savedNameOf?: (finishId: string) => string | undefined
}) {
  // Source is encoded as `p:<pattern>` (procedural) or `m:<materialId>` (tint an
  // existing material) so a single Select can offer both groups.
  const seedSource = (): string => {
    const composed = parseComposedMaterialId(active)
    if (composed) return `p:${composed.pattern}`
    const tint = parseTintMaterialId(active)
    if (tint && materials.some((m) => m.id === tint.baseId)) return `m:${tint.baseId}`
    // A plain catalog material picked from the grid → seed IT as the tint base,
    // so opening "Compose your own…" recolours that exact texture instead of a
    // default procedural pattern. This is what lets a user change a floor/wall's
    // colour while KEEPING its texture (bug #1).
    if (materials.some((m) => m.id === active)) return `m:${active}`
    return `p:${DEFAULT_COMPOSE_PATTERN}`
  }
  const seedColor = (): string =>
    parseComposedMaterialId(active)?.color ??
    parseTintMaterialId(active)?.color ??
    // Seeding a plain material as the base starts at white — an identity tint, so
    // its texture shows unchanged until the user actually picks a colour (bug #1).
    (materials.some((m) => m.id === active) ? '#ffffff' : DEFAULT_COMPOSE_COLOR)
  const seedScale = (): number =>
    parseComposedMaterialId(active)?.scale ??
    parseTintMaterialId(active)?.scale ??
    DEFAULT_COMPOSE_SCALE
  const seedRoughness = (): number | undefined =>
    parseComposedMaterialId(active)?.roughness ?? parseTintMaterialId(active)?.roughness

  const [source, setSource] = useState<string>(seedSource)
  const [color, setColor] = useState<string>(seedColor)
  const [scale, setScale] = useState<number>(seedScale)
  const [roughness, setRoughness] = useState<number | undefined>(seedRoughness)
  const [name, setName] = useState<string>('')

  // Re-seed when the active finish becomes a composed / tinted one elsewhere.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-seed only on `active` change
  useEffect(() => {
    setSource(seedSource())
    setColor(seedColor())
    setScale(seedScale())
    setRoughness(seedRoughness())
  }, [active])

  const isPattern = source.startsWith('p:')
  const key = source.slice(2)
  const baseMat = isPattern ? null : materials.find((m) => m.id === key)
  // Suggested default name from the current source (texture label or base name).
  const suggestedName = isPattern
    ? (COMPOSE_TEXTURES.find((t) => t.pattern === key)?.label ?? key)
    : (baseMat?.name ?? 'Custom material')

  // Resolve the finish id + a preview swatch for the current source + colour +
  // scale + gloss.
  const id = isPattern
    ? composeMaterialId(key as ProceduralPattern, color, scale, roughness)
    : tintMaterialId(key, color, scale, roughness)
  // Gloss slider: 0 % = matte (roughness 1), 100 % = glossy (roughness 0.05).
  // An unset roughness shows at the procedural default (0.85) but stays absent
  // from the id until the user drags it.
  const roughVal = roughness ?? 0.85
  const glossPct = Math.round(((1 - roughVal) / 0.95) * 100)
  const preview = isPattern
    ? proceduralThumbnailDataUrl(id, key as ProceduralPattern, color)
    : baseMat?.kind === 'procedural'
      ? proceduralThumbnailDataUrl(id, baseMat.pattern, color)
      : undefined
  const isActive = active === id
  // The saved name of the CURRENT composition (so editing reflects live edits).
  const savedName = savedNameOf?.(id)

  // Pre-fill the name field with the saved name when the current finish is
  // already saved; clear it (placeholder shows the suggestion) otherwise.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-seed only when the finish id / saved name changes
  useEffect(() => {
    setName(savedName ?? '')
  }, [id, savedName])

  const trimmedName = name.trim()
  const effectiveName = trimmedName || suggestedName
  const saveLabel = savedName
    ? trimmedName === savedName
      ? 'Saved ✓'
      : 'Update material'
    : 'Save material'

  return (
    <Disclosure summary="Compose your own…">
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
        <Select
          className="input"
          style={{ flex: 1, minWidth: 0 }}
          ariaLabel={`${label} texture or material`}
          value={source}
          onChange={(v) => setSource(v)}
          options={[
            { value: '__grp_textures', label: 'Textures', disabled: true },
            ...COMPOSE_TEXTURES.map((t) => ({ value: `p:${t.pattern}`, label: t.label })),
            ...(materials.length > 0
              ? [
                  { value: '__grp_tint', label: 'Tint a material', disabled: true },
                  ...materials.map((m) => ({ value: `m:${m.id}`, label: m.name })),
                ]
              : []),
          ]}
        />
        <ColorPicker
          value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : '#cccccc'}
          onChange={setColor}
          ariaLabel={`${label} colour`}
          title="Colour"
        />
      </div>
      {/* Tile-size parameter (CUSTOMIZE-MATERIAL-PARAMS): scales the pattern's
          physical repeat, so the same texture+colour can read fine or chunky. */}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s-2)',
          marginTop: 'var(--s-2)',
        }}
      >
        <span className="label" style={{ flex: '0 0 auto', fontSize: 'var(--t-2xs)' }}>
          Scale
        </span>
        <input
          type="range"
          style={{ flex: 1, minWidth: 0 }}
          min={COMPOSE_SCALE_MIN}
          max={COMPOSE_SCALE_MAX}
          step={0.05}
          value={scale}
          onChange={(e) => setScale(Number.parseFloat(e.target.value))}
          aria-label={`${label} texture scale`}
        />
        <span
          className="label"
          style={{ flex: '0 0 auto', fontSize: 'var(--t-2xs)', minWidth: 36, textAlign: 'right' }}
        >
          {scale.toFixed(2)}×
        </span>
      </label>
      {/* Gloss/sheen parameter (CUSTOMIZE-MATERIAL-PARAMS): matte → glossy via the
          material's roughness scalar, so the same finish can read flat or polished. */}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s-2)',
          marginTop: 'var(--s-2)',
        }}
      >
        <span className="label" style={{ flex: '0 0 auto', fontSize: 'var(--t-2xs)' }}>
          Gloss
        </span>
        <input
          type="range"
          style={{ flex: 1, minWidth: 0 }}
          min={0}
          max={100}
          step={5}
          value={glossPct}
          onChange={(e) =>
            setRoughness(
              Math.min(1, Math.max(0.05, 1 - (Number.parseFloat(e.target.value) / 100) * 0.95)),
            )
          }
          aria-label={`${label} gloss`}
        />
        <span
          className="label"
          style={{ flex: '0 0 auto', fontSize: 'var(--t-2xs)', minWidth: 36, textAlign: 'right' }}
        >
          {glossPct}%
        </span>
      </label>
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
      {/* Save the current composition as a named, reusable custom material
          (CUSTOMIZE-SAVE-MATERIAL) — appears in this surface's picker grid. */}
      {onSave ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s-2)',
            marginTop: 'var(--s-2)',
          }}
        >
          <input
            type="text"
            className="input"
            style={{ flex: 1, minWidth: 0 }}
            value={name}
            placeholder={`Name (e.g. ${suggestedName})`}
            onChange={(e) => setName(e.target.value)}
            aria-label={`${label} custom material name`}
          />
          <button
            type="button"
            className="btn btn-soft"
            style={{ flex: '0 0 auto' }}
            onClick={() => onSave(id, effectiveName)}
            disabled={savedName != null && trimmedName === savedName}
            aria-label={`Save composed ${label.toLowerCase()} finish as a custom material`}
          >
            {saveLabel}
          </button>
        </div>
      ) : null}
    </Disclosure>
  )
}
