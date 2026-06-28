import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useFeature } from '../../features/useFeature'
import { recommendedBlends } from '../../materials/colorHarmony'
import { effectivePalette } from '../../state/slices/colorPaletteSlice'
import { useStore } from '../../state/store'

/**
 * Two swatch rows shown beneath any colour picker (CUSTOMIZE-MASTER-PALETTE):
 *  1. **Apartment theme** — the effective master palette (a room override wins).
 *  2. **Recommended** — up to 10 harmony blends derived live from that palette
 *     (`recommendedBlends`), so they update whenever the palette / override changes.
 * Clicking a swatch calls `onPick(hex)`. Renders nothing when the flag is off or
 * there's nothing to show (no palette + no blends). Pure presentation; the editor
 * for the palette itself lives in `MasterPaletteEditor`.
 */
export function ThemeColorRows({
  onPick,
  roomId,
  active,
}: {
  onPick: (hex: string) => void
  /** Room context for the override; defaults to the selected room. Pass `null`
   *  to force the apartment-wide master palette regardless of selection. */
  roomId?: string | null
  /** Currently-applied colour, highlighted if it matches a swatch. */
  active?: string
}) {
  const on = useFeature('masterPalette')
  const selectedRoomId = useStore((s) => s.selectedRoomId)
  const master = useStore(useShallow((s) => s.masterPalette))
  const roomPalettes = useStore(useShallow((s) => s.roomPalettes))
  const effRoom = roomId === undefined ? selectedRoomId : roomId
  const palette = effectivePalette(master, roomPalettes, effRoom)
  const blends = useMemo(() => recommendedBlends(palette), [palette])

  if (!on || (palette.length === 0 && blends.length === 0)) return null
  const lc = (active ?? '').toLowerCase()
  return (
    <div style={{ marginTop: 'var(--s-2)' }}>
      {palette.length > 0 ? (
        <Row label="Apartment theme" colors={palette} active={lc} onPick={onPick} />
      ) : null}
      {blends.length > 0 ? (
        <Row label="Recommended" colors={blends} active={lc} onPick={onPick} />
      ) : null}
    </div>
  )
}

function Row({
  label,
  colors,
  active,
  onPick,
}: {
  label: string
  colors: string[]
  active: string
  onPick: (hex: string) => void
}) {
  return (
    <div style={{ marginTop: 'var(--s-1)' }}>
      <div className="label" style={{ fontSize: 'var(--t-2xs)', marginBottom: 2 }}>
        {label}
      </div>
      <div className="swatches" style={{ paddingBlock: 0 }}>
        {colors.map((hex) => (
          <button
            type="button"
            key={hex}
            className={`swatch${active === hex.toLowerCase() ? ' on' : ''}`}
            style={{ backgroundColor: hex }}
            title={hex}
            aria-label={`${label} colour ${hex}`}
            onClick={() => onPick(hex)}
          />
        ))}
      </div>
    </div>
  )
}
