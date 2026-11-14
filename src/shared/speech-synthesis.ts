/** Who reads spoken replies: the system's voice, or a speech service. */
export type SpokenReplyProvider = 'system' | 'openai' | 'openai-compatible' | 'elevenlabs'
export type SpeechSynthesisProvider = Exclude<SpokenReplyProvider, 'system'>

export function isSpeechSynthesisProvider(value: unknown): value is SpeechSynthesisProvider {
  return value === 'openai' || value === 'openai-compatible' || value === 'elevenlabs'
}

/** Services billed by the character, which the monthly limit counts. A compatible server is the
 *  person's own. */
export const PAID_SPEECH_PROVIDERS: readonly SpeechSynthesisProvider[] = ['openai', 'elevenlabs']

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

/** ElevenLabs models that read Brazilian Portuguese, with their list price per 1,000 characters
 *  (elevenlabs.io/pricing/api, read 2026-11-14). */
export const ELEVENLABS_SPEECH_MODELS = [
  { id: 'eleven_flash_v2_5', usdPerThousandCharacters: 0.04 },
  { id: 'eleven_multilingual_v2', usdPerThousandCharacters: 0.08 }
] as const
export type ElevenLabsSpeechModel = (typeof ELEVENLABS_SPEECH_MODELS)[number]['id']
export const DEFAULT_ELEVENLABS_SPEECH_MODEL: ElevenLabsSpeechModel = 'eleven_flash_v2_5'

export function isElevenLabsSpeechModel(value: unknown): value is ElevenLabsSpeechModel {
  return ELEVENLABS_SPEECH_MODELS.some((model) => model.id === value)
}

/** OpenAI gives no price per minute any more; its earlier estimate was US$ 0.015 a minute, about
 *  900 spoken characters. */
export const OPENAI_SPEECH_USD_PER_THOUSAND_CHARACTERS_ESTIMATE = 0.0167

/** Characters the paid services may read in a month before replies stop being read, unless the
 *  person sets another limit. About US$ 0.80 on ElevenLabs Flash. */
export const DEFAULT_SPOKEN_REPLY_MONTHLY_CHARACTER_LIMIT = 20_000

/** A spoken line is far shorter; this only bounds what one request may send. */
export const SPEECH_SYNTHESIS_MAX_CHARACTERS = 1000

export type SpeechSynthesisRequest = {
  /** Names the request so a Quiet can cancel it while it is still out. */
  requestId: string
  provider: SpeechSynthesisProvider
  text: string
  /** OpenAI's voice name, or an ElevenLabs voice id; a compatible server uses its saved voice. */
  voice: string
  /** ElevenLabs only. */
  model?: string
}

/** `no-key`: nothing is saved to reach the service. `over-limit`: the month's character limit for
 *  paid services would be passed, so nothing was sent. */
export type SpeechSynthesisFailure =
  | 'no-key'
  | 'unauthorized'
  | 'quota'
  | 'rate-limited'
  | 'over-limit'
  | 'timeout'
  | 'network'
  | 'refused'
  | 'cancelled'
  | 'unavailable'

export type SpeechSynthesisResult =
  | { ok: true; audio: Uint8Array }
  | { ok: false; failure: SpeechSynthesisFailure; message?: string }

/** Characters sent to each service this calendar month, on this computer. */
export type SpeechSynthesisUsage = {
  month: string
  characters: Partial<Record<SpeechSynthesisProvider, number>>
}

export type ElevenLabsVoice = { id: string; name: string }

export type ElevenLabsVoiceListing =
  | { ok: true; voices: ElevenLabsVoice[] }
  | { ok: false; failure: SpeechSynthesisFailure; message?: string }

/** A server that speaks OpenAI's speech API, usually the person's own. */
export type OpenAiCompatibleSpeechVoiceProvider = {
  baseUrl: string
  model: string
  voice: string
  /** Empty for servers that take no key. */
  apiKey: string
}

export type OpenAiCompatibleSpeechVoiceProviderSummary = Omit<
  OpenAiCompatibleSpeechVoiceProvider,
  'apiKey'
> & { hasApiKey: boolean }
