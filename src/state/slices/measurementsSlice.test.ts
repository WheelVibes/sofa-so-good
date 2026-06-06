import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from '../store'

describe('tape measure', () => {
  beforeEach(() => {
    useStore.setState({ tapeMode: false, tapePoints: [] } as never)
  })

  it('toggles mode and clears points when turning off', () => {
    const s = () => useStore.getState()
    s().toggleTapeMode()
    expect(s().tapeMode).toBe(true)
    s().addTapePoint([1, 1])
    s().toggleTapeMode() // off → clears
    expect(s().tapeMode).toBe(false)
    expect(s().tapePoints).toEqual([])
  })

  it('collects two points then starts fresh on the third click', () => {
    const s = () => useStore.getState()
    s().addTapePoint([0, 0])
    s().addTapePoint([3, 4])
    expect(s().tapePoints).toEqual([
      [0, 0],
      [3, 4],
    ])
    // A further click begins a new measurement from that point.
    s().addTapePoint([9, 9])
    expect(s().tapePoints).toEqual([[9, 9]])
  })

  it('clearTape empties the points', () => {
    const s = () => useStore.getState()
    s().addTapePoint([1, 2])
    s().clearTape()
    expect(s().tapePoints).toEqual([])
  })

  it('setTapeShape switches shape and clears in-progress points', () => {
    const s = () => useStore.getState()
    s().addTapePoint([0, 0])
    s().setTapeShape('rect')
    expect(s().tapeShape).toBe('rect')
    expect(s().tapePoints).toEqual([])
    s().setTapeShape('line')
    expect(s().tapeShape).toBe('line')
  })
})

describe('measurement units', () => {
  beforeEach(() => useStore.setState({ units: 'metric' } as never))

  it('defaults to metric', () => {
    expect(useStore.getState().units).toBe('metric')
  })

  it('setUnits switches between metric and imperial', () => {
    useStore.getState().setUnits('imperial')
    expect(useStore.getState().units).toBe('imperial')
    useStore.getState().setUnits('metric')
    expect(useStore.getState().units).toBe('metric')
  })
})
