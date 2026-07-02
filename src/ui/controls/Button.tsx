import type { ButtonHTMLAttributes, ReactNode } from 'react'

const VARIANT: Record<'default' | 'accent' | 'soft' | 'danger', string> = {
  default: '',
  accent: 'btn-accent',
  soft: 'btn-soft',
  danger: 'btn-danger',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Maps to the .btn-* vocabulary (the classes stay the source of truth). */
  variant?: 'default' | 'accent' | 'soft' | 'danger'
  size?: 'default' | 'sm'
  block?: boolean
  icon?: ReactNode
}

/**
 * Typed composer over the .btn / .btn-accent|soft|danger / .btn-sm / .btn-block
 * classes (components.css). It owns no colours or sizes — it only assembles the
 * existing vocabulary so call sites stop drifting on padding/variant strings.
 * `loading` (Task P16) adds an inline spinner + aria-busy on top of this.
 */
export function Button({
  variant = 'default',
  size = 'default',
  block = false,
  icon,
  className = '',
  type = 'button',
  children,
  ...rest
}: ButtonProps) {
  const cls = [
    'btn',
    VARIANT[variant],
    size === 'sm' ? 'btn-sm' : '',
    block ? 'btn-block' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button type={type} className={cls} {...rest}>
      {icon}
      {children}
    </button>
  )
}
