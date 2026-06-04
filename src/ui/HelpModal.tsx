import { Modal } from './Modal'
import { Icon } from './toolbar/icons'

const SHORTCUTS: [string, string][] = [
  ['Command palette', '⌘K'],
  ['Toggle catalog', 'C'],
  ['Rotate selection', 'R'],
  ['Flip selection', 'F'],
  ['Duplicate', '⌘D'],
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
] as unknown as [string, string][]

/** Help & keyboard-shortcut reference modal (toolbar `?`). */
export function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Help & shortcuts"
      sub="Sofa So Good"
      panelId="helpPanel"
    >
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
      <div className="sec">
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
    </Modal>
  )
}
