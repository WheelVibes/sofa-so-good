export const KEYBINDINGS = {
  toggleMeasurements: 'KeyM',
  toggleCameraMode: 'KeyV',
  cyclePresetTime: 'KeyT',
  walkForward: 'KeyW',
  walkBack: 'KeyS',
  walkLeft: 'KeyA',
  walkRight: 'KeyD',
  interact: 'KeyE',
  // Editor (Phase 2 — only active in orbit mode):
  rotate: 'KeyR', // R: 90°  |  Shift+R: 15°
  flip: 'KeyF', // F: flip left↔right | Shift+F: flip front↔back
  deleteSelected: 'Delete',
  copySelected: 'KeyC', // Ctrl/Cmd+C
  pasteClipboard: 'KeyV', // Ctrl/Cmd+V
  duplicateSelected: 'KeyD', // Ctrl/Cmd+D — copy + paste in one shortcut
  undo: 'KeyZ', // Ctrl/Cmd+Z   |  Shift+ → redo
  redo: 'KeyY', // Ctrl/Cmd+Y   (also Ctrl/Cmd+Shift+Z via undo)
  deselect: 'Escape',
  toggleCatalog: 'KeyC',
  toggleBudget: 'KeyB', // B: budget / shopping panel (orbit views, feature-gated)
  topView: 'KeyO', // O: top-down plan view
  resetView: 'KeyH', // H: reset to the 3D overview (Home)
  tidyHome: 'KeyL', // L: auto-arrange every room (cLeanup)
  nudgeUp: 'ArrowUp',
  nudgeDown: 'ArrowDown',
  nudgeLeft: 'ArrowLeft',
  nudgeRight: 'ArrowRight',
} as const

/** Press-and-hold nudge speed in metres/second. Shift switches to a
 *  finer speed for precise adjustments. */
export const NUDGE_SPEED = 1.5
export const NUDGE_FINE_SPEED = 0.4

export type KeybindingId = keyof typeof KEYBINDINGS

/** Editor rotation step in radians. Shift modifier overrides to 15°
 *  for fine-tuning. */
export const ROTATE_STEP = Math.PI / 2
export const ROTATE_FINE_STEP = (Math.PI / 180) * 15
