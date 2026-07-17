import type { FurnitureDef, FurnitureItem } from '../../furniture/types'
import { isOffSquare, nearestRightAngle } from '../../layout/angle'
import { useStore } from '../../state/store'
import { Icon } from '../toolbar/icons'
import { shortcutLabel } from '../toolbar/shortcuts'
import {
  centreItemInRoom,
  confirmDeleteItem,
  duplicateItemNearby,
  faceItemIntoRoom,
  flipItemAxis,
  rotate90Item,
  trySetRotItem,
} from './itemTransforms'

type ItemActionProps = {
  item: FurnitureItem
  def: FurnitureDef
  catalog: Record<string, FurnitureDef>
}

/**
 * Rotate / flip / duplicate / lock / delete action grid. Window-bound fixtures
 * (curtains/blinds/grilles) are static on their window — no rotate/flip, only
 * duplicate/lock/delete. Rendered first in the inspector's actions section,
 * ahead of the array tools (`InspectorPanel.tsx` keeps that ordering).
 */
export function ItemBasicActions({ item, def, catalog }: ItemActionProps) {
  return (
    <div className="action-grid">
      {!(def.windowBound || def.doorBound) ? (
        <>
          <button
            type="button"
            className="act"
            onClick={() => rotate90Item(item.id, def, catalog)}
            disabled={item.locked}
            title={`Rotate 90° (${shortcutLabel('rotate')} · Shift for 15°)`}
          >
            <Icon.Rotate width={16} height={16} />
            Rotate
          </button>
          <button
            type="button"
            className={`act${item.flipX ? ' on' : ''}`}
            onClick={() => flipItemAxis(item.id, 'x')}
            disabled={item.locked}
            title={`Flip left–right (${shortcutLabel('flip')})`}
          >
            <Icon.FlipH width={16} height={16} />
            Flip H
          </button>
          <button
            type="button"
            className={`act${item.flipZ ? ' on' : ''}`}
            onClick={() => flipItemAxis(item.id, 'z')}
            disabled={item.locked}
            title={`Flip front–back (Shift ${shortcutLabel('flip')})`}
          >
            <Icon.FlipV width={16} height={16} />
            Flip V
          </button>
        </>
      ) : null}
      <button
        type="button"
        className="act"
        onClick={() => duplicateItemNearby(item, def, catalog)}
        title={`Duplicate (${shortcutLabel('duplicateSelected')})`}
      >
        <Icon.Copy width={16} height={16} />
        Duplicate
      </button>
      <button
        type="button"
        className={`act${item.locked ? ' on' : ''}`}
        onClick={() => useStore.getState().toggleLock(item.id)}
        title={item.locked ? 'Unlock — allow moving & editing' : 'Lock in place'}
      >
        {item.locked ? (
          <Icon.Lock width={16} height={16} />
        ) : (
          <Icon.Unlock width={16} height={16} />
        )}
        {item.locked ? 'Locked' : 'Lock'}
      </button>
      <button
        type="button"
        className="act danger"
        onClick={() => !item.locked && void confirmDeleteItem(item.id, def.name)}
        disabled={item.locked}
        title="Delete this item (Del)"
      >
        <Icon.Trash width={16} height={16} />
        Delete
      </button>
    </div>
  )
}

/**
 * Straighten-to-90° (only shown when off-square) + face-room/centre-in-room
 * grid. Rendered after the array tools sections in `InspectorPanel.tsx` — a
 * separate export (not merged into `ItemBasicActions`) so that ordering is
 * preserved without reshuffling the array sections between them.
 */
export function ItemOrientActions({ item, def, catalog }: ItemActionProps) {
  return (
    <>
      {isOffSquare(item.rotation) ? (
        <button
          type="button"
          onClick={() =>
            trySetRotItem(item.id, def, catalog, (nearestRightAngle(item.rotation) * 180) / Math.PI)
          }
          className="btn btn-soft btn-block"
          style={{ marginTop: 'var(--s-2)' }}
          title="Snap this item's rotation to the nearest 90°"
        >
          <Icon.Rotate width={14} height={14} />
          Straighten
        </button>
      ) : null}
      <div className="action-grid two" style={{ marginTop: 'var(--s-2)' }}>
        <button
          type="button"
          onClick={() => faceItemIntoRoom(item.id, def, catalog)}
          className="act"
          title="Turn this piece's back to the nearest wall (face into the room)"
        >
          <Icon.Rotate width={14} height={14} />
          Face room
        </button>
        <button
          type="button"
          onClick={() => centreItemInRoom(item.id, def, catalog)}
          className="act"
          title="Move this piece to the centre of its room"
        >
          <Icon.AlignX width={14} height={14} />
          Centre
        </button>
      </div>
    </>
  )
}
