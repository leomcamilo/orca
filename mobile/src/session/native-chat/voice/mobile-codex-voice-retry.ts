import type { MobileCodexVoiceFailure } from './mobile-codex-voice-call'

export const MOBILE_CODEX_VOICE_MAX_RETRIES = 5
const DELAYS_MS = [1_000, 2_000, 3_000, 5_000, 8_000]
// Ends a network or provider can recover from; microphone and capability refusals need the person.
const RECOVERABLE: ReadonlySet<MobileCodexVoiceFailure> = new Set([
  'connection-lost',
  'transport-closed',
  'connect-timeout',
  'answer-timeout',
  'provider-exited',
  'busy'
])

/** Milliseconds before the next attempt in the same chat, or null to end the call. */
export function nextMobileCodexVoiceRetry(
  kind: MobileCodexVoiceFailure,
  retriesSoFar: number,
  everLive: boolean
): number | null {
  if (!RECOVERABLE.has(kind) || retriesSoFar >= MOBILE_CODEX_VOICE_MAX_RETRIES) {
    return null
  }
  // Busy before this phone ever went live means another device holds the chat's voice, not our own closing call.
  if (kind === 'busy' && !everLive && retriesSoFar >= 1) {
    return null
  }
  return DELAYS_MS[retriesSoFar] ?? null
}
