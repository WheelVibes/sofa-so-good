import { useFeature } from '../../features/useFeature'
import { useCatalog } from '../../furniture/catalog'
import { useStore } from '../../state/store'
import { Icon } from '../toolbar/icons'

/**
 * Active-stamp-mode cue (PARITY-STAMP-PLACE). Shown in the catalog drawer while a
 * sticky "stamp" is armed: names the item being stamped, reminds the user how to
 * place + stop, and offers a Done button (mirrors the Escape disarm). Hidden when
 * the `stampPlace` feature is off (forced off in Simple mode) or nothing is armed.
 *
 * Token-class only (`.stamp-banner` / `.btn`) — reads correctly in every theme.
 */
export function StampBanner() {
  const stampOn = useFeature('stampPlace')
  const stamping = useStore((s) => s.stampMode)
  const activeDefId = useStore((s) => s.activeDefId)
  const cancelPlacement = useStore((s) => s.cancelPlacement)
  const catalog = useCatalog()
  if (!stampOn || !stamping || !activeDefId) return null
  const name = catalog[activeDefId]?.name ?? 'item'
  return (
    <div className="stamp-banner" role="status" aria-live="polite">
      <Icon.Copy width={14} height={14} />
      <span className="stamp-banner-text">
        Stamping <b>{name}</b> — click the floor to drop copies
      </span>
      <button
        type="button"
        className="btn btn-sm"
        onClick={() => cancelPlacement()}
        title="Stop stamping (Esc)"
      >
        Done
      </button>
    </div>
  )
}
