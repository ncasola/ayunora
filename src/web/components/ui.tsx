import {
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const buttonStyles: Record<ButtonVariant, string> = {
  primary: 'bg-brand-500 text-white shadow-md shadow-brand-500/30 active:bg-brand-600',
  secondary:
    'border-2 border-brand-500 text-brand-600 active:bg-brand-100 dark:text-brand-300 dark:active:bg-white/5',
  ghost: 'text-brand-600 active:bg-brand-100 dark:text-brand-300 dark:active:bg-white/5',
  danger: 'bg-red-600 text-white active:bg-red-700',
}

export function Button({
  variant = 'primary',
  className = '',
  busy,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; busy?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      className={`min-h-12 rounded-full px-6 py-3 text-base font-semibold transition disabled:opacity-40 ${buttonStyles[variant]} ${className}`}
    >
      {busy ? 'Un momento…' : children}
    </button>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-3xl bg-white p-5 shadow-sm dark:bg-white/5 ${className}`}>
      {children}
    </section>
  )
}

export function Field({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  const id = useId()
  return (
    <label htmlFor={id} className="flex flex-col gap-1.5 text-sm font-medium">
      {label}
      <input
        id={id}
        {...props}
        className="min-h-12 rounded-2xl border border-brand-200 bg-white px-4 text-base font-normal text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/10 dark:text-brand-50"
      />
      {hint && (
        <span className="text-xs font-normal text-ink/60 dark:text-brand-50/60">{hint}</span>
      )}
    </label>
  )
}

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null
  return (
    <p role="alert" className="text-sm text-red-700 dark:text-red-300">
      {children}
    </p>
  )
}

/** Hoja inferior modal, al estilo de iOS. */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-brand-50 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1.25rem)] shadow-2xl dark:bg-[#2a1f1a]"
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-ink/15 dark:bg-white/20" />
        <h2 className="mb-4 text-lg font-bold">{title}</h2>
        {children}
      </div>
    </div>
  )
}
