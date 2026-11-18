import { getMainHttpClient } from '../network/http-client'
import { readSpeechAudio } from './speech-audio-response'
import { hasOpenAiSpeechApiKey, readOpenAiSpeechApiKey } from './openai-api-key-store'
import {
  readOpenAiErrorMessage,
  type OpenAiTranscriptionResponse
} from './openai-transcription-client'
import {
  openAiCompatibleSpeechUrl,
  readOpenAiCompatibleSpeechVoice
} from './openai-compatible-speech-voice-store'
import type { SpeechSynthesisResult } from '../../shared/speech-synthesis'

export const OPENAI_SPEECH_URL = 'https://api.openai.com/v1/audio/speech'
// OpenAI shuts this model down on 2027-01-06 and names no replacement on this endpoint.
export const OPENAI_SPEECH_MODEL = 'gpt-4o-mini-tts'
// Its voices are tuned for English; asked, they keep the accent of the text's own language.
const SPEECH_INSTRUCTIONS =
  "Speak naturally, at a calm conversational pace, with the accent native to the text's language (Brazilian Portuguese for Portuguese)."

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
    message: message ?? `The server answered ${response.status}`
  }
}

async function postSpeech(
  url: string,
  apiKey: string,
  body: Record<string, string>,
  signal: AbortSignal
): Promise<SpeechSynthesisResult> {
  const response = await getMainHttpClient().fetch(url, {
    method: 'POST',
    credentials: 'omit',
    signal,
    // Local servers that take no key get no Authorization header.
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      'Content-Type': 'application/json'
    },
    // The guide's lowest-latency format, and one the renderer decodes as is.
    body: JSON.stringify({ ...body, response_format: 'wav' })
  })
  if (!response.ok) {
    return failureOf(response, apiKey)
  }
  const audio = await readSpeechAudio(response)
  return audio
    ? { ok: true, audio }
    : { ok: false, failure: 'refused', message: 'The speech audio was too large' }
}

/** One line from OpenAI's speech API, with the key saved for dictation. */
export async function synthesizeOpenAiSpeech(
  request: { text: string; voice: string },
  signal: AbortSignal
): Promise<SpeechSynthesisResult> {
  if (!hasOpenAiSpeechApiKey()) {
    return { ok: false, failure: 'no-key' }
  }
  let apiKey: string
  try {
    apiKey = readOpenAiSpeechApiKey()
  } catch {
    return { ok: false, failure: 'no-key' }
  }
  return postSpeech(
    OPENAI_SPEECH_URL,
    apiKey,
    {
      model: OPENAI_SPEECH_MODEL,
      input: request.text,
      voice: request.voice,
      instructions: SPEECH_INSTRUCTIONS
    },
    signal
  )
}

/** One line from the person's own server that speaks OpenAI's speech API. Its model and voice
 *  are the ones saved with it; not every compatible server takes instructions, so none are sent. */
export async function synthesizeOpenAiCompatibleSpeech(
  request: { text: string },
  signal: AbortSignal
): Promise<SpeechSynthesisResult> {
  let server: ReturnType<typeof readOpenAiCompatibleSpeechVoice>
  try {
    server = readOpenAiCompatibleSpeechVoice()
  } catch {
    server = null
  }
  if (!server) {
    return { ok: false, failure: 'no-key' }
  }
  return postSpeech(
    openAiCompatibleSpeechUrl(server.baseUrl),
    server.apiKey,
    { model: server.model, input: request.text, voice: server.voice },
    signal
  )
}
