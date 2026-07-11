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
  /** Disables the button; pair with `disabledReason` to explain why. */
  disabled?: boolean
  /** Reason shown in the tooltip + native `title` when `disabled`. */
  disabledReason?: string
  onClick?: () => void
}

/** A single icon control with a hover tooltip. Active state uses the accent
 *  soft highlight; optional chevron marks a dropdown; optional badge is a small
 *  accent count dot (`.nub`); `cta` makes it a filled-accent primary button.
 *  When `disabled`, the tooltip label swaps to `disabledReason` (if given) and
 *  the reason is mirrored on the native `title` attribute so it's reachable on
 *  touch, where the hover tooltip is suppressed. */
export function IconButton({
  icon,
  label,
  shortcut = '',
  active,
  chevron,
  badge,
  showLabel,
  cta,
  disabled,
  disabledReason,
  onClick,
}: IconButtonProps) {
  const Cmp = Icon[icon]
  const hasBadge = badge != null && badge !== '' && badge !== 0
  const tipLabel = disabled && disabledReason ? disabledReason : label
  return (
    <Tooltip label={tipLabel} shortcut={disabled ? '' : shortcut}>
      <button
        type="button"
        aria-label={label}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        // Mirror the accessible name onto the native title even when ENABLED
        // (TB-7): the custom Tooltip is hover/keyboard-only, so a touch user on
        // an icon-only button (Snap, Lights, Graphics) otherwise gets no name.
        title={disabled ? disabledReason : label}
        onClick={disabled ? undefined : onClick}
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
