import { createEncryptedApiKeyFileStore } from '../credentials/encrypted-api-key-file-store'
import { getMainHttpClient } from '../network/http-client'
import { readSpeechAudio } from './speech-audio-response'
import { sanitizeOpenAiTranscriptionErrorMessage } from './openai-transcription-client'
import type {
  ElevenLabsVoiceListing,
  SpeechSynthesisFailure,
  SpeechSynthesisResult
} from '../../shared/speech-synthesis'

const store = createEncryptedApiKeyFileStore({
  fileName: 'elevenlabs-speech-key.enc',
  envelopePrefix: 'orca-elevenlabs-speech:v1:',
  providerLabel: 'ElevenLabs',
  logScope: 'speech'
})

export const hasElevenLabsApiKey = store.has
export const clearElevenLabsApiKey = store.clear

export function saveElevenLabsApiKey(apiKey: unknown): void {
  if (typeof apiKey !== 'string' || apiKey.trim() === '') {
    throw new Error('ElevenLabs API key is required')
  }
  store.save(apiKey.trim())
}

const API = 'https://api.elevenlabs.io'
const VOICE_ID = /^[A-Za-z0-9]{8,64}$/

function readKey(): string | null {
  try {
    return store.has() ? store.read() : null
  } catch {
    return null
  }
}

type SpeechFailure = Extract<SpeechSynthesisResult, { ok: false }>

// The error's own name says more than its HTTP status: a restricted key answers 401 or 403, and
// a free plan asking for a library voice answers 402, as an account out of credit does.
const FAILURE_BY_CODE = new Map<string, SpeechSynthesisFailure>([
  ['missing_permissions', 'missing-permission'],
  ['insufficient_permissions', 'missing-permission'],
  ['paid_plan_required', 'paid-plan'],
  ['subscription_required', 'paid-plan'],
  ['feature_not_available', 'paid-plan'],
  ['voice_not_found', 'voice-not-found'],
  ['quota_exceeded', 'quota'],
  ['insufficient_credits', 'quota'],
  ['invalid_api_key', 'unauthorized']
])
const FAILURE_BY_STATUS = new Map<number, SpeechSynthesisFailure>([
  [401, 'unauthorized'],
  [402, 'quota'],
  [429, 'rate-limited']
])

/** What ElevenLabs puts in an error body's `detail`, as far as it is read here. */
type ElevenLabsErrorDetail = { code?: unknown; status?: unknown; message?: unknown }

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

async function failureOf(response: Response, apiKey: string): Promise<SpeechFailure> {
  const data: { detail?: unknown } = await response.json().catch(() => ({}))
  const detail: ElevenLabsErrorDetail =
    typeof data.detail === 'object' && data.detail !== null ? data.detail : {}
  // Older answers name the error in `status`.
  const code = textOf(detail.code) || textOf(detail.status)
  const raw = textOf(detail.message)
  const message = raw ? sanitizeOpenAiTranscriptionErrorMessage(raw, apiKey) : undefined
  const failure = FAILURE_BY_CODE.get(code) ?? FAILURE_BY_STATUS.get(response.status)
  if (failure) {
    return { ok: false, failure, ...(message ? { message } : {}) }
  }
  return {
    ok: false,
    failure: 'refused',
    message: message ?? `ElevenLabs answered ${response.status}`
  }
}

/** One line of a spoken reply from ElevenLabs, as MP3. */
export async function synthesizeElevenLabsSpeech(
  request: { text: string; voice: string; model: string },
  signal: AbortSignal
): Promise<SpeechSynthesisResult> {
  const apiKey = readKey()
  if (!apiKey) {
    return { ok: false, failure: 'no-key' }
  }
  if (!VOICE_ID.test(request.voice)) {
    return { ok: false, failure: 'refused', message: 'Choose an ElevenLabs voice in Settings' }
  }
  const response = await getMainHttpClient().fetch(
    `${API}/v1/text-to-speech/${request.voice}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      credentials: 'omit',
      signal,
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: request.text, model_id: request.model })
    }
  )
  if (!response.ok) {
    return failureOf(response, apiKey)
  }
  const audio = await readSpeechAudio(response)
  return audio
    ? { ok: true, audio }
    : { ok: false, failure: 'refused', message: 'The speech audio was too large' }
}

/** The voices this ElevenLabs account can use, by name. */
export async function listElevenLabsVoices(): Promise<ElevenLabsVoiceListing> {
  const apiKey = readKey()
  if (!apiKey) {
    return { ok: false, failure: 'no-key' }
  }
  try {
    const response = await getMainHttpClient().fetch(`${API}/v2/voices?page_size=100`, {
      credentials: 'omit',
      signal: AbortSignal.timeout(15_000),
      headers: { 'xi-api-key': apiKey }
    })
    if (!response.ok) {
      return await failureOf(response, apiKey)
    }
    const data: { voices?: unknown } = await response.json()
    const voices = Array.isArray(data.voices) ? data.voices : []
    return {
      ok: true,
      voices: voices.flatMap((voice: { voice_id?: unknown; name?: unknown }) =>
        typeof voice.voice_id === 'string' && VOICE_ID.test(voice.voice_id)
          ? [
              {
                id: voice.voice_id,
                name: typeof voice.name === 'string' ? voice.name : voice.voice_id
              }
            ]
          : []
      )
    }
  } catch {
    return { ok: false, failure: 'network' }
  }
}
