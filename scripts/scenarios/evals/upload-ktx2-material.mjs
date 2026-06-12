/**
 * Scenario eval: upload a KTX2 texture as an albedo channel using the
 * material-upload pipeline.
 *
 * Fetches the solid-teal-4x4.ktx2 test fixture (served from /test-fixtures/),
 * wraps it in a File, calls __persistUserMaterial (exposed by bootstrap.ts
 * dev helpers), and stores the result on window.__uploadedMatResult.
 *
 * Run after the store is ready and overlays are dismissed.
 */
;(async () => {
  const resp = await fetch('/test-fixtures/solid-teal-4x4.ktx2')
  if (!resp.ok) throw new Error(`Failed to fetch fixture: ${resp.status}`)
  const buf = await resp.arrayBuffer()
  const file = new File([buf], 'solid-teal-4x4.ktx2', { type: 'application/octet-stream' })

  const fn = window.__persistUserMaterial
  if (typeof fn !== 'function') throw new Error('__persistUserMaterial not exposed on window')

  const result = await fn(
    { albedo: file },
    { name: 'Teal KTX2 Test', category: 'floor', uvScale: [1, 1], swatch: '#00ffaa' },
  )
  window.__uploadedMatResult = result
  if (!result.ok) throw new Error(`persistUserMaterial failed: ${result.reason}`)
  window.__uploadedMatId = result.def.id
})()
