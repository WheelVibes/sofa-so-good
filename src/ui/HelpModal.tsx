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
  ['Nudge selection', '↑ ↓ ← →'],
  ['Move / camera tool', 'G'],
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
  ['Drag a catalog card onto the floor to place it — press R while dragging to rotate.'],
  ['Click a wall or the floor to repaint or refinish it from the picker.'],
  ['Switch to Walk to feel the scale of the flat at eye level.'],
  ['Open the Appearance menu to switch between the four themes and light / dark.'],
  ['Rename any object from the inspector — the name shows in the Objects list.'],
  ['Set a budget target in the Shopping panel to track how far over / under you are.'],
  ['Switch dimensions to imperial in the Graphics panel; the whole UI follows.'],
  ['Save versions, then Compare any one to see what furniture changed vs now.'],
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
