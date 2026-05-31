import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStore } from '../state/store'
import { LocationPrompt } from './LocationPrompt'

vi.mock('../services/geocoding', () => ({
  searchPlaces: vi.fn(),
  reverseGeocode: vi.fn(),
}))

import { reverseGeocode, searchPlaces } from '../services/geocoding'

const mockSearchPlaces = vi.mocked(searchPlaces)
const mockReverseGeocode = vi.mocked(reverseGeocode)

describe('LocationPrompt', () => {
  beforeEach(() => {
    useStore.getState().__resetForTest()
    mockSearchPlaces.mockReset()
    mockReverseGeocode.mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not render once a location is set', () => {
    useStore.getState().setLocation({ lat: 1.35, lon: 103.82 })
    const { container } = render(<LocationPrompt />)
    expect(container.firstChild).toBeNull()
  })

  it('does not render once the prompt is dismissed', () => {
    useStore.getState().dismissLocationPrompt()
    const { container } = render(<LocationPrompt />)
    expect(container.firstChild).toBeNull()
  })

  it('renders when location is null and prompt is not dismissed', () => {
    render(<LocationPrompt />)
    expect(screen.getByText(/use my location/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/search city/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/latitude/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/longitude/i)).toBeInTheDocument()
    expect(screen.getByText(/skip/i)).toBeInTheDocument()
  })

  it('clicking Skip dismisses the prompt', () => {
    render(<LocationPrompt />)
    fireEvent.click(screen.getByText(/skip/i))
    expect(useStore.getState().locationPromptDismissed).toBe(true)
    expect(useStore.getState().location).toBeNull()
  })

  it('manual lat/lon submit stores the location', () => {
    render(<LocationPrompt />)
    fireEvent.change(screen.getByLabelText(/latitude/i), { target: { value: '51.5' } })
    fireEvent.change(screen.getByLabelText(/longitude/i), { target: { value: '0' } })
    fireEvent.click(screen.getByText(/save coordinates/i))
    expect(useStore.getState().location).toEqual({ lat: 51.5, lon: 0 })
  })

  it('rejects out-of-range manual lat/lon', () => {
    render(<LocationPrompt />)
    fireEvent.change(screen.getByLabelText(/latitude/i), { target: { value: '200' } })
    fireEvent.change(screen.getByLabelText(/longitude/i), { target: { value: '0' } })
    fireEvent.click(screen.getByText(/save coordinates/i))
    expect(useStore.getState().location).toBeNull()
    expect(screen.getByText(/latitude must be between/i)).toBeInTheDocument()
  })

  it('city search shows Nominatim results and stores the picked one', async () => {
    mockSearchPlaces.mockResolvedValueOnce([
      { label: 'London, UK', lat: 51.5, lon: -0.13 },
      { label: 'London, Ontario', lat: 42.99, lon: -81.25 },
    ])
    vi.useFakeTimers()
    render(<LocationPrompt />)
    fireEvent.change(screen.getByPlaceholderText(/search city/i), {
      target: { value: 'London' },
    })
    // Advance debounce timer.
    vi.advanceTimersByTime(400)
    await vi.waitFor(() => expect(mockSearchPlaces).toHaveBeenCalledWith('London'))
    vi.useRealTimers()

    const result = await screen.findByText(/London, UK/i)
    fireEvent.click(result)
    expect(useStore.getState().location).toEqual({
      lat: 51.5,
      lon: -0.13,
      label: 'London, UK',
    })
  })

  it('uses geolocation API when "Use my location" is clicked', async () => {
    const mockGetCurrentPosition = vi.fn(
      (success: PositionCallback, _err?: PositionErrorCallback | null) => {
        success({
          coords: {
            latitude: 1.35,
            longitude: 103.82,
            accuracy: 10,
            altitude: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            toJSON: () => ({}),
          },
          timestamp: Date.now(),
          toJSON: () => ({}),
        } as GeolocationPosition)
      },
    )
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      value: { getCurrentPosition: mockGetCurrentPosition },
      configurable: true,
    })
    mockReverseGeocode.mockResolvedValueOnce('Singapore')

    render(<LocationPrompt />)
    fireEvent.click(screen.getByText(/use my location/i))
    await waitFor(() => {
      expect(useStore.getState().location).toEqual({
        lat: 1.35,
        lon: 103.82,
        label: 'Singapore',
      })
    })
  })

  it('falls back gracefully when geolocation is denied', async () => {
    const mockGetCurrentPosition = vi.fn(
      (_success: PositionCallback, err?: PositionErrorCallback | null) => {
        err?.({
          code: 1,
          message: 'denied',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        } as GeolocationPositionError)
      },
    )
    Object.defineProperty(globalThis.navigator, 'geolocation', {
      value: { getCurrentPosition: mockGetCurrentPosition },
      configurable: true,
    })

    render(<LocationPrompt />)
    fireEvent.click(screen.getByText(/use my location/i))
    await screen.findByText(/couldn't get your location/i)
    expect(useStore.getState().location).toBeNull()
  })
})
