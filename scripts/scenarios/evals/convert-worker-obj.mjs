/**
 * Scenario eval: drive a REAL OBJ→GLB conversion through the pooled convert
 * Worker (`furniture/convert/runConvert.ts` + `convert.worker.ts`), headlessly.
 *
 * Unit tests can only mock `Worker` (the default Node/happy-dom test
 * environment can't construct a real one, and three's loaders fetch their
 * entry via `blob:` URLs which jsdom/happy-dom can't resolve — see
 * `runConvert.test.ts`). Only a real browser can prove: (a) a real `new
 * Worker(new URL('./convert.worker.ts', import.meta.url))` actually
 * constructs under the bundler, and (b) the OBJLoader → GLTFExporter
 * round-trip genuinely completes inside that worker (no `document`).
 *
 * Reuses the existing dev-only `__importGlbFiles` hook (bootstrap.ts) — despite
 * the name, it works for any convertible model format, not just GLB:
 * `detectModelFormat`/`isModelEntryFile` key off the file's NAME extension,
 * never its declared MIME type, and the hook rebuilds a `File` from
 * `{name, b64}` with whatever name is given. Passing a `.obj` name routes it
 * through `bulkImport.prepareGlb` → `needsConversion('obj')` → `runConvert`
 * exactly like a real drag-drop upload would.
 *
 * A textureless single-file OBJ (no `mtllib`) is deliberately chosen so the
 * result doesn't depend on the ImageLoader→createImageBitmap patch working —
 * that path is unit-tested directly in imageLoaderWorkerPatch.test.ts; this
 * eval's job is proving the WORKER ITSELF runs for a real conversion.
 */
;(async () => {
  const fn = window.__importGlbFiles
  if (typeof fn !== 'function') throw new Error('__importGlbFiles not exposed on window')

  const obj = ['v 0 0 0', 'v 1 0 0', 'v 0 1 0', 'f 1 2 3', ''].join('\n')
  const b64 = btoa(obj)

  const result = await fn([{ name: 'tri.obj', b64 }], { category: 'decor' })
  window.__convertWorkerObjResult = result
})()
