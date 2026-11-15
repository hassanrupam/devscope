import { describe, expect, it } from 'vitest'
import { parseUrlState, serializeUrlState } from './urlState'

describe('parseUrlState', () => {
  it('defaults to the explore view with nothing set', () => {
    expect(parseUrlState('')).toEqual({ view: 'explore', query: null, users: [] })
  })

  it('reads the query, the compare view and the compared users', () => {
    expect(parseUrlState('?u=Torv&view=compare&users=Octocat,gaearon')).toEqual({
      view: 'compare',
      query: 'torv',
      users: ['octocat', 'gaearon'],
    })
  })

  it('drops invalid, duplicate and excess users', () => {
    const state = parseUrlState('?users=a,a,bad name,-x,b,c,d')
    expect(state.users).toEqual(['a', 'b', 'c'])
  })

  it('ignores an invalid query and unknown views', () => {
    expect(parseUrlState('?u=no%20spaces&view=other')).toEqual({ view: 'explore', query: null, users: [] })
  })
})

describe('serializeUrlState', () => {
  it('omits empty values', () => {
    expect(serializeUrlState({ view: 'explore', query: null, users: [] })).toBe('')
  })

  it('round-trips a full state with readable commas', () => {
    const state = { view: 'compare' as const, query: 'torv', users: ['a', 'b'] }
    const text = serializeUrlState(state)
    expect(text).toBe('u=torv&view=compare&users=a,b')
    expect(parseUrlState(`?${text}`)).toEqual(state)
  })
})
