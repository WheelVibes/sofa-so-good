import { useEffect, useRef, useState } from 'react'
import { type Place, reverseGeocode, searchPlaces } from '../services/geocoding'
import { useStore } from '../state/store'
import { Icon } from './toolbar/icons'

const SEARCH_DEBOUNCE_MS = 300

export function LocationPrompt() {
  const location = useStore((s) => s.location)
  const dismissed = useStore((s) => s.locationPromptDismissed)
  const setLocation = useStore((s) => s.setLocation)
  const dismiss = useStore((s) => s.dismissLocationPrompt)
  // Don't stack the location modal on top of the first-run onboarding carousel or
  // the product tour. It surfaces after both overlays are dismissed.
  const onboardingOpen = useStore((s) => s.onboardingOpen)
  const tourOpen = useStore((s) => s.tourOpen)

  if (location !== null || dismissed || onboardingOpen || tourOpen) return null

  return <LocationPromptContent onSetLocation={setLocation} onDismiss={dismiss} />
}

interface ContentProps {
  onSetLocation: (loc: { lat: number; lon: number; label?: string }) => void
  onDismiss: () => void
}

function LocationPromptContent({ onSetLocation, onDismiss }: ContentProps) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Place[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [latStr, setLatStr] = useState('')
  const [lonStr, setLonStr] = useState('')
  const [manualError, setManualError] = useState<string | null>(null)
  const [geoError, setGeoError] = useState<string | null>(null)
  const [geoBusy, setGeoBusy] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (search.trim().length < 2) {
      setResults([])
      setSearchError(null)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      setSearchError(null)
      try {
        const r = await searchPlaces(search)
        setResults(r)
      } catch (e) {
        setSearchError((e as Error).message)
        setResults([])
      } finally {
        setSearching(false)
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  const onUseGeolocation = () => {
    if (!('geolocation' in navigator)) {
      setGeoError("Your browser doesn't expose geolocation.")
      return
    }
    setGeoBusy(true)
    setGeoError(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords
        const label = await reverseGeocode(lat, lon)
        onSetLocation(label ? { lat, lon, label } : { lat, lon })
        setGeoBusy(false)
      },
      () => {
        setGeoError("Couldn't get your location. Search by city or enter coordinates instead.")
        setGeoBusy(false)
      },
    )
  }

  const onSubmitManual = () => {
    const lat = Number.parseFloat(latStr)
    const lon = Number.parseFloat(lonStr)
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setManualError('Latitude must be between -90 and 90.')
      return
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      setManualError('Longitude must be between -180 and 180.')
      return
    }
    setManualError(null)
    onSetLocation({ lat, lon })
  }

  return (
    <div className="modal-overlay">
      <div className="panel" style={{ width: 'var(--modal-sm)' }}>
        <div className="panel-head">
          <div>
            <div className="panel-title">Where are you?</div>
            <div className="panel-sub">Sun position</div>
          </div>
        </div>
        <hr className="hr" />
        <div className="panel-body">
          <p
            style={{
              fontSize: 'var(--t-xs)',
              color: 'var(--text-2)',
              lineHeight: 1.5,
              margin: '0 0 var(--s-4)',
            }}
          >
            We use your location to position the sun realistically. The app stores this only on your
            device.
          </p>

          <button
            type="button"
            disabled={geoBusy}
            onClick={onUseGeolocation}
            className="btn btn-accent btn-block"
          >
            <Icon.Pin width={14} height={14} />
            {geoBusy ? 'Locating…' : 'Use my location'}
          </button>
          {geoError ? (
            <p style={{ fontSize: 'var(--t-xs)', color: 'var(--danger)', marginTop: 'var(--s-2)' }}>
              {geoError}
            </p>
          ) : null}

          <div className="sec">
            <div className="sec-h">
              <span>Search city</span>
            </div>
            <div className="field">
              <Icon.Search width={16} height={16} className="icn" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search city, town, or neighbourhood"
                className="input"
              />
            </div>
            {searching ? (
              <p
                style={{ fontSize: 'var(--t-xs)', color: 'var(--text-3)', marginTop: 'var(--s-2)' }}
              >
                Searching…
              </p>
            ) : null}
            {searchError ? (
              <p
                style={{ fontSize: 'var(--t-xs)', color: 'var(--danger)', marginTop: 'var(--s-2)' }}
              >
                {searchError}
              </p>
            ) : null}
            {results.length > 0 ? (
              <ul
                style={{
                  listStyle: 'none',
                  margin: 'var(--s-3) 0 0',
                  padding: 0,
                  maxHeight: 160,
                  overflowY: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-2)',
                }}
              >
                {results.map((r) => (
                  <li key={`${r.lat},${r.lon}`}>
                    <button
                      type="button"
                      onClick={() => onSetLocation({ lat: r.lat, lon: r.lon, label: r.label })}
                      className="menu-item"
                    >
                      <span className="mi-main">{r.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          <div className="sec">
            <div className="sec-h">
              <span>Coordinates</span>
            </div>
            <div className="transform-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label className="num">
                <span>Latitude</span>
                <input
                  type="number"
                  step="0.0001"
                  value={latStr}
                  onChange={(e) => setLatStr(e.target.value)}
                  className="mono"
                />
              </label>
              <label className="num">
                <span>Longitude</span>
                <input
                  type="number"
                  step="0.0001"
                  value={lonStr}
                  onChange={(e) => setLonStr(e.target.value)}
                  className="mono"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={onSubmitManual}
              className="btn btn-soft btn-block"
              style={{ marginTop: 'var(--s-3)' }}
            >
              Save coordinates
            </button>
            {manualError ? (
              <p
                style={{ fontSize: 'var(--t-xs)', color: 'var(--danger)', marginTop: 'var(--s-2)' }}
              >
                {manualError}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onDismiss}
            className="btn btn-block"
            style={{ marginTop: 'var(--s-2)' }}
          >
            Skip — use default location
          </button>
        </div>
      </div>
    </div>
  )
}
