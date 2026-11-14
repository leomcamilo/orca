import { getMainHttpClient } from '../network/http-client'
import { hasOpenAiSpeechApiKey, readOpenAiSpeechApiKey } from './openai-api-key-store'
import {
  readOpenAiErrorMessage,
  type OpenAiTranscriptionResponse
} from './openai-transcription-client'
import {
  isOpenAiSpeechVoice,
  SPEECH_SYNTHESIS_MAX_CHARACTERS,
  type SpeechSynthesisResult
} from '../../shared/speech-synthesis'

export const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech'
// OpenAI shuts this model down on 2027-01-06 and names no replacement on this endpoint.
export const OPENAI_SPEECH_MODEL = 'gpt-4o-mini-tts'
const SPEECH_TIMEOUT_MS = 30_000
// About five minutes of 24 kHz mono WAV; a spoken line is seconds long.
const MAX_AUDIO_BYTES = 16 * 1024 * 1024
const MAX_REQUEST_ID_LENGTH = 64
// Its voices are tuned for English; asked, they keep the accent of the text's own language.
const SPEECH_INSTRUCTIONS =
  "Speak naturally, at a calm conversational pace, with the accent native to the text's language (Brazilian Portuguese for Portuguese)."

const pending = new Map<string, AbortController>()

type ValidRequest = { requestId: string; text: string; voice: string }

function readRequest(request: unknown): ValidRequest | null {
  if (typeof request !== 'object' || request === null) {
    return null
  }
  const { requestId, text, voice }: Partial<Record<keyof ValidRequest, unknown>> = request
  if (
    typeof requestId !== 'string' ||
    requestId.length === 0 ||
    requestId.length > MAX_REQUEST_ID_LENGTH ||
    typeof text !== 'string' ||
    text.trim().length === 0 ||
    text.length > SPEECH_SYNTHESIS_MAX_CHARACTERS ||
    !isOpenAiSpeechVoice(voice)
  ) {
    return null
  }
  return { requestId, text, voice }
}

async function failureOf(response: Response, apiKey: string): Promise<SpeechSynthesisResult> {
  const data: OpenAiTranscriptionResponse & { error?: { code?: unknown } } = await response
    .json()
    .catch(() => ({}))
  const message = readOpenAiErrorMessage(data, apiKey)
  if (response.status === 401) {
    return { ok: false, failure: 'unauthorized', ...(message ? { message } : {}) }
  }
  if (response.status === 429) {
    const failure = data.error?.code === 'insufficient_quota' ? 'quota' : 'rate-limited'
    return { ok: false, failure, ...(message ? { message } : {}) }
  }
  return {
    ok: false,
    failure: 'refused',
    message: message ?? `OpenAI answered ${response.status}`
  }
}

/** One line of a spoken reply as WAV, from OpenAI's speech API with the key saved for dictation.
 *  The key stays in this process; the renderer only ever sees audio or a failure. */
export async function synthesizeOpenAiSpeech(request: unknown): Promise<SpeechSynthesisResult> {
  const valid = readRequest(request)
  if (!valid) {
    return { ok: false, failure: 'refused', message: 'Invalid speech request' }
  }
  if (!hasOpenAiSpeechApiKey()) {
    return { ok: false, failure: 'no-key' }
  }
  let apiKey: string
  try {
    apiKey = readOpenAiSpeechApiKey()
  } catch {
    return { ok: false, failure: 'no-key' }
  }
  const cancel = new AbortController()
  pending.get(valid.requestId)?.abort()
  pending.set(valid.requestId, cancel)
  const timeout = AbortSignal.timeout(SPEECH_TIMEOUT_MS)
  try {
    const response = await getMainHttpClient().fetch(OPENAI_SPEECH_URL, {
      method: 'POST',
      credentials: 'omit',
      signal: AbortSignal.any([cancel.signal, timeout]),
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OPENAI_SPEECH_MODEL,
        input: valid.text,
        voice: valid.voice,
        instructions: SPEECH_INSTRUCTIONS,
        // The guide's lowest-latency format, and one the renderer decodes as is.
        response_format: 'wav'
      })
    })
    if (!response.ok) {
      return await failureOf(response, apiKey)
    }
    const declared = Number(response.headers.get('content-length') ?? 0)
    if (declared > MAX_AUDIO_BYTES) {
      await response.body?.cancel()
      return { ok: false, failure: 'refused', message: 'The speech audio was too large' }
    }
    const audio = new Uint8Array(await response.arrayBuffer())
    if (audio.byteLength > MAX_AUDIO_BYTES) {
      return { ok: false, failure: 'refused', message: 'The speech audio was too large' }
    }
    return { ok: true, audio }
  } catch {
    if (cancel.signal.aborted) {
      return { ok: false, failure: 'cancelled' }
    }
    return { ok: false, failure: timeout.aborted ? 'timeout' : 'network' }
  } finally {
    if (pending.get(valid.requestId) === cancel) {
      pending.delete(valid.requestId)
    }
  }
}

/** Abandons a request still out, so a reply quieted mid-request costs no more audio. */
export function cancelOpenAiSpeech(requestId: unknown): void {
  if (typeof requestId === 'string') {
    pending.get(requestId)?.abort()
  }
}
