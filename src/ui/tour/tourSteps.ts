/** One step of the guided product tour. `target` is a CSS selector for the UI
 *  element to spotlight; when absent (or not found, e.g. hidden on mobile) the
 *  card centres with no spotlight. When `action` is set the step is completed by
 *  clicking the spotlighted control itself (so the user performs the real action
 *  to move on) — no "Next" button is shown. Otherwise a "Next" button advances,
 *  and clicking the spotlight (if any) also moves forward. Steps follow the order
 *  a user would take to build a design from scratch. */
export interface TourStep {
  id: string
  title: string
  body: string
  target?: string
  /** Force interaction: the only way forward is clicking the spotlighted target
   *  (or, on mobile, the menu it lives in). No Next button. */
  action?: boolean
}

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Sofa So Good',
    body: "Let's design your flat together — a quick, hands-on tour. We'll point at the real controls and you'll click them yourself. You can skip anytime.",
  },
  {
    id: 'view',
    title: '1 · Look around',
    body: 'This is your View control. Switch between Orbit (look around) and Walk (first-person), jump to a top-down plan, or reset the framing. Have a peek, then carry on.',
    target: '[aria-label="View"]',
  },
  {
    id: 'edit',
    title: '2 · Step into a room',
    body: 'Open the Edit menu — this is where you step into a room to furnish it, or open the floor-plan editor to reshape walls. Go ahead and click Edit.',
    target: '[aria-label="Edit"]',
    action: true,
  },
  {
    id: 'edit-room',
    title: '3 · Edit a room',
    body: 'Choose “Edit a room” to dive in. Furnishing, customising and finishes all happen inside the room editor — the overview is just for looking around.',
    target: '[aria-label="Edit a room"]',
    action: true,
  },
  {
    id: 'furniture',
    title: '4 · Add furniture',
    body: 'Open the Catalog to browse beds, sofas, tables and more, then drag a piece onto the floor — or tap a card, then tap where it should go. Click Catalog to open it.',
    target: '[aria-label="Catalog"]',
    action: true,
  },
  {
    id: 'customize',
    title: '5 · Move & customise',
    body: 'Click any item to select it: drag to move, use the on-floor ring (or R) to rotate, and recolour or resize it in the inspector on the right.',
  },
  {
    id: 'finishes',
    title: '6 · Paint walls & floors',
    body: 'Click a wall or the floor to open the finish picker — choose paints, wallpapers, wood, tile and more, per room or for the whole home.',
  },
  {
    id: 'scene',
    title: '7 · Set the mood',
    body: 'The Scene menu changes the time of day (drag the slider from morning to night), tries a lighting mood, and picks a backdrop — city, park, hills or studio.',
    target: '[aria-label="Scene"]',
  },
  {
    id: 'finish',
    title: "You're all set",
    body: "That's the essentials! From Appearance you can switch themes, light/dark, graphics quality, and toggle Simple/Pro for the advanced tools. Replay this tour anytime from Help (?).",
    target: '[aria-label="Appearance"]',
  },
]
