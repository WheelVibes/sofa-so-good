import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  askDesignChat,
  buildDesignChatRequest,
  type DesignChatMessage,
  MAX_HISTORY_TURNS,
} from './designChat'
import { AiPlanError } from './floorPlanAi'

describe('buildDesignChatRequest', () => {
  it('includes the hard-constraint system prompt', () => {
    const req = buildDesignChatRequest('CONTEXT', 'How is my living room?', [], 'gpt-4o')
    const system = req.messages.filter((m) => m.role === 'system')
    expect(system.length).toBe(2)
    expect(system[0].content).toMatch(/ONLY cite numbers/i)
    expect(system[0].content).toMatch(/can't measure that from here/i)
    expect(system[0].content).toMatch(/READ-ONLY/i)
    expect(system[1].content).toBe('CONTEXT')
  })

  it('appends the new question as the final user message', () => {
    const req = buildDesignChatRequest('CONTEXT', 'question?', [])
    expect(req.messages.at(-1)).toEqual({ role: 'user', content: 'question?' })
  })

  it('caps rolling history to the last MAX_HISTORY_TURNS turns', () => {
    const history: DesignChatMessage[] = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `turn-${i}`,
    }))
    const req = buildDesignChatRequest('CONTEXT', 'latest?', history)
    // 2 system + capped history + 1 new user message.
    expect(req.messages.length).toBe(2 + MAX_HISTORY_TURNS + 1)
    // Only the MOST RECENT turns survive the cap.
    const historyMessages = req.messages.slice(2, -1)
    expect(historyMessages[0].content).toBe(`turn-${20 - MAX_HISTORY_TURNS}`)
    expect(historyMessages.at(-1)?.content).toBe('turn-19')
  })

  it('passes an empty history through unchanged', () => {
    const req = buildDesignChatRequest('CONTEXT', 'q', [])
    expect(req.messages.length).toBe(3)
  })
})

describe('askDesignChat', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('rejects a blank question without any network call', async () => {
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy as unknown as typeof fetch
    await expect(
      askDesignChat('CTX', '   ', [], { key: 'k', url: 'https://api.openai.com/v1/x' }),
    ).rejects.toThrow(AiPlanError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects a missing key without any network call', async () => {
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy as unknown as typeof fetch
    await expect(
      askDesignChat('CTX', 'hi', [], { key: '', url: 'https://api.openai.com/v1/x' }),
    ).rejects.toThrow(/API key/i)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses an insecure (plaintext, non-local) endpoint before sending the key', async () => {
    const fetchSpy = vi.fn()
    global.fetch = fetchSpy as unknown as typeof fetch
    await expect(
      askDesignChat('CTX', 'hi', [], { key: 'k', url: 'http://evil.example.com/v1' }),
    ).rejects.toThrow(/insecure/i)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns the assistant reply on a successful call (mocked fetch)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'Your living room looks great.' } }] }),
    }) as unknown as typeof fetch
    const reply = await askDesignChat('CTX', 'How is my living room?', [], {
      key: 'k',
      url: 'https://api.openai.com/v1/chat/completions',
    })
    expect(reply).toBe('Your living room looks great.')
  })

  it('surfaces a clear error on 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 }) as unknown as typeof fetch
    await expect(
      askDesignChat('CTX', 'hi', [], { key: 'bad', url: 'https://api.openai.com/v1/x' }),
    ).rejects.toThrow(/invalid api key/i)
  })

  it('surfaces a network failure as a CORS-hinting error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch
    await expect(
      askDesignChat('CTX', 'hi', [], { key: 'k', url: 'https://api.openai.com/v1/x' }),
    ).rejects.toThrow(/CORS/i)
  })
})
