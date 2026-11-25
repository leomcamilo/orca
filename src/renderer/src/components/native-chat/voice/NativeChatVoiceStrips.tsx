import type { AgentJournalRenderItem } from '../../../../../shared/agent-session/journal/agent-session-journal-types'
import { NativeChatCodexVoiceStripSlot } from './NativeChatCodexVoiceProvider'
import { NativeChatSpokenReplyStripSlot } from './spoken-replies/NativeChatSpokenReplyStrip'
import { useSpokenReplyJournal } from './spoken-replies/use-native-chat-spoken-replies'

/** The chat's voice strips above the composer: a Codex call's, and the reply being read aloud.
 *  Mounted whenever the chat is, so it also feeds the journal to the voice that reads replies. */
export function NativeChatVoiceStrips(props: {
  chat: { journalItems: readonly AgentJournalRenderItem[] }
  /** The kind of the chat's open prompt, if any. */
  promptKind?: string
}): React.JSX.Element {
  useSpokenReplyJournal(props.chat.journalItems)
  return (
    <>
      <NativeChatCodexVoiceStripSlot promptKind={props.promptKind} />
      <NativeChatSpokenReplyStripSlot />
    </>
  )
}
