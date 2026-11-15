import { useState } from 'react'
import { flushSync } from 'react-dom'
import { MoonIcon, SunIcon } from '@/components/ui/icons'

type Theme = 'light' | 'dark'
const THEME_STORAGE_KEY = 'devscope-theme'

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'))
  const nextTheme = theme === 'dark' ? 'light' : 'dark'

  function toggleTheme() {
    const root = document.documentElement
    const applyTheme = () => {
      root.classList.toggle('dark', nextTheme === 'dark')
      root.style.colorScheme = nextTheme
      flushSync(() => setTheme(nextTheme))

      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
      } catch (error) {
        console.warn('Could not save theme preference.', error)
      }
    }

    if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.startViewTransition(applyTheme)
    } else {
      applyTheme()
    }
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${nextTheme} theme`}
      aria-pressed={theme === 'dark'}
      title={`Switch to ${nextTheme} theme`}
      className="absolute top-1/2 right-0 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100 sm:size-10"
    >
      {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  )
}
