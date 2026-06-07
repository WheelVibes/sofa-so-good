import { useStore } from '../state/store'
import { DOCS_URL } from './docsUrl'
import { Modal } from './Modal'
import { Icon } from './toolbar/icons'
import { useIsMobile } from './useIsMobile'

const SHORTCUTS: [string, string][] = [
  ['Command palette', '⌘K'],
  ['Search catalog', '/'],
  ['Toggle catalog', 'C'],
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
  ['Reset view', 'H'],
  ['Walk / orbit', 'V'],
  ['Time of day', 'T'],
  ['Undo / redo', '⌘Z'],
  ['Help', '?'],
]

const TIPS: [string, string][] = [
  [
    'Editing happens in the room editor — click a room’s floor (or the Edit a room button) to start.',
  ],
  [
    'Inside a room, drag a catalog card onto the floor to place it — press R while dragging to rotate.',
  ],
  ['Inside a room, click a wall or the floor to repaint or refinish it from the picker.'],
  ['Switch to Walk to feel the scale of the flat at eye level.'],
  ['Open the Appearance menu to switch between the four themes and light / dark.'],
  ['Rename any object from the inspector — the name shows in the Objects list.'],
  ['Set a budget target in the Shopping panel to track how far over / under you are.'],
  ['Switch dimensions to imperial in the Graphics panel; the whole UI follows.'],
  ['Save versions, then Compare any one to see what furniture changed vs now.'],
  ['Scene menu → Lighting moods previews the room at golden hour, a cosy evening, night…'],
  ['Measure something, then 📌 Pin it to keep the dimension on the design.'],
  ['In Walk, the minimap (bottom-right) shows where you are and which room you’re in.'],
  ['Scene menu → Backdrop swaps the surroundings: city, park, hills, or a clean studio.'],
  ['New here? Appearance menu → Simple hides the advanced tools for a calmer workspace.'],
] as unknown as [string, string][]

/** Help & keyboard-shortcut reference modal (toolbar `?`). On mobile (no
 *  hardware keyboard) the keyboard-shortcut section is omitted and the title
 *  drops the "& shortcuts" suffix. */
export function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const isMobile = useIsMobile()
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isMobile ? 'Help' : 'Help & shortcuts'}
      sub="Sofa So Good"
      panelId="helpPanel"
    >
      {!isMobile ? (
        <div className="sec" style={{ borderTop: 'none', paddingTop: 0 }}>
          <div className="sec-h">
            <span>Keyboard</span>
          </div>
          <div className="kbd-grid">
            {SHORTCUTS.map(([label, key]) => (
              <div className="kbd-row" key={label}>
                <span>{label}</span>
                <kbd>{key}</kbd>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="sec" style={isMobile ? { borderTop: 'none', paddingTop: 0 } : undefined}>
        <div className="sec-h">
          <span>Tips</span>
        </div>
        <ul className="help-list">
          {TIPS.map(([tip]) => (
            <li key={tip}>
              <Icon.Check className="icn" width={16} height={16} />
              <span>{tip}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="sec">
        <div className="sec-h">
          <span>Documentation</span>
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
          style={{ marginBottom: 'var(--s-3)' }}
          onClick={() => {
            const s = useStore.getState()
            s.setHelpOpen(false)
            s.setLoginOpen(true)
          }}
        >
          <Icon.Eye width={14} height={14} />
          {useStore.getState().currentUser ? 'Account' : 'Sign in'}
        </button>
        <ul className="help-list">
          <li>
            <Icon.Book className="icn" width={16} height={16} />
            <span>
              Read the{' '}
              <a href={DOCS_URL} target="_blank" rel="noopener noreferrer">
                full user guide ↗
              </a>{' '}
              for step-by-step walkthroughs and examples.
            </span>
          </li>
        </ul>
      </div>
    </Modal>
  )
}
