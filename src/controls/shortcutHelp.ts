import { KEYBINDINGS, type KeybindingId } from './keybindings'

/**
 * Grouped, human-readable keyboard-shortcut reference for the "?" help overlay
 * (`ui/ShortcutsModal`). Single-key labels are sourced from {@link KEYBINDINGS}
 * so the overlay never drifts from the real bindings; modifiers / Shift variants
 * are documented in the description. Pure data — unit-tested for integrity.
 */

interface ShortcutRow {
  /** Key chips to render (each its own <kbd>), e.g. `['Ctrl/⌘', 'Z']`. */
  keys: string[]
  desc: string
}

export interface ShortcutGroup {
  title: string
  rows: ShortcutRow[]
}

/** Bare key label for a binding (strips the `Key` prefix): `'KeyR' → 'R'`. */
export function bindKey(id: KeybindingId): string {
  const code = KEYBINDINGS[id]
  return code.startsWith('Key') ? code.slice(3) : code
}

const MOD = 'Ctrl/⌘'

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Move & arrange',
    rows: [
      { keys: ['↑', '↓', '←', '→'], desc: 'Nudge selection (Shift: fine)' },
      { keys: [bindKey('rotate')], desc: 'Rotate 90° (Shift: 15°)' },
      { keys: [bindKey('flip')], desc: 'Flip left↔right (Shift: front↔back)' },
      { keys: [MOD, bindKey('duplicateSelected')], desc: 'Duplicate' },
      { keys: ['Alt', 'drag'], desc: 'Duplicate while dragging (Pro)' },
      { keys: [bindKey('deleteSelected')], desc: 'Delete selection' },
      { keys: [bindKey('tidyHome')], desc: 'Tidy — auto-arrange every room' },
    ],
  },
  {
    title: 'Edit',
    rows: [
      { keys: [MOD, bindKey('undo')], desc: 'Undo' },
      { keys: [MOD, 'Shift', bindKey('undo')], desc: 'Redo' },
      { keys: [MOD, bindKey('copySelected')], desc: 'Copy' },
      { keys: [MOD, bindKey('pasteClipboard')], desc: 'Paste' },
      { keys: [bindKey('deselect')], desc: 'Deselect / cancel' },
    ],
  },
  {
    title: 'View',
    rows: [
      { keys: [bindKey('toggleCameraMode')], desc: 'Orbit ↔ Walk camera' },
      { keys: [bindKey('topView')], desc: 'Top-down plan view' },
      { keys: [bindKey('resetView')], desc: 'Reset to 3D overview' },
      { keys: [bindKey('frameSelection')], desc: 'Frame the selection' },
      { keys: [bindKey('cyclePresetTime')], desc: 'Cycle time of day' },
      { keys: [bindKey('toggleMeasurements')], desc: 'Toggle measurements' },
    ],
  },
  {
    title: 'Panels & tools',
    rows: [
      { keys: ['⌘/Ctrl', 'K'], desc: 'Command palette' },
      { keys: [bindKey('toggleCatalog')], desc: 'Furniture catalog' },
      { keys: [bindKey('togglePlanEditor')], desc: '2D floor-plan editor' },
      { keys: ['?'], desc: 'This shortcuts overlay' },
    ],
  },
  {
    title: 'Walk mode',
    rows: [
      {
        keys: [
          bindKey('walkForward'),
          bindKey('walkLeft'),
          bindKey('walkBack'),
          bindKey('walkRight'),
        ],
        desc: 'Move around',
      },
      { keys: [bindKey('interact')], desc: 'Open a door / interact' },
    ],
  },
]
