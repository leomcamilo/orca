import type { MobileCodexVoiceCaption, MobileCodexVoiceFailure } from './mobile-codex-voice-call'
import { MOBILE_CODEX_VOICE_MAX_RETRIES } from './mobile-codex-voice-retry'

export const MOBILE_CODEX_VOICE_STATUSES = [
  'idle',
  'starting',
  'connecting',
  'live',
  'reconnecting',
  'ended'
] as const

export type MobileCodexVoiceStatus = (typeof MOBILE_CODEX_VOICE_STATUSES)[number]

export type MobileCodexVoiceView = {
  status: MobileCodexVoiceStatus
  muted: boolean
  speaker: boolean
  /** The iOS output port in use, such as BluetoothHFP or Speaker; empty when unknown. */
  outputPort: string
  speaking: 'user' | 'assistant' | null
  captions: readonly MobileCodexVoiceCaption[]
  failure: { kind: MobileCodexVoiceFailure; message?: string } | null
  attempt: number
  maxAttempts: number
}

/** What the composer draws and presses; the call itself lives in the app, not in the page. */
export type MobileCodexVoice = {
  view: MobileCodexVoiceView
  start: () => void
  stop: () => void
  setMuted: (muted: boolean) => void
  setSpeaker: (speaker: boolean) => void
  dismiss: () => void
}

export const MOBILE_CODEX_VOICE_IDLE: MobileCodexVoiceView = {
  status: 'idle',
  muted: false,
  speaker: true,
  outputPort: '',
  speaking: null,
  captions: [],
  failure: null,
  attempt: 0,
  maxAttempts: MOBILE_CODEX_VOICE_MAX_RETRIES
}

const KNOWN_FAILURES = [
  'microphone-denied',
  'microphone-unavailable',
  'connect-timeout',
  'connection-lost',
  'provider-error',
  'transport-closed',
  'answer-timeout',
  'provider-exited',
  'busy',
  'not-running',
  'unsupported'
] as const satisfies readonly MobileCodexVoiceFailure[]

/** A kind from the app's call; one this page does not know reads as a dropped connection. */
export function readMobileCodexVoiceFailure(kind: string): MobileCodexVoiceFailure {
  return KNOWN_FAILURES.find((known) => known === kind) ?? 'connection-lost'
}
