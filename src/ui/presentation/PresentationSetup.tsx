/**
 * Inline presentation-setup row shown in the View menu (SavedViewsSection) when
 * both `presentation` AND `panoTour` feature flags are enabled in Pro mode.
 *
 * Shows a labelled "Include 360° tour" toggle (disabled + hinted when the tour
 * is empty), and a "Start" button that opens the presentation. When only the
 * `presentation` flag is on (or the tour is in Simple mode), the caller renders
 * the plain "Present…" MenuItem instead — this component is never mounted for
 * those cases.
 *
 * Mobile: the same component renders inside the mobile View accordion at ≤640px;
 * no separate mobile copy needed (it inherits the menu-item layout).
 */

import { useFeature } from '../../features/useFeature'
import { useStore } from '../../state/store'
import { Icon } from '../toolbar/icons'

export function PresentationSetup() {
  const presentationOn = useFeature('presentation')
  const panoTourOn = useFeature('panoTour')
  const setPresenting = useStore((s) => s.setPresenting)
  const includeTour = useStore((s) => s.presentationIncludeTour)
  const setIncludeTour = useStore((s) => s.setPresentationIncludeTour)
  const stops = useStore((s) => s.panoTourStops)

  // This component is only rendered when both flags are on, but guard defensively.
  if (!presentationOn || !panoTourOn) return null

  const tourEmpty = stops.length === 0

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '4px 8px 6px',
      }}
    >
      {/* Tour toggle row */}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: tourEmpty ? 'not-allowed' : 'pointer',
          opacity: tourEmpty ? 0.5 : 1,
        }}
        title={
          tourEmpty
            ? 'No tour stops yet — open the 360° Tour and add stops first'
            : 'Append 360° tour stops as panorama slides after your saved views'
        }
      >
        <input
          type="checkbox"
          checked={!tourEmpty && includeTour}
          disabled={tourEmpty}
          onChange={(e) => setIncludeTour(e.target.checked)}
          style={{ margin: 0 }}
          aria-label="Include 360° tour slides"
        />
        <span style={{ fontSize: 'var(--t-sm)', lineHeight: 1.3 }}>
          Include 360° tour
          {!tourEmpty ? (
            <span
              style={{
                marginLeft: 4,
                fontSize: 'var(--t-xs)',
                color: 'var(--text-3)',
              }}
            >
              ({stops.length} stop{stops.length === 1 ? '' : 's'})
            </span>
          ) : (
            <span
              style={{
                marginLeft: 4,
                fontSize: 'var(--t-xs)',
                color: 'var(--text-3)',
              }}
            >
              — add stops first
            </span>
          )}
        </span>
      </label>

      {/* Start button */}
      <button
        type="button"
        className="btn btn-accent"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => setPresenting(true)}
        aria-label="Start presentation"
      >
        <Icon.Walkthrough width={14} height={14} />
        Present…
      </button>
    </div>
  )
}
