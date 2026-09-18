// @vitest-environment happy-dom
/**
 * W8 (walk-photoreal review, 2026-09-19) — the walk HUD prompt read a light
 * fixture's PER-ITEM `lightOn` gate alone, so it could offer "Turn off
 * ceiling light" while the room was visibly dark because the scene-wide
 * `lightsMode` switch was off (`FurnitureLights.tsx`'s `fixturesLevel`
 * returns exactly 0 whenever `lightsMode !== 'on'`, so toggling the item's
 * own flag in that state is a real write with no visible effect). Fixed by
 * suppressing the prompt entirely while the global switch is off, rather
 * than mislabel a dead interaction.
 */
import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../state/store'
import { LightPrompt } from './LightPrompt'

beforeEach(() => {
  useStore.getState().__resetForTest?.()
  useStore.setState({ cameraMode: 'firstPerson' })
})

describe('LightPrompt — suppressed while the scene-wide switch is off', () => {
  it('renders nothing when lightsMode is off, even for a default-on fixture nearby', () => {
    const id = useStore
      .getState()
      .addItem({ defId: 'ceiling-light', position: [0, 0], rotation: 0, props: {} })
    useStore.setState({ lightsMode: 'off', nearbyLightId: id })
    const { container } = render(<LightPrompt />)
    expect(container.querySelector('button')).toBeNull()
  })

  it('renders "Turn off ceiling light" once the scene-wide switch is on', () => {
    const id = useStore
      .getState()
      .addItem({ defId: 'ceiling-light', position: [0, 0], rotation: 0, props: {} })
    useStore.setState({ lightsMode: 'on', nearbyLightId: id })
    const { container } = render(<LightPrompt />)
    expect(container.querySelector('button')?.textContent).toContain('Turn off ceiling light')
  })

  it('still renders "Turn on" for a fixture explicitly switched off, while lights are on', () => {
    const id = useStore.getState().addItem({
      defId: 'ceiling-light',
      position: [0, 0],
      rotation: 0,
      props: { lightOn: 'no' },
    })
    useStore.setState({ lightsMode: 'on', nearbyLightId: id })
    const { container } = render(<LightPrompt />)
    expect(container.querySelector('button')?.textContent).toContain('Turn on ceiling light')
  })

  it('renders nothing with no nearby light regardless of lightsMode', () => {
    useStore.setState({ lightsMode: 'on', nearbyLightId: null })
    expect(render(<LightPrompt />).container.querySelector('button')).toBeNull()
  })
})
