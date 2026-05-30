import { useState } from 'react';
import {
  FURNITURE_CATEGORIES,
  type FurnitureCategory,
} from '../../furniture/types';
import { persistUserGlb } from '../../furniture/upload/persist';
import {
  importGlbFiles,
  isModelFile,
  modelName,
  type BulkImportResult,
} from '../../furniture/upload/bulkImport';

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
  bathroom: 'Bathroom',
  appliances: 'Appliances',
  lighting: 'Lighting',
  decor: 'Decor',
};

export function UploadModelDialog({ open, onClose }: UploadModelDialogProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<FurnitureCategory>('decor');
  const [mounted, setMounted] = useState(false);
  const [noClip, setNoClip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [showSkipped, setShowSkipped] = useState(false);

  if (!open) return null;

  // Files that will actually be imported (folder picks include junk).
  const modelFiles = files.filter((f) => {
    const path = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    return isModelFile(path);
  });
  const single = modelFiles.length === 1 && files.length === 1;

  const reset = () => {
    setFiles([]);
    setName('');
    setCategory('decor');
    setMounted(false);
    setNoClip(false);
    setError(null);
    setBusy(false);
    setProgress(null);
    setResult(null);
    setShowSkipped(false);
  };

  const onPick = (list: FileList | null) => {
    const picked = list ? Array.from(list) : [];
    setFiles(picked);
    setResult(null);
    setError(null);
    const models = picked.filter((f) => {
      const path = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
      return isModelFile(path);
    });
    if (models.length === 1 && picked.length === 1) {
      setName(modelName(picked[0].name));
    } else {
      setName('');
    }
  };

  const submit = async () => {
    if (modelFiles.length === 0) {
      setError('Pick at least one .glb or .gltf file.');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);

    if (single) {
      if (!name.trim()) {
        setError('Enter a name.');
        setBusy(false);
        return;
      }
      const r = await persistUserGlb(files[0], {
        name: name.trim(),
        category,
        mounted,
        noClip,
      });
      setBusy(false);
      if (!r.ok) {
        setError(r.reason);
        return;
      }
      reset();
      onClose();
      return;
    }

    setProgress({ done: 0, total: files.length });
    const r = await importGlbFiles(files, { category, mounted, noClip }, (done, total) =>
      setProgress({ done, total }),
    );
    setBusy(false);
    setProgress(null);
    setResult(r);
  };

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40">
      <div className="w-96 rounded-lg bg-white p-5 text-sm shadow-xl">
        <h2 className="mb-3 text-base font-semibold text-neutral-900">Upload models</h2>
        <p className="mb-4 text-xs text-neutral-500">
          Pick one or more self-contained <span className="font-mono">.glb</span>/
          <span className="font-mono">.gltf</span> files, or a whole folder (max
          25&nbsp;MB each). Files are stored locally in your browser only.
        </p>

        {result ? (
          <div className="space-y-2">
            <p className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
              Imported {result.imported}, skipped {result.skipped.length} of {result.total}.
            </p>
            {result.skipped.length > 0 ? (
              <div className="text-xs">
                <button
                  onClick={() => setShowSkipped((v) => !v)}
                  className="text-neutral-600 underline"
                >
                  {showSkipped ? 'Hide' : 'Show'} skipped files
                </button>
                {showSkipped ? (
                  <ul className="mt-1 max-h-40 space-y-0.5 overflow-auto">
                    {result.skipped.map((s, i) => (
                      <li key={i} className="text-neutral-500">
                        <span className="font-mono">{s.name}</span> — {s.reason}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-600">Files</span>
              <input
                type="file"
                multiple
                accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
                onChange={(e) => onPick(e.target.files)}
                disabled={busy}
                className="block w-full text-xs"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-600">…or a folder</span>
              <input
                type="file"
                // @ts-expect-error non-standard but widely supported folder pick
                webkitdirectory=""
                directory=""
                multiple
                onChange={(e) => onPick(e.target.files)}
                disabled={busy}
                className="block w-full text-xs"
              />
            </label>
            {modelFiles.length > 0 ? (
              <p className="text-xs text-neutral-500">
                {modelFiles.length} model file{modelFiles.length === 1 ? '' : 's'} selected
                {files.length > modelFiles.length
                  ? ` (${files.length - modelFiles.length} non-model ignored)`
                  : ''}
                .
              </p>
            ) : null}
            {single ? (
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-600">Name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Vintage armchair"
                  className="block w-full rounded border border-neutral-300 px-2 py-1 text-sm"
                />
              </label>
            ) : null}
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-600">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as FurnitureCategory)}
                disabled={busy}
                className="block w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm"
              >
                {FURNITURE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <input
                type="checkbox"
                checked={mounted}
                onChange={(e) => setMounted(e.target.checked)}
                disabled={busy}
              />
              Wall / ceiling mounted (skip wall collision)
            </label>
            <label className="flex items-center gap-2 text-xs text-neutral-600">
              <input
                type="checkbox"
                checked={noClip}
                onChange={(e) => setNoClip(e.target.checked)}
                disabled={busy}
              />
              Flat floor covering (rug — never collides)
            </label>
            {progress ? (
              <p className="text-xs text-neutral-600">
                Importing {progress.done} / {progress.total}…
              </p>
            ) : null}
            {error ? (
              <p className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">{error}</p>
            ) : null}
          </div>
        )}

        <footer className="mt-5 flex justify-end gap-2">
          <button
            onClick={() => {
              reset();
              onClose();
            }}
            className="rounded px-3 py-1 text-sm text-neutral-600 hover:bg-neutral-100"
            disabled={busy}
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          {result ? (
            <button
              onClick={reset}
              className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
            >
              Import more
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={busy || modelFiles.length === 0 || (single && !name.trim())}
              className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              {busy ? 'Importing…' : single ? 'Save' : `Import ${modelFiles.length}`}
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
