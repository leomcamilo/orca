/** What a voice says of a reply: its opening, in plain sentences. */
export type SpeakableReply = {
  sentences: string[]
  /** The opening itself ran past the limit, so the listener is missing part of it. */
  cut: boolean
}

const MAX_SENTENCES = 3
const MAX_CHARACTERS = 420
// A lone "Done." says too little, so the paragraph after it is read too.
const SHORT_OPENING_CHARACTERS = 60
const MAX_SPOKEN_CODE_CHARACTERS = 40

type ReplyBlock = { kind: 'prose' | 'list'; text: string }

const FENCE = /^\s*(```|~~~)/
const HEADING = /^\s{0,3}#{1,6}\s/
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/
const TABLE_ROW = /^\s*\|/
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/
const QUOTE = /^\s*>\s?/

function endsSentence(text: string): boolean {
  return /[.!?…:]["')\]]?$/.test(text)
}

function replyBlocks(markdown: string): ReplyBlock[] {
  const blocks: ReplyBlock[] = []
  let lines: string[] = []
  let fenced = false
  const close = (): void => {
    const kept = lines.filter((line) => !HEADING.test(line) && !RULE.test(line))
    lines = []
    if (kept.length === 0 || kept.some((line) => TABLE_ROW.test(line))) {
      return
    }
    if (LIST_ITEM.test(kept[0])) {
      const items = kept
        .map((line) => line.replace(LIST_ITEM, '').trim())
        .filter((item) => item.length > 0)
        .map((item) => (endsSentence(item) ? item : `${item}.`))
      blocks.push({ kind: 'list', text: items.join(' ') })
      return
    }
    blocks.push({
      kind: 'prose',
      text: kept.map((line) => line.replace(QUOTE, '').trim()).join(' ')
    })
  }
  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    if (FENCE.test(line)) {
      close()
      fenced = !fenced
    } else if (fenced) {
      continue
    } else if (line.trim().length === 0) {
      close()
    } else {
      lines.push(line)
    }
  }
  close()
  return blocks
}

function spokenCode(code: string): string {
  const word = code.trim()
  const name = lastPathPart(word)
  return name.length > MAX_SPOKEN_CODE_CHARACTERS ? '' : name
}

function lastPathPart(path: string): string {
  // A date such as 13/11/2026 is not a path.
  if (!/[\\/]/.test(path) || /^[\d/]+\.?$/.test(path)) {
    return path
  }
  return path.split(/[\\/]/).findLast((part) => part.length > 0) ?? ''
}

// Message, session and task handles, UUIDs and commit hashes: on screen they are references, and
// read aloud they are noise.
const MACHINE_IDS =
  /\b(?:msg|ctx|term|run|task|dispatch|structworker|req|wf)_[A-Za-z0-9-]+|\borca_session_id:\S+|\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b|\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,40}\b/g

function plainWords(text: string): string {
  return (
    text
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/<https?:\/\/[^>\s]*>/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/`([^`]+)`/g, (_match, code: string) => spokenCode(code))
      // A path outside code reads as its last part; "and/or" has one slash and stays.
      .replace(/(?<![\w/.~-])[.~]?(?:\/?[\w.@~-]+\/){2,}[\w.@-]+/g, lastPathPart)
      .replace(MACHINE_IDS, '')
      .replace(/<\/?[a-zA-Z][^>]*>/g, '')
      .replace(/\*\*|__|~~/g, '')
      .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=[\s).,;:!?]|$)/g, '$1$2')
      .replace(/\p{Extended_Pictographic}️?/gu, '')
      .replace(/\(\s*\)/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s+([.,;:!?])/g, '$1')
      .trim()
  )
}

// "1." and "e.g." end in a period without ending a sentence.
const NOT_A_SENTENCE_END = /(?:^|\s)(?:\d+|[A-Za-z]|e\.g|i\.e|vs|Mr|Mrs|Ms|Dr|Dra|Sr|Sra)\.$/

function sentencesOf(text: string): string[] {
  const sentences: string[] = []
  let held = ''
  for (const piece of text.split(/(?<=[.!?…]["')\]]?)\s+(?=\S)/)) {
    held = held ? `${held} ${piece}` : piece
    if (!NOT_A_SENTENCE_END.test(held)) {
      sentences.push(held)
      held = ''
    }
  }
  if (held) {
    sentences.push(held)
  }
  return sentences
}

function withinLimit(sentence: string): string {
  if (sentence.length <= MAX_CHARACTERS) {
    return sentence
  }
  const head = sentence.slice(0, MAX_CHARACTERS)
  return head.slice(0, Math.max(head.lastIndexOf(' '), 1)).trimEnd()
}

/** The reply's opening paragraph as sentences a voice can read: no markdown, code, tables, links
 *  or paths. A reply that opens with a list is read from its first items. */
export function speakableReply(markdown: string): SpeakableReply {
  const blocks = replyBlocks(markdown)
    .map((block) => ({ ...block, text: plainWords(block.text) }))
    .filter((block) => block.text.length > 0)
  const first = blocks.findIndex((block) => block.kind === 'prose')
  const opening = first === -1 ? blocks[0] : blocks[first]
  if (!opening) {
    return { sentences: [], cut: false }
  }
  const next = first === -1 ? undefined : blocks[first + 1]
  // A colon hands over to a list or a block that is not read.
  const introduces = opening.text.endsWith(':')
  const text =
    !introduces && opening.text.length < SHORT_OPENING_CHARACTERS && next?.kind === 'prose'
      ? `${opening.text} ${next.text}`
      : opening.text
  const all = sentencesOf(introduces ? `${text.slice(0, -1)}.` : text)
  const sentences: string[] = []
  let characters = 0
  for (const sentence of all) {
    if (
      sentences.length > 0 &&
      (sentences.length >= MAX_SENTENCES || characters + sentence.length > MAX_CHARACTERS)
    ) {
      break
    }
    const spoken = withinLimit(sentence)
    sentences.push(spoken)
    characters += spoken.length
    if (spoken !== sentence) {
      break
    }
  }
  const whole = sentences.length === all.length && sentences.at(-1) === all.at(-1)
  return { sentences, cut: !whole || introduces }
}

/** One line for a prompt's title or question, which may carry a command or a path. */
export function speakablePhrase(text: string, maxCharacters = 160): string {
  const words = plainWords(text.split('\n')[0] ?? '')
  if (words.length <= maxCharacters) {
    return words
  }
  const head = words.slice(0, maxCharacters)
  return head.slice(0, Math.max(head.lastIndexOf(' '), 1)).trimEnd()
}
