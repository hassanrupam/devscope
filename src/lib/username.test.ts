import { describe, expect, it } from 'vitest'
import { isValidUsername, parsePrefix, parseUsername } from './username'

describe('parseUsername', () => {
  it('trims, strips a leading @ and lower-cases', () => {
    expect(parseUsername('  @Torvalds ')).toBe('torvalds')
  })

  it('accepts single hyphens and 39 characters', () => {
    expect(parseUsername('a-b')).toBe('a-b')
    expect(parseUsername('a'.repeat(39))).toBe('a'.repeat(39))
  })

  it.each(['', '   ', '-abc', 'abc-', 'a--b', 'a b', 'a_b', 'a.b', 'a'.repeat(40), '../etc', 'user/repo'])(
    'rejects %j',
    (input) => {
      expect(() => parseUsername(input)).toThrowError(expect.objectContaining({ code: 'invalid_username' }))
    },
  )
})

describe('parsePrefix', () => {
  it('normalises like parseUsername', () => {
    expect(parsePrefix('  @TorV ')).toBe('torv')
  })

  it('allows a trailing hyphen, which a full username cannot have', () => {
    expect(parsePrefix('my-')).toBe('my-')
    expect(() => parseUsername('my-')).toThrow()
  })

  it.each(['', '-a', 'a--b', 'a b', 'a_b', 'a'.repeat(40)])('rejects %j', (input) => {
    expect(() => parsePrefix(input)).toThrowError(expect.objectContaining({ code: 'invalid_username' }))
  })
})

describe('isValidUsername', () => {
  it('is true only for complete usernames', () => {
    expect(isValidUsername('octocat')).toBe(true)
    expect(isValidUsername('my-')).toBe(false)
  })
})
