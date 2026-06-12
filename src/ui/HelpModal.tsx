import { useEffect, useState } from 'react'
import { useStore } from '../state/store'
import { openDocs } from './docsUrl'
import { Modal } from './Modal'
import { Icon } from './toolbar/icons'
import { useIsMobile } from './useIsMobile'

const SHORTCUTS: [string, string][] = [
  ['Command palette', '⌘K'],
  ['Search catalog', '/'],
  ['Toggle catalog', 'C'],
  ['Budget / shopping', 'B'],
  ['Rotate selection', 'R'],
  ['Flip selection', 'F'],
  ['Duplicate', '⌘D'],
  ['Select all', '⌘A'],
  ['Cycle selection', '[ ]'],
  ['Prev / next room', ', .'],
  ['Nudge selection', '↑ ↓ ← →'],
  ['Delete', 'Del'],
  ['Measurements', 'M'],
  ['Tidy room', 'L'],
  ['Top view', 'O'],
  ['2D plan editor', 'P'],
  ['Reset view', 'H'],
  ['Walk / orbit', 'V'],
  ['Time of day', 'T'],
  ['Undo / redo', '⌘Z'],
  ['Help', '?'],
]

/** Keyboard-shortcut reference, in its own modal (opened from Help on desktop).
 *  Mobile has no hardware keyboard, so it never surfaces there. */
function KeyboardShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Keyboard shortcuts" sub="Sofa So Good">
      <div className="kbd-grid">
        {SHORTCUTS.map(([label, key]) => (
          <div className="kbd-row" key={label}>
            <span>{label}</span>
            <kbd>{key}</kbd>
          </div>
        ))}
      </div>
    </Modal>
  )
}

/** Help modal (toolbar `?`). How-to content lives in the user guide, so this is
 *  just a launcher: replay the guided tour, open the user guide, and — on
 *  desktop — open the keyboard-shortcut reference (mobile has no keyboard). */
export function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const isMobile = useIsMobile()
  const [keysOpen, setKeysOpen] = useState(false)
  // The shortcuts modal stacks on top of Help; if Help is dismissed, close it too
  // so it doesn't reappear orphaned the next time Help opens.
  useEffect(() => {
    if (!open) setKeysOpen(false)
  }, [open])
  return (
    <>
      <Modal open={open} onClose={onClose} title="Help" sub="Sofa So Good" panelId="helpPanel">
        <div className="sec" style={{ borderTop: 'none', paddingTop: 0 }}>
          <div className="sec-h">
            <span>Learn more</span>
          </div>
          <button
            type="button"
            className="btn btn-soft btn-block"
            style={{ marginBottom: 'var(--s-3)' }}
            onClick={() => {
              const s = useStore.getState()
              s.setHelpOpen(false)
              s.startTour()
            }}
          >
            <Icon.Help width={14} height={14} />
            Replay the guided tour
          </button>
          <button
            type="button"
            className="btn btn-soft btn-block"
            style={!isMobile ? { marginBottom: 'var(--s-3)' } : undefined}
            onClick={openDocs}
          >
            <Icon.Book width={14} height={14} />
            Open the user guide ↗
          </button>
          {!isMobile ? (
            <button
              type="button"
              className="btn btn-soft btn-block"
              onClick={() => setKeysOpen(true)}
            >
              <Icon.Keyboard width={14} height={14} />
              Keyboard shortcuts
            </button>
          ) : null}
        </div>
      </Modal>
      {!isMobile ? (
        <KeyboardShortcutsModal open={keysOpen} onClose={() => setKeysOpen(false)} />
      ) : null}
    </>
  )
}
