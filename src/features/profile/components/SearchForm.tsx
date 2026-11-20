import { motion } from 'framer-motion'
import { useState, type FormEvent } from 'react'
import { SearchIcon, XIcon } from '@/components/ui/icons'
import { isAppError } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { parsePrefix } from '@/lib/username'

interface SearchFormProps {
  initialValue?: string
  hasSearch: boolean
  isLoading: boolean
  /** Called with a normalised, valid username or username prefix. */
  onSearch: (query: string) => void
  onClear: () => void
}

/** Well-known maintainers, as one-click starting points. */
const QUICK_PICKS = ['torvalds', 'gaearon', 'sindresorhus', 'tj', 'addyosmani'] as const

export function SearchForm({ initialValue = '', hasSearch, isLoading, onSearch, onClear }: SearchFormProps) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)

  function clearInput() {
    setValue('')
    setError(null)
  }

  function clearSearch() {
    clearInput()
    onClear()
  }

  function run(text: string) {
    try {
      onSearch(parsePrefix(text))
      setError(null)
    } catch (err) {
      setError(isAppError(err) ? err.message : 'Enter a valid GitHub username.')
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    run(value)
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      onSubmit={handleSubmit}
      noValidate
      role="search"
      aria-label="Search GitHub profiles"
      className={cn(
        'relative mx-auto w-full overflow-hidden rounded-2xl border border-slate-200/80 bg-white/75 p-4 shadow-xl shadow-slate-900/[0.05] backdrop-blur-xl dark:border-white/[0.08] dark:bg-gradient-to-b dark:from-slate-900/80 dark:to-slate-950/80 dark:shadow-black/40 sm:p-5',
        hasSearch ? 'max-w-none' : 'max-w-3xl',
      )}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent" />
      <label htmlFor="username" className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
        GitHub username
      </label>
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="group relative min-w-0 flex-1">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-indigo-500" />
          <input
            id="username"
            name="username"
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. torvalds, or just the start: torv"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'username-error' : 'username-hint'}
            className="h-12 w-full rounded-xl border border-slate-300/80 bg-white/80 pl-11 pr-11 text-base text-slate-900 shadow-inner shadow-slate-900/[0.03] transition placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-500/15 dark:border-white/10 dark:bg-slate-950/60 dark:text-slate-100 dark:focus:border-indigo-400"
          />
          {value ? (
            <button
              type="button"
              onClick={clearInput}
              aria-label="Clear username"
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
            >
              <XIcon />
            </button>
          ) : null}
        </div>
        <div className="flex gap-2.5">
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-indigo-500/35 disabled:translate-y-0 disabled:opacity-60 sm:flex-none"
          >
            {isLoading ? (
              <>
                <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
                Searching…
              </>
            ) : (
              <>
                <SearchIcon />
                Search
              </>
            )}
          </button>
          {hasSearch ? (
            <button
              type="button"
              onClick={clearSearch}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-100 px-4 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200 dark:hover:bg-white/10"
            >
              <XIcon />
              Clear results
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-2">
        <span className="text-xs text-slate-500 dark:text-slate-400">Try</span>
        {QUICK_PICKS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => {
              setValue(name)
              run(name)
            }}
            className="rounded-full border border-slate-200/80 bg-white/60 px-2.5 py-1 font-mono text-xs text-slate-700 transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:bg-white hover:text-indigo-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300 dark:hover:border-indigo-400/50 dark:hover:text-indigo-200"
          >
            @{name}
          </button>
        ))}
      </div>
      <p id="username-hint" className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        Type a full username for its profile, or the first letters to list matching users.
      </p>
      {error ? (
        <p id="username-error" role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </motion.form>
  )
}
