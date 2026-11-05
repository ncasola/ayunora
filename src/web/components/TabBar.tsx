import type { ReactNode } from 'react'
import { NavLink } from 'react-router'

const icon = (d: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    className="size-6"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    {d}
  </svg>
)

const tabs = [
  {
    to: '/',
    label: 'Ayuno',
    icon: icon(
      <>
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2.5M9 2h6" />
      </>,
    ),
  },
  {
    to: '/historial',
    label: 'Historial',
    icon: icon(<path d="M4 6h16M4 12h16M4 18h10" />),
  },
  {
    to: '/peso',
    label: 'Peso',
    icon: icon(
      <>
        <rect x="3" y="4" width="18" height="16" rx="4" />
        <path d="M8.5 10a3.5 3.5 0 0 1 7 0M12 10l1.5-2" />
      </>,
    ),
  },
  {
    to: '/ajustes',
    label: 'Ajustes',
    icon: icon(
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
      </>,
    ),
  },
]

export function TabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink/5 bg-brand-50/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg dark:border-white/10 dark:bg-[#1c1411]/90">
      <ul className="mx-auto flex max-w-md">
        {tabs.map((t) => (
          <li key={t.to} className="flex-1">
            <NavLink
              to={t.to}
              end={t.to === '/'}
              className={({ isActive }) =>
                `flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition ${
                  isActive
                    ? 'text-brand-600 dark:text-brand-300'
                    : 'text-ink/45 dark:text-brand-50/45'
                }`
              }
            >
              {t.icon}
              {t.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
