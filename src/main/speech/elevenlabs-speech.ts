import { createEncryptedApiKeyFileStore } from '../credentials/encrypted-api-key-file-store'
import { getMainHttpClient } from '../network/http-client'
import { sanitizeOpenAiTranscriptionErrorMessage } from './openai-transcription-client'
import type { ElevenLabsVoiceListing, SpeechSynthesisResult } from '../../shared/speech-synthesis'

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

async function failureOf(response: Response, apiKey: string): Promise<SpeechSynthesisResult> {
  const data: { detail?: unknown } = await response.json().catch(() => ({}))
  const detail = typeof data.detail === 'object' && data.detail !== null ? data.detail : {}
  const status = 'status' in detail && typeof detail.status === 'string' ? detail.status : ''
  const raw = 'message' in detail && typeof detail.message === 'string' ? detail.message : ''
  const message = raw ? sanitizeOpenAiTranscriptionErrorMessage(raw, apiKey) : undefined
  const withMessage = message ? { message } : {}
  // A restricted key answers 401 or 403 with this status, naming the permission it lacks.
  if (status === 'missing_permissions') {
    return { ok: false, failure: 'missing-permission', ...withMessage }
  }
  if (response.status === 401) {
    return {
      ok: false,
      failure: status === 'quota_exceeded' ? 'quota' : 'unauthorized',
      ...withMessage
    }
  }
  if (response.status === 402) {
    return { ok: false, failure: 'quota', ...withMessage }
  }
  if (response.status === 429) {
    return { ok: false, failure: 'rate-limited', ...withMessage }
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
  return { ok: true, audio: new Uint8Array(await response.arrayBuffer()) }
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
      const failed = await failureOf(response, apiKey)
      return failed.ok ? { ok: false, failure: 'refused' } : failed
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
