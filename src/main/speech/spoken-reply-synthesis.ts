import {
  DEFAULT_ELEVENLABS_SPEECH_MODEL,
  isElevenLabsSpeechModel,
  isOpenAiSpeechVoice,
  isSpeechSynthesisProvider,
  PAID_SPEECH_PROVIDERS,
  SPEECH_SYNTHESIS_MAX_CHARACTERS,
  type SpeechSynthesisProvider,
  type SpeechSynthesisResult
} from '../../shared/speech-synthesis'
import { synthesizeElevenLabsSpeech } from './elevenlabs-speech'
import { synthesizeOpenAiCompatibleSpeech, synthesizeOpenAiSpeech } from './openai-speech-synthesis'
import type { SpeechSynthesisUsageLedger } from './speech-synthesis-usage'

const SPEECH_TIMEOUT_MS = 30_000
const MAX_REQUEST_ID_LENGTH = 64
const MAX_VOICE_LENGTH = 64

type ValidRequest = {
  requestId: string
  provider: SpeechSynthesisProvider
  text: string
  voice: string
  model: string
}

function readRequest(request: unknown): ValidRequest | null {
  if (typeof request !== 'object' || request === null) {
    return null
  }
  const { requestId, provider, text, voice, model }: Partial<Record<keyof ValidRequest, unknown>> =
    request
  if (
    typeof requestId !== 'string' ||
    requestId.length === 0 ||
    requestId.length > MAX_REQUEST_ID_LENGTH ||
    !isSpeechSynthesisProvider(provider) ||
    typeof text !== 'string' ||
    text.trim().length === 0 ||
    text.length > SPEECH_SYNTHESIS_MAX_CHARACTERS ||
    typeof voice !== 'string' ||
    voice.length > MAX_VOICE_LENGTH ||
    (provider === 'openai' && !isOpenAiSpeechVoice(voice)) ||
    (model !== undefined && !isElevenLabsSpeechModel(model))
  ) {
    return null
  }
  return {
    requestId,
    provider,
    text,
    voice,
    model: isElevenLabsSpeechModel(model) ? model : DEFAULT_ELEVENLABS_SPEECH_MODEL
  }
}

function synthesizeWith(
  request: ValidRequest,
  signal: AbortSignal
): Promise<SpeechSynthesisResult> {
  switch (request.provider) {
    case 'openai':
      return synthesizeOpenAiSpeech(request, signal)
    case 'openai-compatible':
      return synthesizeOpenAiCompatibleSpeech(request, signal)
    case 'elevenlabs':
      return synthesizeElevenLabsSpeech(request, signal)
  }
}

/** Reads spoken-reply lines with a speech service: one request each, cancellable by id, bounded in
 *  time and size, and refused before anything is sent when it would pass the month's limit for the
 *  paid services. Keys stay in the main process; the caller only sees audio or a failure. */
export function createSpokenReplySynthesis(deps: {
  usage: SpeechSynthesisUsageLedger
  /** Characters the paid services may read this month; null for no limit. */
  monthlyLimit: () => number | null
}) {
  const pending = new Map<string, AbortController>()

  const synthesize = async (
    request: unknown,
    callerGone?: AbortSignal
  ): Promise<SpeechSynthesisResult> => {
    const valid = readRequest(request)
    if (!valid) {
      return { ok: false, failure: 'refused', message: 'Invalid speech request' }
    }
    // Registered before the count, so a Quiet that arrives while it is written still stops it.
    const cancel = new AbortController()
    pending.get(valid.requestId)?.abort()
    pending.set(valid.requestId, cancel)
    const stopped = (): boolean => cancel.signal.aborted || callerGone?.aborted === true
    const timeout = AbortSignal.timeout(SPEECH_TIMEOUT_MS)
    try {
      // Counted when sent: a request cut short may still be billed.
      const reserved = await deps.usage
        .reserve(valid.provider, valid.text.length, deps.monthlyLimit())
        // A usage file that cannot be written must not leave a paid service unlimited.
        .catch(() => (PAID_SPEECH_PROVIDERS.includes(valid.provider) ? 'unrecorded' : true))
      // Quieted during the count: nothing is sent. The line stays counted, erring toward the limit.
      if (stopped()) {
        return { ok: false, failure: 'cancelled' }
      }
      if (reserved === 'unrecorded') {
        return {
          ok: false,
          failure: 'refused',
          message: 'The usage count could not be saved, so nothing was sent'
        }
      }
      if (!reserved) {
        return { ok: false, failure: 'over-limit' }
      }
      const result = await synthesizeWith(
        valid,
        AbortSignal.any([cancel.signal, timeout, ...(callerGone ? [callerGone] : [])])
      )
      return result
    } catch {
      if (stopped()) {
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
  const cancel = (requestId: unknown): void => {
    if (typeof requestId === 'string') {
      pending.get(requestId)?.abort()
    }
  }

  return { synthesize, cancel }
}
