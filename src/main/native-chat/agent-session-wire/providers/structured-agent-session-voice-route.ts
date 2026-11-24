import type { StructuredAgentSessionAdapter as Adapter } from './structured-agent-session-adapter'

export function routeVoiceConversation(
  liveOwner: (sessionId: string) => Adapter | null
): NonNullable<Adapter['startVoiceConversation']> {
  return (input) => {
    const owner = liveOwner(input.sessionId)
    if (!owner?.startVoiceConversation) {
      input.emit({ type: 'refused', reason: owner ? 'unsupported' : 'not-running' })
      return { stop: () => {} }
    }
    return owner.startVoiceConversation(input)
  }
}
