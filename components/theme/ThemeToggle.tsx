'use client'

import { Moon, Sun } from 'lucide-react'

const STORAGE_KEY = 'protrack-theme'

export function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Private mode can block storage. The choice still applies for this view.
  }
}

export function ThemeToggle() {
  return (
    <button
      type="button"
      className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-foreground hover:bg-muted"
      aria-label="Toggle color theme"
      onClick={() => {
        const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'
        applyTheme(next)
      }}
    >
      <Sun className="theme-icon-sun h-4 w-4" />
      <Moon className="theme-icon-moon h-4 w-4" />
    </button>
  )
}
