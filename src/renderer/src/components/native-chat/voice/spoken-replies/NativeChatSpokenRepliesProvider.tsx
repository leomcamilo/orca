import type { AgentType } from '../../../../../../shared/agent-status/contracts/agent-status-types'
import {
  NativeChatSpokenRepliesContext,
  useNativeChatSpokenReplies
} from './use-native-chat-spoken-replies'

/** Owns the chat's spoken replies for the composer's button, the strip and the journal reader. */
export function NativeChatSpokenRepliesProvider(props: {
  pane: { sessionId: string; agent: AgentType; isVisible: boolean }
  children: React.ReactNode
}): React.JSX.Element {
  const spoken = useNativeChatSpokenReplies(props.pane)
  return (
    <NativeChatSpokenRepliesContext value={spoken}>{props.children}</NativeChatSpokenRepliesContext>
  )
}
