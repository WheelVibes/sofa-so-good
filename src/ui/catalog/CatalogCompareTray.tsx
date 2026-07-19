import type { RoomFreeRect } from '../../catalog/roomFit'
import type { FurnitureDef } from '../../furniture/types'
import type { UnitSystem } from '../../utils/measurement'
import { Button } from '../controls/Button'
import { Modal } from '../Modal'
import { Icon } from '../toolbar/icons'
import { buildCompareRow } from './catalogCompareData'
import { useBuiltinThumbnail } from './thumbnails'
import { useCatalogPlacement } from './useCatalogPlacement'

const FIT_LABEL: Record<string, string> = {
  fits: 'Fits',
  tight: 'Tight fit',
  'wont-fit': "Won't fit",
  unknown: '—',
}

/** One column of the comparison tray: thumbnail, name, dims/area/price/fit
 *  rows, and a Place button that arms placement via the shared catalog
 *  placement grammar (the exact same path a card click uses). */
function CompareColumn({
  def,
  roomRects,
  priceOn,
  units,
  onPlace,
}: {
  def: FurnitureDef
  roomRects: RoomFreeRect[] | null
  priceOn: boolean
  units: UnitSystem
  onPlace: () => void
}) {
  const thumb = useBuiltinThumbnail(def)
  const { arm } = useCatalogPlacement(def)
  const row = buildCompareRow(def, { units, roomRects, priceOn })
  return (
    <div className="cmp-col">
      <div className="cmp-thumb">
        {thumb ? <img src={thumb} alt={def.name} /> : <Icon.Catalog width={28} height={28} />}
      </div>
      <div className="cmp-name" title={row.name}>
        {row.name}
      </div>
      <dl className="cmp-facts">
        <dt>Size (W×D)</dt>
        <dd>{row.dimsLabel}</dd>
        <dt>Footprint area</dt>
        <dd>{row.areaLabel}</dd>
        {row.price != null ? (
          <>
            <dt>Est. price</dt>
            <dd>${row.price.toLocaleString('en-SG')}</dd>
          </>
        ) : null}
        <dt>Fits this room</dt>
        <dd className={`cmp-fit cmp-fit-${row.fit}`}>{FIT_LABEL[row.fit]}</dd>
      </dl>
      <Button
        variant="accent"
        size="sm"
        onClick={() => {
          arm()
          onPlace()
        }}
      >
        Place
      </Button>
    </div>
  )
}

interface CatalogCompareTrayProps {
  open: boolean
  onClose: () => void
  /** Called after a column's Place button arms placement — the caller closes
   *  the tray AND exits/resets compare mode (a placement ends the comparison
   *  task; it doesn't return to picking more items). */
  onPlaced: () => void
  /** 2-3 same-category defs selected for comparison. */
  defs: FurnitureDef[]
  /** Free-space rects of the room being edited (the "fits this room" cue), or
   *  `null` when no room is active / the fit flag is off — resolves to a dash
   *  either way (never a false verdict). */
  roomRects: RoomFreeRect[] | null
  /** Whether the budget/price feature is on — omits the price row when off. */
  priceOn: boolean
  units: UnitSystem
}

/** Side-by-side comparison of 2-3 same-category catalog items (CATALOG-COMPARE).
 *  Columns can scroll horizontally on narrow/mobile viewports rather than being
 *  forced to a fixed grid, so the sheet stays usable on a phone. Tapping a
 *  column's Place button arms that item and closes the tray so the placement
 *  ghost is visible immediately. */
export function CatalogCompareTray({
  open,
  onClose,
  onPlaced,
  defs,
  roomRects,
  priceOn,
  units,
}: CatalogCompareTrayProps) {
  return (
    <Modal open={open} onClose={onClose} title="Compare items" width="var(--modal-lg)">
      <div className="cmp-tray">
        {defs.map((def) => (
          <CompareColumn
            key={def.id}
            def={def}
            roomRects={roomRects}
            priceOn={priceOn}
            units={units}
            onPlace={onPlaced}
          />
        ))}
      </div>
    </Modal>
  )
}
