// @vitest-environment happy-dom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setVisionKey } from '../ai/floorPlanAi'
import { useStore } from '../state/store'
import { DesignChatPanel } from './DesignChatPanel'

describe('DesignChatPanel', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
    setVisionKey('')
  })

  it('renders nothing when closed', () => {
    const { container } = render(<DesignChatPanel />)
    expect(container.firstChild).toBeNull()
  })

  it('shows the empty state + input when open', () => {
    useStore.getState().setDesignChatOpen(true)
    render(<DesignChatPanel />)
    expect(screen.getByText('Ask about your design')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Ask about your design' })).toBeInTheDocument()
  })

  it('sends a question (Enter) and renders the mocked assistant reply', async () => {
    setVisionKey('test-key')
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: 'Your living room looks well-furnished.' } }],
      }),
    }) as unknown as typeof fetch

    useStore.getState().setDesignChatOpen(true)
    render(<DesignChatPanel />)
    const input = screen.getByRole('textbox', { name: 'Ask about your design' })
    fireEvent.change(input, { target: { value: 'How is my living room?' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(screen.getByText('How is my living room?')).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByText('Your living room looks well-furnished.')).toBeInTheDocument(),
    )
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('shows the error reply inline on a provider failure (no crash)', async () => {
    setVisionKey('test-key')
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch

    useStore.getState().setDesignChatOpen(true)
    render(<DesignChatPanel />)
    const input = screen.getByRole('textbox', { name: 'Ask about your design' })
    fireEvent.change(input, { target: { value: 'hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => expect(screen.getByText(/Provider error/i)).toBeInTheDocument())
  })
})
