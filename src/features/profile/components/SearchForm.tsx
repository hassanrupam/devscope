import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { SearchIcon, XIcon } from '@/components/ui/icons'
import { isAppError } from '@/lib/errors'
import { parsePrefix } from '@/lib/username'

interface SearchFormProps {
  initialValue?: string
  hasSearch: boolean
  isLoading: boolean
  /** Called with a normalised, valid username or username prefix. */
  onSearch: (query: string) => void
  onClear: () => void
}

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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      onSearch(parsePrefix(value))
      setError(null)
    } catch (err) {
      setError(isAppError(err) ? err.message : 'Enter a valid GitHub username.')
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate role="search" aria-label="Search GitHub profiles">
      <label htmlFor="username" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
        GitHub username
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative min-w-0 flex-1">
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
            className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 pr-11 text-base text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 sm:px-4"
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
        <div className="flex flex-wrap justify-center gap-2 sm:justify-start sm:gap-3">
          <Button type="submit" disabled={isLoading}>
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
          </Button>
          {hasSearch ? (
            <Button
              type="button"
              onClick={clearSearch}
              className="bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <XIcon />
              Clear results
            </Button>
          ) : null}
        </div>
      </div>
      <p id="username-hint" className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Type a full username for its profile, or the first letters to list matching users.
      </p>
      {error ? (
        <p id="username-error" role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </form>
  )
}
