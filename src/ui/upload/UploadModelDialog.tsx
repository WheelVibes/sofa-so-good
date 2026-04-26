import { useState } from 'react';
import {
  FURNITURE_CATEGORIES,
  type FurnitureCategory,
} from '../../furniture/types';
import { persistUserGlb } from '../../furniture/upload/persist';

interface UploadModelDialogProps {
  open: boolean;
  onClose: () => void;
}

const CATEGORY_LABEL: Record<FurnitureCategory, string> = {
  beds: 'Beds',
  seating: 'Seating',
  tables: 'Tables',
  storage: 'Storage',
  kitchen: 'Kitchen',
  lighting: 'Lighting',
  decor: 'Decor',
};

export function UploadModelDialog({ open, onClose }: UploadModelDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<FurnitureCategory>('decor');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const reset = () => {
    setFile(null);
    setName('');
    setCategory('decor');
    setError(null);
    setBusy(false);
  };

  const submit = async () => {
    if (!file || !name.trim()) {
      setError('Pick a file and enter a name.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await persistUserGlb(file, { name: name.trim(), category });
    setBusy(false);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    reset();
    onClose();
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40">
      <div className="w-96 rounded-lg bg-white p-5 text-sm shadow-xl">
        <h2 className="mb-3 text-base font-semibold text-neutral-900">Upload model</h2>
        <p className="mb-4 text-xs text-neutral-500">
          Drop a self-contained <span className="font-mono">.glb</span> or{' '}
          <span className="font-mono">.gltf</span> file (max 25&nbsp;MB). Files
          are stored locally in your browser only.
        </p>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-600">File</span>
            <input
              type="file"
              accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !name) setName(f.name.replace(/\.(glb|gltf)$/i, ''));
              }}
              className="block w-full text-xs"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-600">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Vintage armchair"
              className="block w-full rounded border border-neutral-300 px-2 py-1 text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs text-neutral-600">Category</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as FurnitureCategory)}
              className="block w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm"
            >
              {FURNITURE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          {error ? (
            <p className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">
              {error}
            </p>
          ) : null}
        </div>
        <footer className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => {
              reset();
              onClose();
            }}
            className="rounded px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-100"
            disabled={busy}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !file || !name.trim()}
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        </footer>
      </div>
    </div>
  );
}
