import type { NativeChatBlock } from '../native-chat-types'

// The opening alone identifies the note, so its wording can change without stranding saved rows.
const SPOKEN_REPLY_REQUEST_OPENING = '\n\n[Orca Voice mode: '
// A reader may hand the message over with a newline or space after it.
const SPOKEN_REPLY_REQUEST_PATTERN = /\n\n\[Orca Voice mode: [^\n]*\]\s*$/

const SPOKEN_REPLY_REQUEST = `${SPOKEN_REPLY_REQUEST_OPENING}I will hear your reply read aloud instead of reading it. Begin your final reply with one short paragraph of at most three sentences that makes sense by ear alone: plain spoken words in the language I am writing in, with no markdown, lists, code, file paths or URLs. Say the result first, then anything I must know or decide. After that paragraph, write the full detail as you normally would; it stays on screen.]`

/** The message as its sender wrote it. */
export function withoutSpokenReplyRequest(text: string): string {
  return text.replace(SPOKEN_REPLY_REQUEST_PATTERN, '')
}

/** Asks the agent, in the message itself, to open its reply with a paragraph meant for listening.
 *  Commands take their text as arguments, so they go out untouched. */
export function withSpokenReplyRequest(text: string): string {
  const written = withoutSpokenReplyRequest(text)
  if (written.trim().length === 0 || /^\s*\//.test(written)) {
    return written
  }
  return `${written.trimEnd()}${SPOKEN_REPLY_REQUEST}`
}

/** Display only: the provider and the journal keep the note. Unchanged blocks keep their identity. */
export function blocksWithoutSpokenReplyRequest<Block extends NativeChatBlock>(
  blocks: Block[]
): Block[] {
  let changed = false
  const shown = blocks.map((block) => {
    if (block.type !== 'text' || !block.text.includes(SPOKEN_REPLY_REQUEST_OPENING)) {
      return block
    }
    const text = withoutSpokenReplyRequest(block.text)
    if (text === block.text) {
      return block
    }
    changed = true
    return { ...block, text }
  })
  return changed ? shown : blocks
}
