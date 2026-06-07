/** One step of the guided product tour. `target` is a CSS selector for the UI
 *  element to spotlight; when absent (or not found, e.g. hidden on mobile) the
 *  card centres with no spotlight. Steps follow the order a user would take to
 *  build a design from scratch. */
export interface TourStep {
  id: string
  title: string
  body: string
  target?: string
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Sofa So Good',
    body: "Let's design your flat in a few steps — the order most people follow, from the empty space to a furnished, walk-through home. You can skip anytime.",
  },
  {
    id: 'layout',
    title: '1 · Shape the space',
    body: 'Open Floor plan to draw or tweak walls and rooms and add doors & windows — or start from a ready-made apartment template. (Your flat already has a layout to begin with.)',
    target: '[aria-label="Floor plan"]',
  },
  {
    id: 'edit-room',
    title: '2 · Step into a room',
    body: 'Click Edit a room — or just click a room’s floor — to start designing. Furnishing, customising and finishes all happen inside the room editor; the overview is for looking around.',
    target: '[aria-label="Edit a room"]',
  },
  {
    id: 'furniture',
    title: '3 · Add furniture',
    body: 'Inside a room, open the Catalog (press C) to browse beds, sofas, tables and more, then drag a piece onto the floor — or tap a card, then tap where it should go.',
  },
  {
    id: 'customize',
    title: '4 · Move & customise',
    body: 'In the room editor, click any item to select it: drag to move, use the on-floor ring (or R) to rotate, and recolour or resize it in the inspector on the right.',
  },
  {
    id: 'finishes',
    title: '5 · Paint walls & floors',
    body: 'Inside a room, click a wall or the floor to open the finish picker — choose paints, wallpapers, wood, tile and more, per room or for the whole home.',
  },
  {
    id: 'walk',
    title: '6 · Walk through it',
    body: 'Use the camera control to switch to Walk and explore your home at eye level — move with WASD or the on-screen joystick, and look around.',
    target: '[aria-label="Camera mode"]',
  },
  {
    id: 'time',
    title: '7 · Set the mood',
    body: 'Use the Scene menu to change the time of day (morning to night), try a lighting mood, and pick a backdrop — city, park, hills or a clean studio.',
    target: '[aria-label="Scene"]',
  },
  {
    id: 'finish',
    title: "You're all set",
    body: "That's the essentials! When you want more — analysis tools, precise controls and the floor-plan tools — switch to Pro from Appearance. Replay this tour anytime from Help (?).",
    target: '[aria-label="Appearance"]',
  },
]
