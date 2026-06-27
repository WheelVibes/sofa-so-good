import { useEffect, useState } from 'react'
import {
  COMPOSE_TEXTURES,
  composeMaterialId,
  DEFAULT_COMPOSE_COLOR,
  DEFAULT_COMPOSE_PATTERN,
  parseComposedMaterialId,
} from '../../materials/composeMaterial'
import { proceduralThumbnailDataUrl } from '../../materials/procedural/generators'
import type { ProceduralPattern } from '../../materials/types'

/**
 * Compose a finish from a **texture/pattern** + a **colour** (MAT-COMPOSE).
 * A collapsible row under each surface's swatch grid: pick a texture, pick a
 * colour, see a live tiled preview, Apply. The result is a synthesised
 * `compose:<pattern>:<#hex>` finish id (resolved by `useMaterialDef`), so any
 * pattern can be paired with any colour without a catalog entry.
 */
export function MaterialComposer({
  label,
  active,
  onApply,
}: {
  label: string
  active: string
  onApply: (id: string) => void
}) {
  const seed = parseComposedMaterialId(active)
  const [pattern, setPattern] = useState<ProceduralPattern>(
    seed?.pattern ?? DEFAULT_COMPOSE_PATTERN,
  )
  const [color, setColor] = useState<string>(seed?.color ?? DEFAULT_COMPOSE_COLOR)

  // Re-seed the controls when the active finish becomes a composed one (e.g. the
  // user applied a composed finish, switched rooms, and came back).
  useEffect(() => {
    const parts = parseComposedMaterialId(active)
    if (parts) {
      setPattern(parts.pattern)
      setColor(parts.color)
    }
  }, [active])

  const id = composeMaterialId(pattern, color)
  const preview = proceduralThumbnailDataUrl(id, pattern, color)
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
            backgroundImage: `url("${preview}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundColor: color,
          }}
        />
        <select
          className="input"
          style={{ flex: 1, minWidth: 0 }}
          aria-label={`${label} texture`}
          value={pattern}
          onChange={(e) => setPattern(e.target.value as ProceduralPattern)}
        >
          {COMPOSE_TEXTURES.map((t) => (
            <option key={t.pattern} value={t.pattern}>
              {t.label}
            </option>
          ))}
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
