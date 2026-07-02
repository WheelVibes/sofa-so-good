/**
 * Scenario eval: drive the IKEA model-group detection path over a synthetic
 * multi-group folder, headlessly.
 *
 * The upload dialog is React.lazy and won't mount under the headless profile
 * (see visual-verification-playbook.md), so we exercise the pipeline the dialog
 * feeds — detectGroups + looseModelFiles — through the dev-only __detectGroups
 * hook (bootstrap.ts). This proves detection scales to a folder large enough to
 * span multiple pager pages (60 groups > GROUPS_PER_PAGE=50), which is the input
 * that motivated the pagination fix.
 *
 * The hook records the outcome on window.__detectGroupsResult; the scenario
 * waits on that. Run after the store is ready + __detectGroups is exposed.
 */
;(async () => {
  const fn = window.__detectGroups
  if (typeof fn !== 'function') throw new Error('__detectGroups not exposed on window')

  const N = 60 // > GROUPS_PER_PAGE (50) so the result spans >1 page
  const entries = []
  for (let i = 0; i < N; i++) {
    entries.push({
      path: `bulk/g${i}/metadata.json`,
      meta: {
        group_key: `malm-${i}`,
        product_name: `MALM item ${i}`,
        design: { category: 'beds', category_confidence: 'high', placement: 'floor' },
        variants: [{ article_number: `${i}`, finish: 'white', url: 'https://x', glb: 'w.glb' }],
      },
    })
    // A GLB inside each group's folder — should NOT count as loose.
    entries.push({ path: `bulk/g${i}/w.glb`, body: 'glb-bytes' })
  }
  // Two model files outside any group folder → these ARE loose.
  entries.push({ path: 'bulk/loose-a.glb', body: 'glb' })
  entries.push({ path: 'bulk/loose-b.glb', body: 'glb' })

  await fn(entries)
})()
