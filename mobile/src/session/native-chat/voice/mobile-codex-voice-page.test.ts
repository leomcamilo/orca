import { describe, expect, it } from 'vitest'
import type { BridgeVoiceResult } from '../../../mobile-web-shell/bridge/native-capabilities/bridge-voice-verb'
import { newerVoiceResult, voiceCallRunsFor, voicePageView } from './mobile-codex-voice-page'
import { MOBILE_CODEX_VOICE_IDLE } from './mobile-codex-voice-view'
import {
  mobileCodexVoiceFailureLabel,
  mobileCodexVoiceStatusLabel
} from './mobile-codex-voice-copy'

function result(
  revision: number,
  sessionId: string,
  view: Partial<BridgeVoiceResult['view']>
): BridgeVoiceResult {
  return { revision, sessionId, view: { ...MOBILE_CODEX_VOICE_IDLE, captions: [], ...view } }
}

describe('Voice mode on the session page', () => {
  it("shows the app's call only in its own chat", () => {
    const live = result(4, 'chat-1', { status: 'live', speaker: false })
    expect(voicePageView(live, null, 'chat-1').status).toBe('live')
    expect(voicePageView(live, null, 'chat-2')).toMatchObject({ status: 'idle', speaker: false })
    expect(voiceCallRunsFor(live, 'chat-1')).toBe(true)
    expect(voiceCallRunsFor(live, 'chat-2')).toBe(false)
    expect(voiceCallRunsFor(result(5, 'chat-1', { status: 'ended' }), 'chat-1')).toBe(false)
  })

  it('reads a failure a newer app names as a dropped connection', () => {
    const ended = result(6, 'chat-1', { status: 'ended', failure: { kind: 'satellite-lost' } })
    const t = (_key: string, fallback: string) => fallback
    expect(mobileCodexVoiceStatusLabel(t, voicePageView(ended, null, 'chat-1'))).toBe(
      mobileCodexVoiceFailureLabel(t, 'connection-lost')
    )
  })

  it('lets a page-only notice win over the call', () => {
    const notice = {
      ...MOBILE_CODEX_VOICE_IDLE,
      status: 'ended' as const,
      failure: { kind: 'unsupported' as const }
    }
    expect(voicePageView(null, notice, 'chat-1')).toBe(notice)
  })

  it('keeps the newest reply when replies cross', () => {
    const later = result(8, 'chat-1', { status: 'live' })
    const earlier = result(7, 'chat-1', { status: 'connecting' })
    expect(newerVoiceResult(later, earlier)).toBe(later)
    expect(newerVoiceResult(later, result(8, 'chat-1', { status: 'live' }))).toBe(later)
    expect(newerVoiceResult(earlier, later)).toBe(later)
  })
})
