/**
 * Single Simple-mode discoverability hint (P26) — a row in the ⌘K footer
 * pointing out that Pro tools exist, gated by `proUpsell` (simple tier).
 * `ToolsMenu` is Pro-only (`Toolbar.tsx`), so the command palette footer is
 * the one surface visible in Simple mode that can host this hint.
 *
 * Clicking opens the Appearance popover, where the Simple↔Pro toggle + its
 * explainer live — it points at the toggle rather than silently flipping the
 * mode itself. Renders null outside Simple mode (nothing to upsell in Pro)
 * and null when the flag is off.
 */
import { useFeature } from '../features/useFeature'
import { useStore } from '../state/store'
import { Icon } from './toolbar/icons'

export function ProUpsellHint() {
  const on = useFeature('proUpsell')
  const uiMode = useStore((s) => s.uiMode)
  const setAppearanceOpen = useStore((s) => s.setAppearanceOpen)
  if (!on || uiMode === 'pro') return null
  return (
    <button type="button" className="cmdk-upsell" onClick={() => setAppearanceOpen(true)}>
      <Icon.Star width={14} height={14} />
      <span>
        More tools in <b>Pro</b> — measure, drawings, analysis &amp; more
      </span>
      <span className="badge neutral">Pro</span>
    </button>
  )
}
