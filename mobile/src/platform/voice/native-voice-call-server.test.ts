import { describe, expect, it, vi } from 'vitest'
import {
  BRIDGE_NATIVE_VERB_NAMES,
  readBridgeNativeVerbCall
} from '../../mobile-web-shell/bridge/native-capabilities/bridge-native-verbs'
import {
  BRIDGE_VOICE_CAPTION_MAX_CHARS,
  BRIDGE_VOICE_VERB,
  voiceResultSchema
} from '../../mobile-web-shell/bridge/native-capabilities/bridge-voice-verb'
import { MobileCodexVoiceController } from '../../session/native-chat/voice/mobile-codex-voice-controller'
import { MOBILE_CODEX_VOICE_IDLE } from '../../session/native-chat/voice/mobile-codex-voice-view'
import { serveNativeVoiceCall, wireSnapshot } from './native-voice-call-server'

function idleController() {
  return new MobileCodexVoiceController({
    readClient: () => null,
    hostStream: () => () => ({ unsubscribe: () => {} }),
    openMedia: () => Promise.reject(new Error('no microphone in tests')),
    microphoneFailure: () => 'microphone-unavailable',
    routeOutput: () => ''
  })
}

describe('native.voice.call', () => {
  it('is a shell verb a session page reaches only when granted', () => {
    expect(BRIDGE_NATIVE_VERB_NAMES).toContain(BRIDGE_VOICE_VERB)
    const params = { action: 'start', sessionId: 'chat-1', muted: false, speaker: true }
    expect(
      readBridgeNativeVerbCall({ method: BRIDGE_VOICE_VERB, granted: [], params })
    ).toMatchObject({ ok: false, refusal: 'ungranted' })
    expect(
      readBridgeNativeVerbCall({ method: BRIDGE_VOICE_VERB, granted: [BRIDGE_VOICE_VERB], params })
    ).toMatchObject({ ok: true, verb: BRIDGE_VOICE_VERB })
    expect(
      readBridgeNativeVerbCall({
        method: BRIDGE_VOICE_VERB,
        granted: [BRIDGE_VOICE_VERB],
        params: { action: 'start', sessionId: 'chat-1' }
      })
    ).toMatchObject({ ok: false, refusal: 'invalid-params' })
  })

  it('answers every action with the call as it stands', async () => {
    const controller = idleController()
    const muted = await serveNativeVoiceCall(controller, { action: 'mute', muted: true })
    expect(muted.view.muted).toBe(true)
    const read = await serveNativeVoiceCall(controller, { action: 'read' })
    expect(voiceResultSchema.parse(read)).toEqual(read)
    expect(read.revision).toBe(muted.revision)
  })

  it('waits on read until the call changes', async () => {
    vi.useFakeTimers()
    try {
      const controller = idleController()
      const after = controller.snapshot().revision
      const waiting = serveNativeVoiceCall(controller, { action: 'read', after }, 5_000)
      controller.setSpeaker(false)
      expect((await waiting).view.speaker).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('clips captions so a long spoken answer still fits the reply', () => {
    const long = 'palavra '.repeat(500)
    const wired = wireSnapshot({
      revision: 3,
      sessionId: 'chat-1',
      view: {
        ...MOBILE_CODEX_VOICE_IDLE,
        status: 'live',
        captions: [{ id: 'item-1', role: 'assistant', text: long }]
      }
    })
    expect(wired.view.captions[0]?.text).toHaveLength(BRIDGE_VOICE_CAPTION_MAX_CHARS)
    expect(voiceResultSchema.safeParse(wired).success).toBe(true)
  })
})
