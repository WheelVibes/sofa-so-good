import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { Button } from './controls/Button'
import { Modal } from './Modal'
import { STYLE_QUIZ, scoreQuiz } from './styling/styleQuiz'
import { planStyleApply, STYLE_PRESETS } from './styling/styleTransfer'

/**
 * Style quiz modal — a short personality quiz that recommends one of the curated
 * interior styles and applies it (whole-home floor/wall finish + palette) in one
 * tap. Scoring is the pure, unit-tested `styling/styleQuiz.ts`; apply reuses the
 * same `applyHomeStyle` + `setMasterPalette` path as one-tap style transfer.
 */
export function StyleQuizModal() {
  const open = useStore((s) => s.styleQuizOpen)
  const setOpen = useStore((s) => s.setStyleQuizOpen)

  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [step, setStep] = useState(0)

  const total = STYLE_QUIZ.length
  const done = step >= total
  const recommendedId = useMemo(() => (done ? scoreQuiz(answers) : null), [done, answers])
  const recommended = recommendedId ? STYLE_PRESETS.find((s) => s.id === recommendedId) : undefined

  const reset = () => {
    setAnswers({})
    setStep(0)
  }
  const close = () => {
    setOpen(false)
    // Reset for next open (after the close animation; state is cheap).
    reset()
  }

  const choose = (questionId: string, optionIndex: number) => {
    setAnswers((a) => ({ ...a, [questionId]: optionIndex }))
    setStep((s) => s + 1)
  }

  const applyRecommended = () => {
    if (!recommended) return
    const plan = planStyleApply(recommended.id)
    if (!plan) return
    const s = useStore.getState()
    s.applyHomeStyle(plan.floorFinishId, plan.wallFinishId, plan.palette)
    s.notify.start({
      title: `Your style: ${recommended.name}`,
      message: 'Applied to every room.',
      kind: 'success',
      autoDismissMs: 8000,
      actionLabel: 'Undo',
      onAction: () => useStore.getState().undo(),
    })
    close()
  }

  const q = !done ? STYLE_QUIZ[step] : null

  return (
    <Modal
      open={open}
      onClose={close}
      title="Find your style"
      sub={done ? 'Your match' : `Question ${step + 1} of ${total}`}
      width="var(--modal-md)"
      panelId="style-quiz"
    >
      {q ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--t-base)', color: 'var(--text)' }}>
            {q.prompt}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {q.options.map((opt, i) => (
              <Button
                key={opt.label}
                style={{ justifyContent: 'flex-start', textAlign: 'left', padding: '10px 12px' }}
                onClick={() => choose(q.id, i)}
              >
                {opt.label}
              </Button>
            ))}
          </div>
          {step > 0 ? (
            <Button
              variant="soft"
              size="sm"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              ← Back
            </Button>
          ) : null}
        </div>
      ) : recommended ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' }}>
          <div style={{ fontWeight: 700, fontSize: 'var(--t-lg)', color: 'var(--text)' }}>
            {recommended.name}
          </div>
          <div className="panel-sub plain" style={{ fontSize: 'var(--t-sm)' }}>
            {recommended.description}
          </div>
          <div style={{ display: 'flex', gap: 5 }} aria-hidden>
            {recommended.palette.map((hex, i) => (
              <span
                key={`${recommended.id}-${i}`}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: hex,
                  border: '1px solid var(--border)',
                }}
              />
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <Button variant="accent" onClick={applyRecommended}>
              Apply this style
            </Button>
            <Button variant="soft" onClick={reset}>
              Retake
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  )
}
