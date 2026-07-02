import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Icon } from '../toolbar/icons'

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
  /** Swaps `icon` for a spinner, sets aria-busy, and disables the button. */
  loading?: boolean
}

/**
 * Typed composer over the .btn / .btn-accent|soft|danger / .btn-sm / .btn-block
 * classes (components.css). It owns no colours or sizes — it only assembles the
 * existing vocabulary so call sites stop drifting on padding/variant strings.
 * `loading` adds an inline spinner + aria-busy + disabled on top of this.
 */
export function Button({
  variant = 'default',
  size = 'default',
  block = false,
  icon,
  loading = false,
  className = '',
  type = 'button',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  const cls = [
    'btn',
    VARIANT[variant],
    size === 'sm' ? 'btn-sm' : '',
    block ? 'btn-block' : '',
    loading ? 'is-loading' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <button
      type={type}
      className={cls}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Icon.Versions className="btn-spin" width={14} height={14} aria-hidden /> : icon}
      {children}
    </button>
  )
}
