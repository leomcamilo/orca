/** Who reads spoken replies: the operating system's voice, or OpenAI's speech API. */
export type SpokenReplyProvider = 'system' | 'openai'

/** The voices OpenAI lists for gpt-4o-mini-tts; it recommends marin and cedar for quality. */
export const OPENAI_SPEECH_VOICES = [
  'marin',
  'cedar',
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer',
  'verse'
] as const
export type OpenAiSpeechVoice = (typeof OPENAI_SPEECH_VOICES)[number]
export const DEFAULT_OPENAI_SPEECH_VOICE: OpenAiSpeechVoice = 'marin'

export function isOpenAiSpeechVoice(value: unknown): value is OpenAiSpeechVoice {
  return OPENAI_SPEECH_VOICES.some((voice) => voice === value)
}

/** A spoken line is far shorter; this only bounds what one request may send. */
export const SPEECH_SYNTHESIS_MAX_CHARACTERS = 1000

export type SpeechSynthesisRequest = {
  /** Names the request so a Quiet can cancel it while it is still out. */
  requestId: string
  text: string
  voice: OpenAiSpeechVoice
}

/** `no-key`: no OpenAI key is saved. `quota`: the account has no credit left. */
export type SpeechSynthesisFailure =
  | 'no-key'
  | 'unauthorized'
  | 'quota'
  | 'rate-limited'
  | 'timeout'
  | 'network'
  | 'refused'
  | 'cancelled'
  | 'unavailable'

export type SpeechSynthesisResult =
  | { ok: true; audio: Uint8Array }
  | { ok: false; failure: SpeechSynthesisFailure; message?: string }
