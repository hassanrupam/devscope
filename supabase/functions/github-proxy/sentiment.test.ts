import { describe, expect, it } from 'vitest'
import { analyzeText, stripNoise, tokenize } from './sentiment'

describe('stripNoise / tokenize', () => {
  it('drops code, links, quotes, mentions and HTML so only prose is analysed', () => {
    const text = 'Thanks @bob!\n> broken quoted line\n```\nerror error error\n```\nSee https://x.dev/error and `crash()` <b>nice</b>'
    const tokens = tokenize(text)
    expect(tokens).toContain('thanks')
    expect(tokens).toContain('nice')
    expect(tokens).not.toContain('error')
    expect(tokens).not.toContain('broken')
    expect(tokens).not.toContain('crash')
    expect(tokens).not.toContain('bob')
  })
  it('keeps markdown link text', () => expect(stripNoise('[the docs](https://a.b/c)')).toContain('the docs'))
})

describe('analyzeText', () => {
  it('scores friendly text positive and critical text negative', () => {
    const happy = analyzeText(Array(6).fill('Thanks, this is awesome and works great, nice fix!'))
    const grumpy = analyzeText(Array(6).fill('This is broken, the build fails and the crash is terrible'))
    expect(happy.score).toBeGreaterThan(0.5)
    expect(grumpy.score).toBeLessThan(-0.5)
  })
  it('flips tone after a negation', () => {
    expect(analyzeText(Array(12).fill('this is not good')).score).toBeLessThan(0)
    expect(analyzeText(Array(12).fill('this is not broken')).score).toBeGreaterThan(0)
  })
  it('shrinks towards neutral with little evidence', () => {
    expect(Math.abs(analyzeText(['thanks']).score)).toBeLessThan(0.2)
  })
  it('is neutral for empty input', () => {
    expect(analyzeText([])).toEqual({ score: 0, sampleSize: 0, words: [] })
  })
  it('returns the most frequent meaningful words, flagged by tone, never stop words', () => {
    const r = analyzeText(['the cache cache cache is broken', 'cache thanks the and'], 5)
    expect(r.words[0]).toEqual({ text: 'cache', count: 4, tone: 0 })
    expect(r.words.map((w) => w.text)).not.toContain('the')
    expect(r.words.find((w) => w.text === 'broken')?.tone).toBe(-1)
    expect(r.words.find((w) => w.text === 'thanks')?.tone).toBe(1)
    expect(r.sampleSize).toBe(2)
  })
  it('caps the number of words', () => {
    const text = Array.from({ length: 100 }, (_, i) => `word${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`).join(' ')
    expect(analyzeText([text], 10).words).toHaveLength(10)
  })
})
