export const KEYBINDINGS = {
  toggleMeasurements: 'KeyM',
  toggleCameraMode: 'KeyV',
  walkForward: 'KeyW',
  walkBack: 'KeyS',
  walkLeft: 'KeyA',
  walkRight: 'KeyD',
} as const;

export type KeybindingId = keyof typeof KEYBINDINGS;
