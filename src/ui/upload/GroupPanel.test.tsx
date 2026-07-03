// @vitest-environment happy-dom
import { fireEvent, render, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { DetectedGroup } from '../../furniture/ikea/detectGroups'
import { GroupPanel } from './UploadModelDialog'

// One valid IKEA metadata blob (shape mirrored from metadata.test.ts) so rows
// render their real product name / category, not the invalid-metadata fallback.
const META = (i: number): Record<string, unknown> => ({
  group_key: `malm-${i}`,
  product_name: `MALM item ${i}`,
  type_name: 'bed frame',
  design: { category: 'beds', category_confidence: 'high', placement: 'floor' },
  variants: [{ article_number: `${i}`, finish: 'white', url: 'https://x/p', glb: 'white.glb' }],
})

function makeGroups(n: number): DetectedGroup[] {
  return Array.from({ length: n }, (_, i) => ({ dir: `g${i}/`, meta: META(i) }))
}

const rows = (c: HTMLElement) => within(c).getAllByRole('listitem')
const pager = (c: HTMLElement) => c.querySelector('nav[aria-label="Detected groups pages"]')

describe('GroupPanel pagination', () => {
  it('caps rendered rows to one page even with far more groups', () => {
    const { container } = render(
      <GroupPanel groups={makeGroups(1050)} looseCount={0} detecting={false} />,
    )
    // 1050 groups → 50 rendered (not 1050 DOM nodes — the whole point).
    expect(rows(container)).toHaveLength(50)
    expect(pager(container)).not.toBeNull()
    expect(container.textContent).toContain('Showing 1–50 of 1050')
    expect(container.textContent).toContain('page 1 of 21')
    // First row is the first group, not some later slice.
    expect(rows(container)[0].textContent).toContain('MALM item 0')
  })

  it('advances to the next page and shows the next slice', () => {
    const { container } = render(
      <GroupPanel groups={makeGroups(120)} looseCount={0} detecting={false} />,
    )
    fireEvent.click(within(container).getByText('Next ›'))
    expect(container.textContent).toContain('Showing 51–100 of 120')
    expect(rows(container)[0].textContent).toContain('MALM item 50')
  })

  it('disables Prev on the first page and Next on the last page', () => {
    const { container } = render(
      <GroupPanel groups={makeGroups(120)} looseCount={0} detecting={false} />,
    )
    const prev = within(container).getByText('‹ Prev') as HTMLButtonElement
    const next = within(container).getByText('Next ›') as HTMLButtonElement
    expect(prev.disabled).toBe(true)
    expect(next.disabled).toBe(false)
    fireEvent.click(next) // page 2
    fireEvent.click(within(container).getByText('Next ›')) // page 3 (last: 120/50 → 3 pages)
    expect(container.textContent).toContain('page 3 of 3')
    expect((within(container).getByText('Next ›') as HTMLButtonElement).disabled).toBe(true)
    expect((within(container).getByText('‹ Prev') as HTMLButtonElement).disabled).toBe(false)
  })

  it('hides the pager and pins to the first page while detecting', () => {
    const { container } = render(
      <GroupPanel groups={makeGroups(1050)} looseCount={0} detecting={true} />,
    )
    // Bounded to one page (smooth) but no pager controls mid-scan.
    expect(rows(container)).toHaveLength(50)
    expect(pager(container)).toBeNull()
    expect(rows(container)[0].textContent).toContain('MALM item 0')
  })

  it('shows no pager when everything fits on one page', () => {
    const { container } = render(
      <GroupPanel groups={makeGroups(10)} looseCount={3} detecting={false} />,
    )
    expect(rows(container)).toHaveLength(10)
    expect(pager(container)).toBeNull()
    // Header still reports the loose-model tail.
    expect(container.textContent).toContain('10 model groups detected + 3 loose models')
  })
})
