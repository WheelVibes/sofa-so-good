import { type ReactNode, useRef, useState } from 'react'
import { Modal } from '../Modal'
import { Icon } from '../toolbar/icons'
import { Popover } from '../toolbar/Popover'
import { useIsMobile } from '../useIsMobile'
import {
  type AvailabilityFilter,
  type CatalogFilter,
  DEFAULT_CATALOG_FILTER,
  isCatalogFilterActive,
  type SourceFilter,
} from './catalogBrowse'

interface CatalogFilterButtonProps {
  filter: CatalogFilter
  onChange: (next: CatalogFilter) => void
  /** Render the Availability group only when the grid actually holds
   *  remote/shared (un-downloaded) cards — otherwise the facet is meaningless. */
  showAvailability: boolean
  /** Render the Favourites-only toggle only when catalog favourites are enabled. */
  favEnabled: boolean
}

const AVAILABILITY_OPTIONS: { value: AvailabilityFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'downloaded', label: 'Downloaded' },
  { value: 'not-downloaded', label: 'Not downloaded' },
]

const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'builtin', label: 'Built-in' },
  { value: 'mine', label: 'My items' },
  { value: 'cc0', label: 'CC0 library' },
]

/** A vertical radio-style option group reusing the shared `.menu-item` rows. */
function RadioGroup<T extends string>({
  label,
  value,
  options,
  onSelect,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onSelect: (v: T) => void
}): ReactNode {
  return (
    <>
      <div className="menu-label">{label}</div>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="menuitemradio"
          aria-checked={value === o.value}
          className={`menu-item${value === o.value ? ' selected' : ''}`}
          onClick={() => onSelect(o.value)}
        >
          <span>{o.label}</span>
          {value === o.value ? <Icon.Check width={15} height={15} className="icn" /> : null}
        </button>
      ))}
    </>
  )
}

/** Compact funnel-icon button that opens the catalog filter groups (Availability /
 *  Source / Favourites) in an anchored Popover on desktop and a titled Modal sheet
 *  on mobile (mirrors the shared Select/AppearancePopover pattern). Pure UI over a
 *  {@link CatalogFilter} value owned by the caller. Gated by `catalogFilters`. */
export function CatalogFilterButton({
  filter,
  onChange,
  showAvailability,
  favEnabled,
}: CatalogFilterButtonProps) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)
  const active = isCatalogFilterActive(filter)
  const close = () => setOpen(false)

  const body = (
    <div className="pop-panel cat-filter-panel" style={{ minWidth: 190 }}>
      {showAvailability ? (
        <RadioGroup<AvailabilityFilter>
          label="Availability"
          value={filter.availability}
          options={AVAILABILITY_OPTIONS}
          onSelect={(v) => onChange({ ...filter, availability: v })}
        />
      ) : null}
      <RadioGroup<SourceFilter>
        label="Source"
        value={filter.source}
        options={SOURCE_OPTIONS}
        onSelect={(v) => onChange({ ...filter, source: v })}
      />
      {favEnabled ? (
        // Same .menu-item row + trailing check as the radio groups above, so
        // the toggle reads consistently (no native checkbox — theme-safe).
        <button
          type="button"
          role="menuitemcheckbox"
          aria-checked={filter.favouritesOnly}
          className={`menu-item${filter.favouritesOnly ? ' selected' : ''}`}
          onClick={() => onChange({ ...filter, favouritesOnly: !filter.favouritesOnly })}
        >
          <span>Favourites only</span>
          {filter.favouritesOnly ? <Icon.Check width={15} height={15} className="icn" /> : null}
        </button>
      ) : null}
      {active ? (
        <button
          type="button"
          className="menu-item"
          onClick={() => onChange({ ...DEFAULT_CATALOG_FILTER })}
        >
          <span>Reset to All</span>
        </button>
      ) : null}
    </div>
  )

  return (
    <>
      <button
        type="button"
        ref={anchorRef}
        className="icon-btn"
        aria-label="Filter catalog"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-pressed={active}
        title="Filter"
        style={{ position: 'relative' }}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon.Filter width={16} height={16} />
        {active ? (
          <span
            className="new-dot"
            aria-hidden="true"
            style={{ position: 'absolute', top: 2, right: 2, animation: 'none' }}
          />
        ) : null}
      </button>
      {open && isMobile ? (
        <Modal open onClose={close} title="Filter catalog">
          {body}
        </Modal>
      ) : open ? (
        <Popover open anchorRef={anchorRef} onClose={close}>
          {body}
        </Popover>
      ) : null}
    </>
  )
}
