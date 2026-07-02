/** Inline boot-loader phrase rotator — injected into index.html at dev/build time. */
export function bootPhraseInlineScript(phrases, cycleMs, fadeMs) {
  return `<script>
;(function () {
  var phrases = ${JSON.stringify(phrases)}
  var el = document.querySelector('#boot-loader .bl-sub .cycling-phrase')
  if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  var i = 0
  var hold
  var fadeT
  el.style.transition = 'opacity ${fadeMs}ms ease, transform ${fadeMs}ms ease'
  function show(p, vis) {
    el.textContent = p
    el.style.opacity = vis ? '1' : '0'
    el.style.transform = vis ? 'translateY(0)' : 'translateY(4px)'
  }
  function schedule() {
    hold = setTimeout(function () {
      show(phrases[i], false)
      fadeT = setTimeout(function () {
        i = (i + 1) % phrases.length
        show(phrases[i], true)
        schedule()
      }, ${fadeMs})
    }, ${cycleMs})
  }
  window.__stopBootPhraseRotator = function (finalPhrase) {
    clearTimeout(hold)
    clearTimeout(fadeT)
    if (finalPhrase) show(finalPhrase, true)
  }
  schedule()
})()
</script>`
}
