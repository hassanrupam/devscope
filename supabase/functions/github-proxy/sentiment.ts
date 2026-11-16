/**
 * Tiny, dependency-free, lexicon-based text analysis for the report's "Community Sentiment" card.
 *
 * It is a rough tone estimate, not machine understanding: it counts friendly vs. critical words
 * (with simple negation handling) in a developer's recent issue / pull-request text. Only aggregate
 * word counts leave this module; the original comments are never stored or returned.
 */

export type Tone = -1 | 0 | 1

export interface WordStat {
  text: string
  count: number
  tone: Tone
}

export interface SentimentSummary {
  /** -1 (critical) .. 0 (neutral) .. +1 (happy). */
  score: number
  /** How many texts (comments, titles) were analysed. */
  sampleSize: number
  /** Most frequent meaningful words, most frequent first. */
  words: WordStat[]
}

const POSITIVE = new Set(
  (
    'thanks thank thx awesome great good nice love lovely excellent amazing perfect cool wonderful fantastic ' +
    'brilliant helpful appreciate appreciated congrats congratulations welcome happy glad works working fixed ' +
    'fixes improved improvement improve better best clean clear easy fast faster smooth solid beautiful ' +
    'impressive agree agreed sure yes lgtm merged support supported enjoy enjoyed neat elegant useful ' +
    'excited fun superb outstanding stable reliable simple success successful resolved resolve'
  ).split(' '),
)

const NEGATIVE = new Set(
  (
    'bug bugs broken break breaks fail fails failed failing failure error errors crash crashes crashed issue ' +
    'problem problems wrong bad worse worst ugly slow hard difficult confusing confused unclear annoying ' +
    'unfortunately sorry regression blocker blocked stuck missing deprecated hate terrible awful horrible ' +
    'impossible useless unstable flaky leak leaks hang hangs hung invalid reject rejected disagree concern ' +
    'concerns warning warnings fix-me hack hacky workaround painful frustrating'
  ).split(' '),
)

const NEGATIONS = new Set(['not', 'no', 'never', "don't", "doesn't", "isn't", "wasn't", "can't", "won't", "couldn't", 'cannot', 'without'])

const STOP_WORDS = new Set(
  (
    'a about above after again against all also am an and any are as at be because been before being below between both ' +
    'but by can could did do does doing down during each few for from further had has have having he her here hers ' +
    'him his how i if in into is it its itself just let like me more most my no nor not now of off on once only or ' +
    'other our out over own same she should so some such than that the their them then there these they this those ' +
    'through to too under until up very was we were what when where which while who whom why will with would you ' +
    'your yours yourself also still get got gets one two see use used using need want make made think know ' +
    'maybe please try tried look looks looking going thing things way well even much many really actually ' +
    'else something anything everything could would should yeah okay ok hi hello hey etc via per ' +
    "don't doesn't isn't wasn't can't won't couldn't it's i'm i've i'd i'll that's there's we're you're they're"
  ).split(' '),
)

/** Removes the parts of a comment that are not the author's prose: code, links, quotes, mentions, HTML. */
export function stripNoise(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`\n]*`/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>\n]+>/g, ' ')
    .replace(/^\s*>.*$/gm, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/(^|\s)[@#][\w-]+/g, ' ')
}

export function tokenize(text: string): string[] {
  return stripNoise(text)
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .match(/[a-z][a-z'-]*[a-z]|[a-z]/g)?.map((t) => t.replace(/^[-']+|[-']+$/g, '')) ?? []
}

export function analyzeText(texts: string[], maxWords = 36): SentimentSummary {
  const counts = new Map<string, number>()
  let positive = 0
  let negative = 0
  let sampleSize = 0

  for (const text of texts) {
    const tokens = tokenize(text)
    if (tokens.length === 0) continue
    sampleSize++

    tokens.forEach((token, index) => {
      const negated = NEGATIONS.has(tokens[index - 1] ?? '') || NEGATIONS.has(tokens[index - 2] ?? '')
      if (POSITIVE.has(token)) {
        if (negated) negative++
        else positive++
      } else if (NEGATIVE.has(token)) {
        if (negated) positive++
        else negative++
      }

      if (token.length < 3 || STOP_WORDS.has(token) || NEGATIONS.has(token)) return
      counts.set(token, (counts.get(token) ?? 0) + 1)
    })
  }

  const polar = positive + negative
  // Shrink towards neutral when there is little evidence, so 1 "thanks" is not "100% happy".
  const confidence = Math.min(1, polar / 12)
  const score = polar === 0 ? 0 : Math.round(((positive - negative) / polar) * confidence * 100) / 100

  const words = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxWords)
    .map(([text, count]): WordStat => ({
      text,
      count,
      tone: POSITIVE.has(text) ? 1 : NEGATIVE.has(text) ? -1 : 0,
    }))

  return { score, sampleSize, words }
}
