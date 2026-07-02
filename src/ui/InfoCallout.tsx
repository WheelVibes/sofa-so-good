import type { ReactNode } from 'react'
import { useFeature } from '../features/useFeature'
import { useStore } from '../state/store'
import { Icon } from './toolbar/icons'

/**
 * A dismissible progressive-disclosure hint banner (P25). Renders a one-line
 * "did you know" note in a screen (room editor / floor-plan editor / walk mode)
 * only while the `infoCallouts` feature is on AND the user hasn't dismissed this
 * particular `id`. Dismissing it persists the id (per-device, via
 * `calloutsSlice`) so the banner never re-appears. Never a modal — a light,
 * self-contained note that stays out of the way.
 */
export function InfoCallout({
  id,
  title,
  children,
}: {
  /** Stable per-callout id; the dismissed id is persisted under this key. */
  id: string
  /** Bold lead-in shown before the body. */
  title: string
  /** Optional one-line body copy. */
  children?: ReactNode
}) {
  const enabled = useFeature('infoCallouts')
  const dismissed = useStore((s) => s.dismissedCallouts.includes(id))
  const dismissCallout = useStore((s) => s.dismissCallout)
  if (!enabled || dismissed) return null
  return (
    <div className="info-callout" role="note">
      <Icon.Credits className="ic" width={18} height={18} />
      <div className="ic-body">
        <b>{title}</b>
        {children ? <span>{children}</span> : null}
      </div>
      <button
        type="button"
        className="ic-dismiss"
        aria-label="Don't show this again"
        onClick={() => dismissCallout(id)}
      >
        <Icon.Close width={16} height={16} />
      </button>
    </div>
  )
}
