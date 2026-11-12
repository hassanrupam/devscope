import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { isAppError } from '@/lib/errors'
import { parsePrefix } from '@/lib/username'

interface SearchFormProps {
  initialValue?: string
  isLoading: boolean
  /** Called with a normalised, valid username or username prefix. */
  onSearch: (query: string) => void
}

export function SearchForm({ initialValue = '', isLoading, onSearch }: SearchFormProps) {
  const [value, setValue] = useState(initialValue)
  const [error, setError] = useState<string | null>(null)

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
          className="h-11 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-4 text-base text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Searching…' : 'Search'}
        </Button>
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
