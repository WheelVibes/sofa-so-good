import { useRef, useState } from 'react'
import type { CatalogVariantOption } from '../../furniture/placement/catalogVariants'
import { Modal } from '../Modal'
import { Icon } from '../toolbar/icons'
import { Popover } from '../toolbar/Popover'
import { useIsMobile } from '../useIsMobile'

interface CatalogVariantPopoverProps {
  /** Display name, used for the trigger's aria-label + the popover title. */
  defName: string
  options: CatalogVariantOption[]
  /** Called with the chosen option's id (+ the trigger event, for cursor
   *  placement) — the caller arms placement with that finish (CATALOG-VARIANT).
   *  The popover closes immediately after. */
  onPick: (optionId: string, e?: React.MouseEvent) => void
}

/**
 * Compact quick-look swatch popover on a `CatalogCard` (CATALOG-VARIANT) — lets
 * a shopper pick a colour/finish/variant BEFORE placing, instead of only after
 * via the inspector. Deliberately a popover, not inline card swatches (TODO.md's
 * mobile-clutter warning): a small trigger button that opens an anchored
 * {@link Popover} on desktop / a titled {@link Modal} sheet on mobile — the same
 * split `ColorPicker` uses, so it's touch-friendly and never overflows a 390px
 * card. Purely presentational: the caller (`CatalogCard`) owns what picking an
 * option actually does (arm placement with the resolved initial props).
 */
export function CatalogVariantPopover({ defName, options, onPick }: CatalogVariantPopoverProps) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const anchorRef = useRef<HTMLButtonElement>(null)

  const close = () => {
    setOpen(false)
    anchorRef.current?.focus()
  }
  const pick = (opt: CatalogVariantOption, e?: React.MouseEvent) => {
    if (opt.disabled) return
    setPicked(opt.id)
    onPick(opt.id, e)
    close()
  }

  const list = (
    <div className="variant-pop-list">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          disabled={opt.disabled}
          title={opt.disabled ? `${opt.label} (not available)` : opt.label}
          aria-label={`Place in ${opt.label}`}
          className={`swatch${picked === opt.id ? ' on' : ''}`}
          style={{ backgroundColor: opt.swatchHex ?? 'var(--surface-3)' }}
          onClick={(e) => {
            e.stopPropagation()
            pick(opt, e)
          }}
        />
      ))}
    </div>
  )

  return (
    <>
      <button
        type="button"
        ref={anchorRef}
        className="variant-btn"
        aria-label={`Choose a finish for ${defName}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Choose a finish"
        onClick={(e) => {
          e.stopPropagation()
          e.preventDefault()
          setOpen((v) => !v)
        }}
      >
        <Icon.Palette width={13} height={13} />
      </button>
      {open && isMobile ? (
        <Modal open onClose={close} title={`Choose a finish — ${defName}`}>
          <div className="variant-pop-body">{list}</div>
        </Modal>
      ) : open ? (
        <Popover open anchorRef={anchorRef} onClose={close}>
          <div className="pop-panel variant-panel" onClick={(e) => e.stopPropagation()}>
            <div className="variant-pop-head">Choose a finish</div>
            {list}
          </div>
        </Popover>
      ) : null}
    </>
  )
}
