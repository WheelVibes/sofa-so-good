import { Icon, type IconName } from './icons'
import { Tooltip } from './Tooltip'

interface IconButtonProps {
  icon: IconName
  label: string
  shortcut?: string
  active?: boolean
  chevron?: boolean
  badge?: string | number
  /** Render `label` as a visible inline caption (not just the tooltip). */
  showLabel?: boolean
  /** Prominent filled-accent call-to-action styling (e.g. "Edit a room"). */
  cta?: boolean
  onClick?: () => void
}

/** A single icon control with a hover tooltip. Active state uses the accent
 *  soft highlight; optional chevron marks a dropdown; optional badge is a small
 *  accent count dot (`.nub`); `cta` makes it a filled-accent primary button. */
export function IconButton({
  icon,
  label,
  shortcut = '',
  active,
  chevron,
  badge,
  showLabel,
  cta,
  onClick,
}: IconButtonProps) {
  const Cmp = Icon[icon]
  const hasBadge = badge != null && badge !== '' && badge !== 0
  return (
    <Tooltip label={label} shortcut={shortcut}>
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className={`tool-btn${active ? ' active' : ''}${cta ? ' cta' : ''}`}
      >
        <Cmp />
        {showLabel ? <span className="cap">{label}</span> : null}
        {chevron ? <Icon.Chevron width={12} height={12} className="chev" /> : null}
        {hasBadge ? <span className="nub">{badge}</span> : null}
      </button>
    </Tooltip>
  )
}
