import { proceduralThumbnailDataUrl } from '../../materials/procedural/generators'
import type { MaterialDef } from '../../materials/types'
import { useMaterials } from '../../materials/useMaterial'

/** Curated one-tap wood/stone finishes for furniture — the handful designers
 *  reach for most, so they don't have to scroll the full finish dropdown or
 *  browse the remote catalog. All are bundled procedural materials (ship in
 *  prod). Encoded as `mat:<id>`, the same value the dropdown produces. */
const CURATED: { id: string; label: string }[] = [
  { id: 'floor-wood-oak', label: 'Oak' },
  { id: 'floor-wood-walnut', label: 'Walnut' },
  { id: 'floor-wood-teak', label: 'Teak' },
  { id: 'floor-wood-ash', label: 'Ash' },
  { id: 'floor-wood-ebony', label: 'Ebony' },
  { id: 'floor-tile-marble', label: 'Marble' },
]

function swatchImage(m: MaterialDef): string | undefined {
  if (m.kind === 'procedural') {
    return `url("${proceduralThumbnailDataUrl(m.id, m.pattern, m.swatch)}")`
  }
  if (m.kind === 'textured') {
    return `url("${m.thumbUrl ?? m.runtimeUrls?.albedo ?? m.textures.albedo}")`
  }
  return undefined
}

/**
 * A compact swatch row of curated wood/stone finishes, shown under a furniture
 * piece's wood/surface finish dropdown. Tapping one applies it instantly
 * (`mat:<id>`); the active one is ringed. Pure presentational — the parent owns
 * the value + commit.
 */
export function QuickFinishes({
  value,
  onPick,
}: {
  value: string
  onPick: (value: string) => void
}) {
  const materials = useMaterials()
  const items = CURATED.map((c) => ({ ...c, mat: materials[c.id] })).filter(
    (c): c is typeof c & { mat: MaterialDef } => !!c.mat,
  )
  if (items.length === 0) return null
  return (
    <div className="quick-finish">
      <span className="quick-finish-h">Quick finishes</span>
      {/* biome-ignore lint/a11y/useSemanticElements: a <fieldset> needs a
          <legend> and adds default browser border/padding, changing the look
          of this compact chip row — role="group" + aria-label is the
          non-visual equivalent. */}
      <div className="quick-finish-row" role="group" aria-label="Quick finishes">
        {items.map((c) => {
          const v = `mat:${c.id}`
          const isActive = value === v
          return (
            <button
              key={c.id}
              type="button"
              className={`swatch${isActive ? ' on' : ''}`}
              title={c.label}
              aria-label={`Finish: ${c.label}`}
              aria-pressed={isActive}
              style={{ backgroundImage: swatchImage(c.mat), backgroundSize: 'cover' }}
              onClick={() => onPick(v)}
            />
          )
        })}
      </div>
    </div>
  )
}
