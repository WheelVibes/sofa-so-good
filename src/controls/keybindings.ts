export const KEYBINDINGS = {
  toggleMeasurements: 'KeyM',
  toggleCameraMode: 'KeyV',
  cycleTimeOfDay: 'KeyT',
  walkForward: 'KeyW',
  walkBack: 'KeyS',
  walkLeft: 'KeyA',
  walkRight: 'KeyD',
  interact: 'KeyE',
} as const;

export type KeybindingId = keyof typeof KEYBINDINGS;
