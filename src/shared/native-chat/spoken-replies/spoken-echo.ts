import { spokenPortuguese } from './spoken-portuguese'

/** Share of the words heard that must come back in order for three or more to be the voice's. */
export const SPOKEN_ECHO_SHARE = 0.6
/** The last words of a reply reach the transcript after the voice stops: the pause that ends a
 *  segment, then the transcription. */
export const SPOKEN_ECHO_AFTER_MS = 6000
// The line being read and the two before it: a segment can span two lines, and it lands late.
const LINES_KEPT = 3
// Words the reply said one after another, heard one after another: its tail, caught as the person
// started talking over it. Fewer than this can be the person's own.
const ECHO_RUN = 3
// A garbled echo leaves a few words that match nothing; fewer than this are dropped with it.
const OWN_WORDS = 3

type HeardWord = { start: number; end: number; word: string; telling: boolean }

function normalized(word: string): string {
  return word.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

function wordsOf(text: string): string[] {
  return normalized(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0)
}

// Words of one or two letters ("a", "de", "em") are in nearly every sentence; counted, they would
// make most of what the person says look like the reply.
function telling(word: string): boolean {
  return word.length > 2
}

function heardWordsOf(text: string): HeardWord[] {
  return [...text.matchAll(/[\p{L}\p{M}\p{N}]+/gu)].map((match) => {
    const word = normalized(match[0])
    return { start: match.index, end: match.index + match[0].length, word, telling: telling(word) }
  })
}

/** Pairs of positions, in `heard` and in `said`, of the longest run of `heard` that `said` has in
 *  the same order. */
function alignment(heard: readonly string[], said: readonly string[]): [number, number][] {
  const longest = Array.from({ length: heard.length + 1 }, () =>
    Array.from({ length: said.length + 1 }, () => 0)
  )
  for (let h = heard.length - 1; h >= 0; h -= 1) {
    for (let s = said.length - 1; s >= 0; s -= 1) {
      longest[h][s] =
        heard[h] === said[s]
          ? longest[h + 1][s + 1] + 1
          : Math.max(longest[h + 1][s], longest[h][s + 1])
    }
  }
  const pairs: [number, number][] = []
  let h = 0
  let s = 0
  while (h < heard.length && s < said.length) {
    if (heard[h] === said[s]) {
      pairs.push([h, s])
      h += 1
      s += 1
    } else if (longest[h + 1][s] >= longest[h][s + 1]) {
      h += 1
    } else {
      s += 1
    }
  }
  return pairs
}

/** Each line next to the one before it, as written and as the voice says it. */
function stretches(lines: readonly string[]): string[] {
  const forms = lines.map((line) => [line, spokenPortuguese(line, { respellEnglish: false })])
  if (forms.length === 1) {
    return forms[0]
  }
  return forms
    .slice(1)
    .flatMap((form, index) => [`${forms[index][0]} ${form[0]}`, `${forms[index][1]} ${form[1]}`])
}

/** Matches that follow each other both as heard and as said. */
function consecutiveRuns(pairs: readonly [number, number][]): [number, number][][] {
  const runs: [number, number][][] = []
  for (const pair of pairs) {
    const run = runs.at(-1)
    const last = run?.at(-1)
    if (run && last && pair[0] === last[0] + 1 && pair[1] === last[1] + 1) {
      run.push(pair)
    } else {
      runs.push([pair])
    }
  }
  return runs
}

/** The words of `heard` that are the voice's, by its words longer than two letters compared with
 *  two lines read one after the other. All of it when one or two words are all there in order, or
 *  60% of three or more; otherwise only stretches the reply said word for word. */
function echoWords(words: readonly HeardWord[], lines: readonly string[]): Set<HeardWord> {
  const keepShort = !words.some((word) => word.telling)
  const compared = words.filter((word) => keepShort || word.telling)
  if (compared.length === 0 || lines.length === 0) {
    return new Set()
  }
  let best: [number, number][] = []
  for (const stretch of stretches(lines)) {
    const said = wordsOf(stretch).filter((word) => keepShort || telling(word))
    const pairs = alignment(
      compared.map((word) => word.word),
      said
    )
    if (pairs.length > best.length) {
      best = pairs
    }
  }
  const needed =
    compared.length <= 2 ? compared.length : Math.ceil(compared.length * SPOKEN_ECHO_SHARE)
  const echo =
    best.length >= needed ? [best] : consecutiveRuns(best).filter((run) => run.length >= ECHO_RUN)
  return new Set(echo.flat().map(([index]) => compared[index]))
}

/** What text dictated while a reply was read says once the reply coming back through the
 *  microphone is taken out: the same text, the person's words around the echo, or nothing. */
export function withoutSpokenEcho(heard: string, lines: readonly string[]): string {
  const text = heard.normalize('NFC')
  const words = heardWordsOf(text)
  const echo = echoWords(words, lines)
  if (echo.size === 0) {
    return heard
  }
  // A short word ("o", "de", "em") goes with the word it leads, or with the last one at the end.
  const kept = words.filter((word, index) => {
    if (echo.has(word)) {
      return false
    }
    if (word.telling || !words.some((other) => other.telling)) {
      return true
    }
    const owner =
      words.slice(index + 1).find((other) => other.telling) ??
      words.slice(0, index).findLast((other) => other.telling)
    return owner !== undefined && !echo.has(owner)
  })
  if (kept.filter((word) => word.telling).length < OWN_WORDS) {
    return ''
  }
  return runsOf(text, words, new Set(kept)).join(' ')
}

/** The person's words as they were written, one piece for each stretch the echo did not cut. */
function runsOf(text: string, words: readonly HeardWord[], kept: Set<HeardWord>): string[] {
  const runs: string[] = []
  let first: HeardWord | null = null
  let last: HeardWord | null = null
  const close = (): void => {
    if (first && last) {
      const ending = /^[.!?…]+/u.exec(text.slice(last.end))?.[0] ?? ''
      runs.push(text.slice(first.start, last.end) + ending)
    }
    first = null
    last = null
  }
  for (const word of words) {
    if (kept.has(word)) {
      first ??= word
      last = word
    } else {
      close()
    }
  }
  close()
  return runs
}

/** The lines a voice reads aloud, for as long as the microphone may still hear them. */
export class SpokenEchoWindow {
  private lines: string[] = []
  // Null while a line is being read.
  private quietSince: number | null = null

  /** Told each line as it starts, and null when the voice stops. */
  note(line: string | null, now: number): void {
    if (line === null) {
      this.quietSince ??= now
      return
    }
    this.quietSince = null
    this.lines = [...this.lines.slice(1 - LINES_KEPT), line]
  }

  /** `text` without the reply heard back, while it may still be heard. */
  without(text: string, now: number): string {
    if (this.quietSince !== null && now - this.quietSince > SPOKEN_ECHO_AFTER_MS) {
      return text
    }
    return withoutSpokenEcho(text, this.lines)
  }
}
