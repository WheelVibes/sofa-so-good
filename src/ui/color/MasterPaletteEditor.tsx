import { useFeature } from '../../features/useFeature'
import { recommendedBlends } from '../../materials/colorHarmony'
import { effectivePalette, MAX_PALETTE_COLORS } from '../../state/slices/colorPaletteSlice'
import { useStore } from '../../state/store'
import { ColorPicker } from '../controls/ColorPicker'
import { Icon } from '../toolbar/icons'

/**
 * Editor for the apartment master colour palette + an optional per-room override
 * (CUSTOMIZE-MASTER-PALETTE). Up to 5 colours; a live "Recommended" preview shows
 * the harmony blends that every colour picker will offer. When `roomId` is given,
 * a checkbox lets the room override the master palette (seeded from it).
 */
export function MasterPaletteEditor({ roomId }: { roomId?: string | null }) {
  const on = useFeature('masterPalette')
  const master = useStore((s) => s.masterPalette)
  const roomPalettes = useStore((s) => s.roomPalettes)
  const setMasterPalette = useStore((s) => s.setMasterPalette)
  const setRoomPalette = useStore((s) => s.setRoomPalette)
  if (!on) return null

  const override = roomId ? roomPalettes[roomId] : undefined
  const hasOverride = !!override && override.length > 0

  return (
    <div className="space-y-2">
      <PaletteSlots label="Apartment palette" palette={master} onChange={setMasterPalette} />
      {roomId ? (
        <div>
          <label
            className="text-xs"
            style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}
          >
            <input
              type="checkbox"
              checked={hasOverride}
              onChange={(e) => {
                // On → seed the override from the current master (or a default);
                // off → clear it so the room inherits the apartment palette.
                if (e.target.checked) setRoomPalette(roomId, master.length ? master : ['#cccccc'])
                else setRoomPalette(roomId, null)
              }}
            />
            <span>Override palette for this room</span>
          </label>
          {hasOverride ? (
            <PaletteSlots
              label="This room"
              palette={override ?? []}
              onChange={(next) => setRoomPalette(roomId, next)}
            />
          ) : null}
        </div>
      ) : null}
      <RecommendedPreview palette={effectivePalette(master, roomPalettes, roomId)} />
    </div>
  )
}

/** A row of up to 5 colour slots with per-slot edit/remove + an add button. */
function PaletteSlots({
  label,
  palette,
  onChange,
}: {
  label: string
  palette: string[]
  onChange: (colors: string[]) => void
}) {
  const setAt = (i: number, hex: string) => onChange(palette.map((c, j) => (j === i ? hex : c)))
  const removeAt = (i: number) => onChange(palette.filter((_, j) => j !== i))
  const add = () => onChange([...palette, '#cccccc'])
  return (
    <div>
      <div className="label" style={{ fontSize: 'var(--t-2xs)', marginBottom: 'var(--s-1)' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-1)', flexWrap: 'wrap' }}>
        {palette.map((hex, i) => (
          <span key={`${label}-${i}`} style={{ position: 'relative', width: 32, height: 32 }}>
            <ColorPicker
              value={/^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#cccccc'}
              onChange={(next) => setAt(i, next)}
              ariaLabel={`${label} colour ${i + 1}`}
              title={hex}
              paletteRoomId={null}
              style={{ width: 32, height: 32 }}
            />
            <button
              type="button"
              className="coll-x"
              style={{ top: -6, right: -6, bottom: 'auto' }}
              onClick={() => removeAt(i)}
              aria-label={`Remove ${label} colour ${i + 1}`}
            >
              <Icon.Close width={10} height={10} />
            </button>
          </span>
        ))}
        {palette.length < MAX_PALETTE_COLORS ? (
          <button
            type="button"
            className="btn btn-soft"
            style={{ width: 32, height: 32, padding: 0, lineHeight: 1 }}
            onClick={add}
            aria-label={`Add a colour to ${label}`}
            title="Add colour"
          >
            +
          </button>
        ) : null}
      </div>
    </div>
  )
}

/** A read-only preview of the harmony blends the pickers will recommend. */
function RecommendedPreview({ palette }: { palette: string[] }) {
  const blends = recommendedBlends(palette)
  if (blends.length === 0) return null
  return (
    <div>
      <div className="label" style={{ fontSize: 'var(--t-2xs)', marginBottom: 'var(--s-1)' }}>
        Recommended blends
      </div>
      <div className="swatches" style={{ paddingBlock: 0 }}>
        {blends.map((hex) => (
          <span
            key={hex}
            className="swatch"
            title={hex}
            style={{ backgroundColor: hex, cursor: 'default' }}
          />
        ))}
      </div>
    </div>
  )
}
