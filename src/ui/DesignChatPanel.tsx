import { type KeyboardEvent, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { askDesignChat, type DesignChatMessage, MAX_HISTORY_TURNS } from '../ai/designChat'
import { buildDesignChatContext } from '../ai/designChatContext'
import {
  AiPlanError,
  classifyVisionEndpoint,
  getVisionKey,
  getVisionUrl,
  setVisionKey,
} from '../ai/floorPlanAi'
import { buildMergedCatalog } from '../furniture/catalog'
import { useStore } from '../state/store'
import { AuxPanelHead } from './AuxPanelHead'
import { Button } from './controls/Button'
import { EmptyState } from './EmptyState'
import { Icon } from './toolbar/icons'

/** A rendered chat turn (adds a stable key + optional error marker over the
 *  plain `DesignChatMessage` the network layer uses). */
interface ChatTurn extends DesignChatMessage {
  id: string
  error?: boolean
}

let turnSeq = 0
const nextId = () => `turn-${turnSeq++}`

/**
 * AI design chat (v1, read-only, BYO-key): ask an LLM about the current
 * design, grounded in the app's OWN computed numbers (`buildDesignChatContext`
 * — plan statistics + design score + per-room furniture). No write access —
 * this panel never mutates the design, only answers questions about it.
 * History is SESSION-ONLY component state (never persisted/undoable), mirroring
 * the app's other session-only chat-shaped surfaces. Docks to the shared `.aux`
 * slot like Comments/Design score.
 */
export function DesignChatPanel() {
  const open = useStore((s) => s.designChatOpen)
  const setOpen = useStore((s) => s.setDesignChatOpen)
  const items = useStore((s) => s.items)
  const plan = useStore((s) => s.floorPlan)
  const doors = useStore((s) => s.doors)
  const catalogInputs = useStore(
    useShallow((s) => ({
      userFurniture: s.userFurniture,
      resolvedRemoteFurniture: s.resolvedRemoteFurniture,
      packFurniture: s.packFurniture,
    })),
  )

  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  // Rebuilt only while the panel is open — the same "skip while closed" gate
  // as DesignScorePanel, since this walks every item/room too.
  const contextText = useMemo(() => {
    if (!open) return ''
    const defs = buildMergedCatalog(catalogInputs)
    return buildDesignChatContext({ items, defs, plan, doors })
  }, [open, items, plan, doors, catalogInputs])

  if (!open) return null

  const send = async () => {
    const q = question.trim()
    if (!q || busy) return

    // Prompt for + persist the BYO key inline when missing (mirrors AI plan
    // generation / auto-furnish) rather than dead-ending on an error.
    let key = getVisionKey()
    if (!key) {
      const s = useStore.getState()
      const typed = await s.promptText({
        title: 'AI design chat',
        label: 'LLM API key (OpenAI-compatible, kept in this browser)',
        submitLabel: 'Continue',
      })
      if (!typed) return
      key = typed
      setVisionKey(key)
    }
    const endpoint = classifyVisionEndpoint(getVisionUrl())
    if (!endpoint.secure) {
      useStore
        .getState()
        .notify.start({ title: 'Insecure AI endpoint', message: endpoint.reason, kind: 'error' })
      return
    }

    const userTurn: ChatTurn = { id: nextId(), role: 'user', content: q }
    const history: DesignChatMessage[] = [...turns, userTurn].slice(-MAX_HISTORY_TURNS)
    setTurns((t) => [...t, userTurn])
    setQuestion('')
    setBusy(true)
    try {
      const reply = await askDesignChat(contextText, q, history, { key })
      setTurns((t) => [...t, { id: nextId(), role: 'assistant', content: reply }])
    } catch (e) {
      const message = e instanceof AiPlanError ? e.message : 'AI design chat failed.'
      useStore.getState().notify.error(nextId(), message)
      setTurns((t) => [...t, { id: nextId(), role: 'assistant', content: message, error: true }])
    } finally {
      setBusy(false)
      requestAnimationFrame(() => {
        listRef.current?.scrollTo({ top: listRef.current.scrollHeight })
      })
    }
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // A single-line <input> has no newline to insert, so the old `!e.shiftKey`
    // guard could never change the outcome — Enter always sends here.
    if (e.key === 'Enter') {
      e.preventDefault()
      void send()
    }
  }

  return (
    <aside className="panel mini aux aux-360" id="designChatPanel">
      <AuxPanelHead
        title="Design chat"
        sub="Ask about your design — advice only, no edits"
        onClose={() => setOpen(false)}
      />
      <hr className="hr" />
      <div className="panel-body">
        {turns.length === 0 ? (
          <EmptyState
            icon={Icon.Style}
            title="Ask about your design"
            description={
              'e.g. "Is my living room too crowded?" or "Which room has the least daylight?" — ' +
              "answers are grounded in this design's real numbers, advice only."
            }
          />
        ) : (
          // `role="log"` + a polite live region: a chat surface that never
          // announces the reply leaves a screen-reader user with no idea the
          // answer arrived, or that the request is still running (UIUX-80).
          <div
            ref={listRef}
            className="clr-list chat-log"
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
            aria-label="Design chat transcript"
          >
            {turns.map((t) => (
              <div
                key={t.id}
                className={`clr-item chat-turn ${t.error ? 'failed' : t.role === 'user' ? 'you' : ''}`}
              >
                <div className="ci-head chat-who">{t.role === 'user' ? 'You' : 'Advisor'}</div>
                <div className="chat-body">{t.content}</div>
              </div>
            ))}
            {busy && (
              <div className="clr-item chat-turn">
                <div className="chat-body pending">Thinking…</div>
              </div>
            )}
          </div>
        )}
        <div className="chat-ask">
          <input
            type="text"
            className="input"
            placeholder="Ask about your design…"
            value={question}
            disabled={busy}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={onKeyDown}
            aria-label="Ask about your design"
          />
          <Button
            variant="accent"
            size="sm"
            loading={busy}
            disabled={!question.trim()}
            onClick={() => void send()}
          >
            Send
          </Button>
        </div>
      </div>
    </aside>
  )
}
