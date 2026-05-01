import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { searchPlaces, reverseGeocode, type Place } from '../services/geocoding';

const SEARCH_DEBOUNCE_MS = 300;

export function LocationPrompt() {
  const location = useStore((s) => s.location);
  const dismissed = useStore((s) => s.locationPromptDismissed);
  const setLocation = useStore((s) => s.setLocation);
  const dismiss = useStore((s) => s.dismissLocationPrompt);

  if (location !== null || dismissed) return null;

  return <LocationPromptContent onSetLocation={setLocation} onDismiss={dismiss} />;
}

interface ContentProps {
  onSetLocation: (loc: { lat: number; lon: number; label?: string }) => void;
  onDismiss: () => void;
}

function LocationPromptContent({ onSetLocation, onDismiss }: ContentProps) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [latStr, setLatStr] = useState('');
  const [lonStr, setLonStr] = useState('');
  const [manualError, setManualError] = useState<string | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoBusy, setGeoBusy] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (search.trim().length < 2) {
      setResults([]);
      setSearchError(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      setSearchError(null);
      try {
        const r = await searchPlaces(search);
        setResults(r);
      } catch (e) {
        setSearchError((e as Error).message);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const onUseGeolocation = () => {
    if (!('geolocation' in navigator)) {
      setGeoError("Your browser doesn't expose geolocation.");
      return;
    }
    setGeoBusy(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lon } = pos.coords;
        const label = await reverseGeocode(lat, lon);
        onSetLocation(label ? { lat, lon, label } : { lat, lon });
        setGeoBusy(false);
      },
      () => {
        setGeoError("Couldn't get your location. Search by city or enter coordinates instead.");
        setGeoBusy(false);
      },
    );
  };

  const onSubmitManual = () => {
    const lat = Number.parseFloat(latStr);
    const lon = Number.parseFloat(lonStr);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setManualError('Latitude must be between -90 and 90.');
      return;
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      setManualError('Longitude must be between -180 and 180.');
      return;
    }
    setManualError(null);
    onSetLocation({ lat, lon });
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-white p-5 text-sm shadow-lg">
        <h2 className="mb-1 text-base font-semibold">Where are you?</h2>
        <p className="mb-4 text-xs text-neutral-600">
          We use your location to position the sun realistically. The app stores
          this only on your device.
        </p>

        <div className="mb-4 space-y-2">
          <button
            disabled={geoBusy}
            onClick={onUseGeolocation}
            className="w-full rounded bg-neutral-900 px-3 py-2 text-white hover:bg-neutral-800 disabled:opacity-50"
          >
            {geoBusy ? 'Locating…' : 'Use my location'}
          </button>
          {geoError ? <p className="text-xs text-rose-600">{geoError}</p> : null}
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-neutral-700">
            Search city
          </label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search city, town, or neighbourhood"
            className="w-full rounded border border-neutral-300 px-2 py-1.5"
          />
          {searching ? <p className="mt-1 text-xs text-neutral-500">Searching…</p> : null}
          {searchError ? <p className="mt-1 text-xs text-rose-600">{searchError}</p> : null}
          {results.length > 0 ? (
            <ul className="mt-1 max-h-40 overflow-y-auto rounded border border-neutral-200 bg-white text-xs">
              {results.map((r) => (
                <li key={`${r.lat},${r.lon}`}>
                  <button
                    onClick={() =>
                      onSetLocation({ lat: r.lat, lon: r.lon, label: r.label })
                    }
                    className="block w-full px-2 py-1 text-left hover:bg-neutral-100"
                  >
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <label className="text-xs font-medium text-neutral-700">
            Latitude
            <input
              type="number"
              step="0.0001"
              value={latStr}
              onChange={(e) => setLatStr(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5"
            />
          </label>
          <label className="text-xs font-medium text-neutral-700">
            Longitude
            <input
              type="number"
              step="0.0001"
              value={lonStr}
              onChange={(e) => setLonStr(e.target.value)}
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5"
            />
          </label>
          <button
            onClick={onSubmitManual}
            className="col-span-2 rounded border border-neutral-300 px-3 py-1.5 hover:bg-neutral-100"
          >
            Save coordinates
          </button>
          {manualError ? (
            <p className="col-span-2 text-xs text-rose-600">{manualError}</p>
          ) : null}
        </div>

        <button
          onClick={onDismiss}
          className="mx-auto block text-xs text-neutral-500 underline hover:text-neutral-700"
        >
          Skip — use default location
        </button>
      </div>
    </div>
  );
}
