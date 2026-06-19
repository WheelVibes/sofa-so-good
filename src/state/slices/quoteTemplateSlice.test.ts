/**
 * Unit tests for quoteTemplateSlice.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_QUOTE_TEMPLATE } from '../../export/quoteTemplate'
import { useStore } from '../store'

describe('quoteTemplateSlice', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  it('starts with the default template', () => {
    const t = useStore.getState().quoteTemplate
    expect(t).toEqual(DEFAULT_QUOTE_TEMPLATE)
  })

  it('setQuoteTemplate updates the template', () => {
    const s = useStore.getState()
    s.setQuoteTemplate({ ...DEFAULT_QUOTE_TEMPLATE, companyName: 'ACME' })
    expect(useStore.getState().quoteTemplate.companyName).toBe('ACME')
  })

  it('resetQuoteTemplate restores the default', () => {
    const s = useStore.getState()
    s.setQuoteTemplate({ ...DEFAULT_QUOTE_TEMPLATE, companyName: 'ACME', gstPercent: 9 })
    s.resetQuoteTemplate()
    expect(useStore.getState().quoteTemplate).toEqual(DEFAULT_QUOTE_TEMPLATE)
  })

  it('setQuoteTemplate pushes an undo step', () => {
    const s = useStore.getState()
    expect(useStore.getState().past.length).toBe(0)
    s.setQuoteTemplate({ ...DEFAULT_QUOTE_TEMPLATE, companyName: 'ACME' })
    expect(useStore.getState().past.length).toBe(1)
  })

  it('resetQuoteTemplate pushes an undo step', () => {
    const s = useStore.getState()
    s.setQuoteTemplate({ ...DEFAULT_QUOTE_TEMPLATE, companyName: 'ACME' })
    const pastLen = useStore.getState().past.length
    s.resetQuoteTemplate()
    expect(useStore.getState().past.length).toBe(pastLen + 1)
  })

  it('undo after setQuoteTemplate restores previous value', () => {
    const s = useStore.getState()
    s.setQuoteTemplate({ ...DEFAULT_QUOTE_TEMPLATE, companyName: 'ACME' })
    s.undo()
    expect(useStore.getState().quoteTemplate.companyName).toBe('')
  })
})
