// @vitest-environment happy-dom
/**
 * Behavioural test for the walk-mode minimap tap-to-teleport (MINIMAP-JUMP).
 * The coordinate-inversion + room-clamp math is unit-tested in isolation in
 * `walk/minimapTeleport.test.ts`; this test only checks the wiring — a click
 * on the minimap SVG resolves a world target and hands it to the
 * `walkTeleport` request channel, gated by the `minimapTeleport` flag (both
 * Simple and Pro, since it's a simple-tier flag present in both modes).
 */
import { fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hdbMaisonette } from '../floorplan/templates/hdb'
import type { FurnitureItem } from '../furniture/types'
import { WALK_PLAYER_RADIUS } from '../scene/cameras/walkCameraSettings'
import { requestWalkTeleport } from '../scene/cameras/walkTeleport'
import { useStore } from '../state/store'
import { Minimap } from './Minimap'
import { minimapLevelView } from './walk/minimapLevel'
import { resolveMinimapTeleport } from './walk/minimapTeleport'

vi.mock('../scene/cameras/walkTeleport', () => ({
  requestWalkTeleport: vi.fn(),
}))

function setFlag(on: boolean) {
  useStore.setState({ featureFlags: { ...useStore.getState().featureFlags, minimapTeleport: on } })
}

beforeEach(() => {
  useStore.getState().__resetForTest?.()
  useStore.setState({ cameraMode: 'firstPerson' })
  vi.mocked(requestWalkTeleport).mockClear()
})

afterEach(() => {
  useStore.setState({ cameraMode: 'orbit' })
})

describe('minimapTeleport flag', () => {
  it('is a simple-tier default-on flag, present in BOTH Simple and Pro', () => {
    useStore.getState().setUiMode('simple')
    useStore.getState().reresolveFeatureFlags()
    expect(useStore.getState().featureFlags.minimapTeleport).toBe(true)

    useStore.getState().setUiMode('pro')
    useStore.getState().reresolveFeatureFlags()
    expect(useStore.getState().featureFlags.minimapTeleport).toBe(true)
  })
})

describe('Minimap tap-to-teleport gating', () => {
  it('renders nothing outside walk mode regardless of the flag', () => {
    setFlag(true)
    useStore.setState({ cameraMode: 'orbit' })
    const { container } = render(<Minimap />)
    expect(container.firstChild).toBeNull()
  })

  it('a click on the minimap requests a teleport when the flag is on', () => {
    setFlag(true)
    const { container } = render(<Minimap />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('aria-label')).toMatch(/tap/i)
    // happy-dom's getBoundingClientRect defaults to an all-zero rect, which
    // this component treats as "no size" and no-ops — stub a plausible
    // .minimap box so the pointer→world math has something to invert.
    svg!.getBoundingClientRect = () => ({ left: 0, top: 0, width: 168, height: 132 }) as DOMRect
    fireEvent.click(svg!, { clientX: 84, clientY: 66 })
    expect(requestWalkTeleport).toHaveBeenCalledTimes(1)
    const [x, z, yaw] = vi.mocked(requestWalkTeleport).mock.calls[0]!
    expect(Number.isFinite(x)).toBe(true)
    expect(Number.isFinite(z)).toBe(true)
    expect(Number.isFinite(yaw)).toBe(true)
  })

  it('does nothing when the flag is off (no cursor affordance, no request)', () => {
    setFlag(false)
    const { container } = render(<Minimap />)
    const svg = container.querySelector('svg')
    expect(svg?.classList.contains('mm-tap')).toBe(false)
    expect(svg?.getAttribute('aria-label')).toBeNull()
    svg!.getBoundingClientRect = () => ({ left: 0, top: 0, width: 168, height: 132 }) as DOMRect
    fireEvent.click(svg!, { clientX: 84, clientY: 66 })
    expect(requestWalkTeleport).not.toHaveBeenCalled()
  })
})

/**
 * MINIMAP-LEVEL (v0.31.5.96) — the map must follow the walker upstairs.
 *
 * Before the fix the component read `state.floorPlan`/`state.items` raw, so on
 * `tpl-hdb-maisonette` standing in the upper `emu-master` it drew the GROUND
 * shell and labelled it "LIVING / DINING". The two storeys differ in size (7
 * ground rooms / 13 walls vs 8 upper rooms / 11 walls), so counting the drawn
 * shapes discriminates the storeys without reaching into component internals.
 */
describe('MINIMAP-LEVEL: the minimap draws the storey being walked', () => {
  /** Put the maisonette in the store with one item per storey. */
  function setUpMaisonette(viewLevelId: string) {
    const item = (id: string, levelId: string | undefined, x: number, z: number) => ({
      id,
      defId: 'sofa-3seat' as FurnitureItem['defId'],
      position: [x, z] as [number, number],
      rotation: 0,
      props: {},
      levelId,
    })
    useStore.setState({
      floorPlan: hdbMaisonette(),
      viewLevelId,
      items: [
        item('mm-ground-item', undefined, 1.5, 1.5),
        item('mm-upper-item', 'em-up', 2.5, 2.5),
      ],
    })
  }

  const drawn = (container: HTMLElement) => ({
    rooms: container.querySelectorAll('path.mm-room').length,
    walls: container.querySelectorAll('line[stroke="var(--text-3)"]').length,
    dots: container.querySelectorAll('circle:not(.mm-cam-halo)').length,
  })

  for (const mode of ['simple', 'pro'] as const) {
    it(`draws the UPPER storey + only its furniture in ${mode} mode`, () => {
      useStore.getState().setUiMode(mode)
      useStore.getState().reresolveFeatureFlags()
      setUpMaisonette('em-up')
      const { container } = render(<Minimap />)
      const d = drawn(container)
      // Upper storey: 8 rooms / 11 walls. The ground storey's 7 / 13 is what
      // the old code drew, so these two numbers ARE the regression.
      expect(d.rooms).toBe(8)
      expect(d.walls).toBe(11)
      // Only the item tagged onto `em-up` — the ground item must not be plotted.
      expect(d.dots).toBe(1)
    })
  }

  it("CONTROL: the same plan with 'all' selected draws the GROUND storey", () => {
    // Differs from the arm above in exactly one variable: `viewLevelId`.
    setUpMaisonette('all')
    const { container } = render(<Minimap />)
    const d = drawn(container)
    expect(d.rooms).toBe(7)
    expect(d.walls).toBe(13)
    expect(d.dots).toBe(1)
  })

  it('a tap upstairs resolves against the UPPER storey, not the ground plan', () => {
    // The teleport helper took the same raw plan, so a tap upstairs used to land
    // on whatever GROUND room sat under the pointer.
    //
    // "Is the target inside an upper room?" is NOT a valid check here: the two
    // storeys share the same XZ footprint, so a ground-room target frequently
    // lands inside an upper room by coincidence (measured — that phrasing passed
    // against the unfixed code). Instead resolve the SAME pointer against both
    // storeys explicitly and require (a) that they genuinely disagree, so the
    // check can't pass vacuously, and (b) that the component chose the upper one.
    setFlag(true)
    setUpMaisonette('em-up')
    const { container } = render(<Minimap />)
    const svg = container.querySelector('svg')!
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 168, height: 132 }) as DOMRect
    // This pointer is chosen because the two storeys DISAGREE there (upper
    // 4.86,0.92 vs ground 4.65,0.92) — the centre of the map does not, since the
    // storeys share a footprint, and a centre tap made this test vacuous.
    fireEvent.click(svg, { clientX: 92, clientY: 20 })
    expect(requestWalkTeleport).toHaveBeenCalledTimes(1)
    const [x, z] = vi.mocked(requestWalkTeleport).mock.calls[0]!

    const plan = hdbMaisonette()
    const onUpper = minimapLevelView(plan, 'em-up').plan
    const onGround = minimapLevelView(plan, 'all').plan
    const at = (p: typeof plan) => {
      const r = resolveMinimapTeleport(p, x, z, WALK_PLAYER_RADIUS)
      return r ? `${r.x.toFixed(3)},${r.z.toFixed(3)}` : 'none'
    }
    // Control: the two storeys must give different answers for this pointer,
    // otherwise the assertion below proves nothing.
    expect(at(onUpper)).not.toBe(at(onGround))
    expect(`${x.toFixed(3)},${z.toFixed(3)}`).toBe(at(onUpper))
  })
})
