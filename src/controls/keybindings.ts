export const KEYBINDINGS = {
  toggleMeasurements: 'KeyM',
  toggleCameraMode: 'KeyV',
  cycleTimeOfDay: 'KeyT',
  walkForward: 'KeyW',
  walkBack: 'KeyS',
  walkLeft: 'KeyA',
  walkRight: 'KeyD',
  interact: 'KeyE',
  // Editor (Phase 2 — only active in orbit mode):
  rotate: 'KeyR',          // R: 90°  |  Shift+R: 15°
  deleteSelected: 'Delete',
  deselect: 'Escape',
  toggleCatalog: 'KeyC',
} as const;

export type KeybindingId = keyof typeof KEYBINDINGS;

/** Editor rotation step in radians. Shift modifier overrides to 15°
 *  for fine-tuning. */
export const ROTATE_STEP = Math.PI / 2;
export const ROTATE_FINE_STEP = (Math.PI / 180) * 15;
