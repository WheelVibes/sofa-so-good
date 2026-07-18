// @vitest-environment happy-dom
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../../../state/store'
import { SceneMenu } from './SceneMenu'

/** UX round-3 #3: the Scene menu's one-tap lighting-mood chip row
 *  (Reading / Movie night / Entertaining / Romantic + Normal), gated by the
 *  `lightMoodPresets` flag (simple tier — on by default in both modes). */
describe('SceneMenu lighting mood presets (lightMoodPresets)', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
  })

  const openMenu = () => {
    render(<SceneMenu />)
    fireEvent.click(screen.getByRole('button', { name: /scene/i }))
  }

  it('shows the Mood row + all five presets when the flag is on', () => {
    useStore.getState().setFeatureFlag('lightMoodPresets', true)
    openMenu()
    expect(screen.getByText('Mood')).toBeInTheDocument()
    for (const label of ['Normal', 'Reading', 'Movie night', 'Entertaining', 'Romantic']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('hides the Mood row when the flag is off', () => {
    useStore.getState().setFeatureFlag('lightMoodPresets', false)
    openMenu()
    expect(screen.queryByText('Mood')).not.toBeInTheDocument()
  })

  it('clicking a preset chip updates the store', () => {
    useStore.getState().setFeatureFlag('lightMoodPresets', true)
    openMenu()
    expect(useStore.getState().lightMood).toBe('none')
    fireEvent.click(screen.getByText('Movie night'))
    expect(useStore.getState().lightMood).toBe('movie')
  })
})
