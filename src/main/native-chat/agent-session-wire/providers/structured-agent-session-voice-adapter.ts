import type { AgentSessionVoiceEvent } from '../../../../shared/agent-session/agent-session-voice-conversation'

export type StructuredAgentSessionVoiceAdapter = {
  /** The live child's native voice for its own thread; the client owns the media, and `emit`
   *  receives this attempt's frames until one is terminal. Absent when the agent has none. */
  startVoiceConversation?(input: {
    sessionId: string
    offerSdp: string
    /** Sent only when the live child lists it; otherwise the provider's default voice speaks. */
    voice?: string
    emit: (event: AgentSessionVoiceEvent) => void
  }): { stop: () => void }
  /** Voices the live child offers for that voice session; null without a live child or a listing. */
  listVoiceConversationVoices?(sessionId: string): Promise<string[] | null>
}
