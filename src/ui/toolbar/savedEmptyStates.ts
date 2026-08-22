import type { EmptyStateProps } from '../EmptyState'
import { Icon } from './icons'

/**
 * Shared empty-state copy for the four "saved collection" lists that each ship
 * a desktop toolbar menu AND a mobile sheet section (UIUX-74).
 *
 * The two surfaces render the same list from the same store slice, so they must
 * read identically — the mobile File section had drifted to a hand-rolled
 * `<div className="m-empty">No saved layouts.</div>` while desktop already used
 * the shared `EmptyState`, and mobile Arrange/View showed nothing at all where
 * desktop explained how to populate the list. Spreading one record into both
 * `<EmptyState {...SAVED_EMPTY.layouts} />` call sites is what keeps the icon,
 * headline and hint from separating again.
 *
 * Descriptions name the real control that fills the list, so the hint is
 * actionable rather than a restatement of the headline.
 */
export const SAVED_EMPTY: Record<
  'layouts' | 'sets' | 'styles' | 'views',
  Pick<EmptyStateProps, 'icon' | 'title' | 'description'>
> = {
  layouts: {
    icon: Icon.Save,
    title: 'No saved layouts yet',
    description: 'Save… stores the current design here.',
  },
  sets: {
    icon: Icon.Sets,
    title: 'No saved sets yet',
    description: 'Select a few pieces, then save.',
  },
  styles: {
    icon: Icon.Style,
    title: 'No saved styles yet',
    description: 'Finish a room, then save.',
  },
  views: {
    icon: Icon.Frame,
    title: 'No saved views yet',
    description: 'Frame an angle, then "Save current view".',
  },
}
