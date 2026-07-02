import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Button } from './Button'

describe('P15 Button primitive', () => {
  it('composes the .btn vocabulary from variant/size/block', () => {
    const { getByRole } = render(
      <Button variant="accent" size="sm" block>
        Go
      </Button>,
    )
    const cls = getByRole('button').className
    expect(cls).toContain('btn')
    expect(cls).toContain('btn-accent')
    expect(cls).toContain('btn-sm')
    expect(cls).toContain('btn-block')
  })
  it('defaults to a plain .btn and appends caller className', () => {
    const { getByRole } = render(<Button className="foo">Hi</Button>)
    const cls = getByRole('button').className
    expect(cls).toContain('btn')
    expect(cls).not.toContain('btn-accent')
    expect(cls).toContain('foo')
  })
  it('renders an icon before the label and forwards native props', () => {
    const { getByRole } = render(
      <Button icon={<svg data-testid="ic" />} type="submit">
        Save
      </Button>,
    )
    const btn = getByRole('button')
    expect(btn.getAttribute('type')).toBe('submit')
    expect(btn.querySelector('[data-testid="ic"]')).not.toBeNull()
  })
})
