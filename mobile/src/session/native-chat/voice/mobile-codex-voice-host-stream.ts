import type { AgentSessionVoiceEvent } from '../../../../../src/shared/agent-session/agent-session-voice-conversation'
import type { RpcClient } from '../../../transport/rpc/rpc-client-contract'
import { isMobileMethodUnavailableError } from '../../../transport/rpc/mobile-method-unavailable'
import type { MobileCodexVoiceFailure, MobileCodexVoiceSubscribe } from './mobile-codex-voice-call'

const VOICE_EVENT_TYPES = new Set([
  'answer',
  'transcript',
  'error',
  'voice-unavailable',
  'ended',
  'refused'
])

/** One host stream per attempt; closing it stops Codex's side. */
export function mobileCodexVoiceHostStream(
  client: RpcClient,
  sessionId: string
): MobileCodexVoiceSubscribe {
  return (offerSdp, onEvent, onFailure) => {
    let open = true
    const fail = (failure: { kind: MobileCodexVoiceFailure; message?: string }): void => {
      if (open) {
        open = false
        onFailure(failure)
      }
    }
    const dispose = client.subscribe(
      'agentSession.voiceConversation',
      { sessionId, offerSdp },
      (result) => {
        if (!open) {
          return
        }
        // An RPC failure frame carries `error`; the voice's own error event carries only a message.
        const failure = streamFailure(result)
        if (failure) {
          fail(failure)
          return
        }
        if (isVoiceEvent(result)) {
          if (result.type === 'ended' || result.type === 'refused') {
            open = false
          }
          onEvent(result)
        }
      },
      {
        // An offer belongs to one peer, so a new connection must not re-send it; the call starts over.
        holdReplay: () => {
          setTimeout(() => fail({ kind: 'connection-lost' }), 0)
          return true
        }
      }
    )
    return {
      unsubscribe: () => {
        open = false
        dispose()
      }
    }
  }
}

function isVoiceEvent(value: unknown): value is AgentSessionVoiceEvent {
  return (
    typeof value === 'object' &&
    value !== null &&
    'type' in value &&
    typeof value.type === 'string' &&
    VOICE_EVENT_TYPES.has(value.type)
  )
}

function streamFailure(value: unknown): { kind: MobileCodexVoiceFailure; message?: string } | null {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return null
  }
  if (value.type === 'end') {
    return { kind: 'connection-lost' }
  }
  const error =
    'error' in value && typeof value.error === 'object' && value.error !== null ? value.error : null
  if (value.type !== 'error' || !error) {
    return null
  }
  const code = error && 'code' in error && typeof error.code === 'string' ? error.code : undefined
  const message =
    'message' in value && typeof value.message === 'string' ? value.message : undefined
  return isMobileMethodUnavailableError(code, message)
    ? { kind: 'unsupported' }
    : { kind: 'connection-lost', ...(message ? { message } : {}) }
}
