import { describe, expect, it } from 'vitest'
import { parseUrlState, serializeUrlState } from './urlState'

describe('parseUrlState', () => {
  it('defaults to the explore view with nothing set', () => {
    expect(parseUrlState('')).toEqual({ view: 'explore', query: null, users: [], report: null })
  })

  it('reads the query, the compare view and the compared users', () => {
    expect(parseUrlState('?u=Torv&view=compare&users=Octocat,gaearon')).toEqual({
      view: 'compare',
      query: 'torv',
      users: ['octocat', 'gaearon'],
      report: null,
    })
  })

  it('drops invalid, duplicate and excess users', () => {
    const state = parseUrlState('?users=a,a,bad name,-x,b,c,d')
    expect(state.users).toEqual(['a', 'b', 'c'])
  })

  it('ignores an invalid query and unknown views', () => {
    expect(parseUrlState('?u=no%20spaces&view=other')).toEqual({ view: 'explore', query: null, users: [], report: null })
  })
})

describe('report view', () => {
  it('opens a report for a valid user', () => {
    expect(parseUrlState('?view=report&report=Octocat')).toMatchObject({ view: 'report', report: 'octocat' })
  })
  it('falls back to Explore when the report user is missing or invalid', () => {
    expect(parseUrlState('?view=report').view).toBe('explore')
    expect(parseUrlState('?view=report&report=no%20spaces').view).toBe('explore')
  })
  it('round-trips and keeps the search context for the Back button', () => {
    const state = { view: 'report' as const, query: 'octo', users: ['a'], report: 'octocat' }
    const text = serializeUrlState(state)
    expect(text).toBe('u=octo&view=report&report=octocat&users=a')
    expect(parseUrlState(`?${text}`)).toEqual(state)
  })
  it('does not write the report user outside the report view', () => {
    expect(serializeUrlState({ view: 'explore', query: null, users: [], report: 'octocat' })).toBe('')
  })
})

describe('serializeUrlState', () => {
  it('omits empty values', () => {
    expect(serializeUrlState({ view: 'explore', query: null, users: [], report: null })).toBe('')
  })

  it('round-trips a full state with readable commas', () => {
    const state = { view: 'compare' as const, query: 'torv', users: ['a', 'b'], report: null }
    const text = serializeUrlState(state)
    expect(text).toBe('u=torv&view=compare&users=a,b')
    expect(parseUrlState(`?${text}`)).toEqual(state)
  })
})
