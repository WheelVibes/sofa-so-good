import { Icon, type IconName } from './icons'
import { Tooltip } from './Tooltip'

interface IconButtonProps {
  icon: IconName
  label: string
  shortcut?: string
  active?: boolean
  chevron?: boolean
  badge?: string | number
  onClick?: () => void
}

/** A single icon control with a hover tooltip. Active state uses the accent
 *  soft highlight; optional chevron marks a dropdown; optional badge is a small
 *  accent count dot (`.nub`). */
export function IconButton({
  icon,
  label,
  shortcut = '',
  active,
  chevron,
  badge,
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
        className={`tool-btn${active ? ' active' : ''}`}
      >
        <Cmp />
        {chevron ? <Icon.Chevron width={12} height={12} className="chev" /> : null}
        {hasBadge ? <span className="nub">{badge}</span> : null}
      </button>
    </Tooltip>
  )
}
