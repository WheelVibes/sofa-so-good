import { type ReactNode, useId, useLayoutEffect, useRef, useState } from 'react'
import { Modal } from '../Modal'
import { Icon } from '../toolbar/icons'
import { Popover } from '../toolbar/Popover'
import { useIsMobile } from '../useIsMobile'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

interface SelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  /** Accessible name + the mobile sheet title. */
  ariaLabel?: string
  disabled?: boolean
  /** Trigger classes — defaults to `input` so callers can keep `input …` look. */
  className?: string
  id?: string
  title?: string
  /** Inline styles for the trigger (call sites that sized the native select). */
  style?: React.CSSProperties
  /** Shown when no option matches `value`. */
  placeholder?: string
  /** Compact icon-only trigger (`.icon-btn`) — label/title carry the current value. */
  iconTrigger?: ReactNode
}

/**
 * Themed replacement for a native `<select>`. The trigger looks like an `.input`;
 * the option list opens in an anchored {@link Popover} on desktop and a titled
 * {@link Modal} bottom sheet on mobile (mirrors `AppearancePopover`). Keyboard:
 * Up/Down move the active option, Enter/Space commit, Escape closes. ARIA
 * combobox/listbox semantics. Native `<select>` is intentionally avoided so the
 * OS phone wheel never appears and small fields don't trigger the iOS focus-zoom.
 */
export function Select({
  value,
  onChange,
  options,
  ariaLabel,
  disabled,
  className,
  id,
  title,
  style,
  placeholder,
  iconTrigger,
}: SelectProps) {
  const isMobile = useIsMobile()
  const iconOnly = iconTrigger != null
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const [triggerW, setTriggerW] = useState<number | undefined>(undefined)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const listId = useId()

  const selected = options.find((o) => o.value === value)
  const label = selected?.label ?? placeholder ?? ''
  const triggerName = ariaLabel ?? title ?? 'Select'
  const a11yLabel = iconOnly && label ? `${triggerName}: ${label}` : triggerName
  const panelMinW = iconOnly ? 168 : triggerW

  const close = () => {
    setOpen(false)
    setActiveIdx(-1)
  }
  const commit = (v: string) => {
    onChange(v)
    close()
    anchorRef.current?.focus()
  }
  const openMenu = () => {
    if (disabled) return
    const i = options.findIndex((o) => o.value === value)
    setActiveIdx(i >= 0 ? i : options.findIndex((o) => !o.disabled))
    setTriggerW(anchorRef.current?.offsetWidth)
    setOpen(true)
  }

  const step = (dir: 1 | -1) => {
    setActiveIdx((cur) => {
      let i = cur
      for (let n = 0; n < options.length; n++) {
        i = (i + dir + options.length) % options.length
        if (!options[i]?.disabled) return i
      }
      return cur
    })
  }

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (disabled) return
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        openMenu()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      step(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      step(-1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const opt = options[activeIdx]
      if (opt && !opt.disabled) commit(opt.value)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActiveIdx(options.findIndex((o) => !o.disabled))
    } else if (e.key === 'End') {
      e.preventDefault()
      for (let i = options.length - 1; i >= 0; i--)
        if (!options[i].disabled) {
          setActiveIdx(i)
          break
        }
    }
  }

  const optionList = (
    <OptionList
      listId={listId}
      options={options}
      value={value}
      activeIdx={activeIdx}
      onHover={setActiveIdx}
      onPick={commit}
    />
  )

  return (
    <>
      <button
        type="button"
        ref={anchorRef}
        id={id}
        title={title ?? (iconOnly && label ? `${triggerName}: ${label}` : undefined)}
        style={iconOnly ? undefined : style}
        disabled={disabled}
        className={
          iconOnly ? 'icon-btn select-icon-trigger' : `${className ?? 'input'} select-trigger`
        }
        // biome-ignore lint/a11y/useSemanticElements: this IS the custom combobox replacing <select>.
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={iconOnly ? a11yLabel : ariaLabel}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onTriggerKey}
      >
        {iconOnly ? (
          iconTrigger
        ) : (
          <>
            <span className="select-label">{label}</span>
            <Icon.Chevron width={14} height={14} className="icn" />
          </>
        )}
      </button>
      {open && isMobile ? (
        <Modal open onClose={close} title={a11yLabel}>
          <div className="select-sheet">{optionList}</div>
        </Modal>
      ) : open ? (
        <Popover open anchorRef={anchorRef} onClose={close}>
          <div
            className="pop-panel select-panel"
            style={panelMinW ? { minWidth: panelMinW } : undefined}
          >
            {optionList}
          </div>
        </Popover>
      ) : null}
    </>
  )
}

function OptionList({
  listId,
  options,
  value,
  activeIdx,
  onHover,
  onPick,
}: {
  listId: string
  options: SelectOption[]
  value: string
  activeIdx: number
  onHover: (i: number) => void
  onPick: (v: string) => void
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null)
  // Keep the active option scrolled into view as the user arrows through.
  useLayoutEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])
  return (
    <div ref={ref} id={listId} role="listbox" className="select-list">
      {options.map((o, i) => {
        const sel = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            data-idx={i}
            // biome-ignore lint/a11y/useSemanticElements: listbox option as a button for click+focus styling.
            role="option"
            aria-selected={sel}
            disabled={o.disabled}
            tabIndex={-1}
            className={`menu-item select-option${i === activeIdx ? ' active' : ''}${sel ? ' selected' : ''}`}
            onMouseEnter={() => onHover(i)}
            onClick={() => onPick(o.value)}
          >
            <span className="select-option-label">{o.label}</span>
            {sel ? <Icon.Check width={15} height={15} className="icn select-check" /> : null}
          </button>
        )
      })}
    </div>
  )
}
