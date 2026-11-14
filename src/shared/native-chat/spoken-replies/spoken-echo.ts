import { spokenPortuguese } from './spoken-portuguese'

/** Share of the words heard that must come back in order for three or more to be the voice's. */
export const SPOKEN_ECHO_SHARE = 0.6
/** The last words of a reply reach the transcript after the voice stops: the pause that ends a
 *  segment, then the transcription. */
export const SPOKEN_ECHO_AFTER_MS = 6000
// The line being read and the two before it: a segment can span two lines, and it lands late.
const LINES_KEPT = 3

function wordsOf(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0)
}

// Words of one or two letters ("a", "de", "em") are in nearly every sentence; counted, they would
// make most of what the person says look like the reply.
function telling(word: string): boolean {
  return word.length > 2
}

/** How many of `heard` appear in `said` in the same order. */
function inOrder(heard: readonly string[], said: readonly string[]): number {
  let above = Array.from({ length: said.length + 1 }, () => 0)
  for (const word of heard) {
    const row = [0]
    for (let index = 0; index < said.length; index += 1) {
      row.push(word === said[index] ? above[index] + 1 : Math.max(above[index + 1], row[index]))
    }
    above = row
  }
  return above[said.length]
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

/** Whether text dictated while a reply was read is that reply coming back through the
 *  microphone. Its words longer than two letters are compared with two lines read one after the
 *  other: one or two words must all be there, in order; of three or more, at least 60%. */
export function isSpokenEcho(heard: string, lines: readonly string[]): boolean {
  const all = wordsOf(heard)
  const long = all.filter(telling)
  // Only short words: those are what is compared, then.
  const keepShort = long.length === 0
  const words = keepShort ? all : long
  if (words.length === 0 || lines.length === 0) {
    return false
  }
  const needed = words.length <= 2 ? words.length : Math.ceil(words.length * SPOKEN_ECHO_SHARE)
  return stretches(lines).some((stretch) => {
    const said = wordsOf(stretch).filter((word) => keepShort || telling(word))
    return inOrder(words, said) >= needed
  })
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

  heard(text: string, now: number): boolean {
    if (this.quietSince !== null && now - this.quietSince > SPOKEN_ECHO_AFTER_MS) {
      return false
    }
    return isSpokenEcho(text, this.lines)
  }
}
