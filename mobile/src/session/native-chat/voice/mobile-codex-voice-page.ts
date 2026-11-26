import type { BridgeVoiceResult } from '../../../mobile-web-shell/bridge/native-capabilities/bridge-voice-verb'
import {
  MOBILE_CODEX_VOICE_IDLE,
  readMobileCodexVoiceFailure,
  type MobileCodexVoiceView
} from './mobile-codex-voice-view'

/** Whether the app's call is running for this chat, so the page keeps reading it. */
export function voiceCallRunsFor(
  remote: BridgeVoiceResult | null,
  sessionId: string | null
): boolean {
  return (
    remote !== null &&
    sessionId !== null &&
    remote.sessionId === sessionId &&
    remote.view.status !== 'idle' &&
    remote.view.status !== 'ended'
  )
}

/** What this chat's composer shows: a page-only notice first, then the app's call when it is this chat's. */
export function voicePageView(
  remote: BridgeVoiceResult | null,
  local: MobileCodexVoiceView | null,
  sessionId: string | null
): MobileCodexVoiceView {
  if (local) {
    return local
  }
  if (!remote || sessionId === null || remote.sessionId !== sessionId) {
    return {
      ...MOBILE_CODEX_VOICE_IDLE,
      muted: remote?.view.muted ?? false,
      speaker: remote?.view.speaker ?? true
    }
  }
  const { failure } = remote.view
  return {
    ...remote.view,
    failure: failure
      ? {
          kind: readMobileCodexVoiceFailure(failure.kind),
          ...(failure.message ? { message: failure.message } : {})
        }
      : null
  }
}

/** Keeps the newest reply: a read answered late must not undo an action answered first, and a
 *  wait that ran out with no change keeps the same object so nothing redraws. */
export function newerVoiceResult(
  current: BridgeVoiceResult | null,
  next: BridgeVoiceResult
): BridgeVoiceResult {
  return current !== null && current.revision >= next.revision ? current : next
}
