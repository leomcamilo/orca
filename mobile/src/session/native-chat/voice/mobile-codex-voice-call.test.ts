import { describe, expect, it, vi } from 'vitest'
import type { AgentSessionVoiceEvent } from '../../../../../src/shared/agent-session/agent-session-voice-conversation'
import {
  MobileCodexVoiceCall,
  speakingFromChannelEvent,
  type MobileCodexVoiceCallState,
  type VoiceMedia
} from './mobile-codex-voice-call'

// Frames as Codex 0.170's realtime v3 sent them on oai-events during the 25/11/2026 round trip.
const assistantTurnCreated =
  '{"type":"turn.created","turn":{"id":"turn_b","end_ms":5200,"role":"assistant","start_ms":5000,"transcript":" girassol"}}'
const assistantTurnDone =
  '{"type":"turn.done","turn":{"id":"turn_b","end_ms":8000,"role":"assistant","start_ms":5000,"transcript":" girassol quarenta e dois"}}'
const userTurnDone =
  '{"type":"turn.done","turn":{"id":"turn_a","end_ms":5200,"role":"user","start_ms":600,"transcript":" Qual é a palavra"}}'

describe('speakingFromChannelEvent', () => {
  it('reads realtime v3 turns by role', () => {
    expect(speakingFromChannelEvent(assistantTurnCreated, null)).toBe('assistant')
    expect(speakingFromChannelEvent(assistantTurnDone, 'assistant')).toBeNull()
    expect(speakingFromChannelEvent(userTurnDone, 'assistant')).toBeUndefined()
  })
})

function fakeMedia() {
  const media = {
    setMuted: vi.fn(),
    openChannel: vi.fn(() => ({ close: vi.fn() })),
    onConnectionState: vi.fn<(listener: (state: string) => void) => void>(),
    createOffer: vi.fn(async () => 'v=0 offer'),
    applyAnswer: vi.fn(async () => {}),
    close: vi.fn()
  } satisfies VoiceMedia
  return media
}

describe('MobileCodexVoiceCall', () => {
  it('applies the answer, goes live and releases everything when the host ends the call', async () => {
    const media = fakeMedia()
    let emit: (event: AgentSessionVoiceEvent) => void = () => {}
    const unsubscribe = vi.fn()
    const states: MobileCodexVoiceCallState[] = []
    const call = new MobileCodexVoiceCall(
      {
        openMedia: async () => media,
        subscribe: (offer, onEvent) => {
          expect(offer).toBe('v=0 offer')
          emit = onEvent
          return { unsubscribe }
        },
        microphoneFailure: () => 'microphone-denied'
      },
      (state) => states.push(state)
    )
    await call.start()
    emit({ type: 'answer', sdp: 'v=0 answer' })
    expect(media.applyAnswer).toHaveBeenCalledWith('v=0 answer')
    media.onConnectionState.mock.calls[0]?.[0]('connected')
    expect(call.current.phase).toBe('live')
    emit({ type: 'ended', reason: 'transport-closed' })
    expect(call.current).toMatchObject({ phase: 'ended', failure: { kind: 'transport-closed' } })
    expect(media.close).toHaveBeenCalledTimes(1)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })

  it('names a refused microphone and never asks the host', async () => {
    const subscribe = vi.fn()
    const call = new MobileCodexVoiceCall(
      {
        openMedia: async () => {
          throw new Error('denied')
        },
        subscribe,
        microphoneFailure: () => 'microphone-denied'
      },
      () => {}
    )
    await call.start()
    expect(call.current.failure).toEqual({ kind: 'microphone-denied' })
    expect(subscribe).not.toHaveBeenCalled()
  })
})
