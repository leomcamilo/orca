import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setMainHttpClient } from '../network/http-client'
import { cancelOpenAiSpeech, synthesizeOpenAiSpeech } from './openai-speech-synthesis'

const key = { saved: true }
vi.mock('./openai-api-key-store', () => ({
  hasOpenAiSpeechApiKey: () => key.saved,
  readOpenAiSpeechApiKey: () => 'sk-test-secret-key'
}))

type Sent = { url: string; init: RequestInit }

function answer(respond: (sent: Sent) => Promise<Response> | Response): Sent[] {
  const sent: Sent[] = []
  setMainHttpClient({
    fetch: async (url, init = {}) => {
      const request = { url, init }
      sent.push(request)
      return respond(request)
    },
    proxySession: () => null
  })
  return sent
}

const REQUEST = { requestId: 'r1', text: 'Tudo certo.', voice: 'marin' }

beforeEach(() => {
  key.saved = true
})

afterEach(() => setMainHttpClient(null))

describe('synthesizeOpenAiSpeech', () => {
  it('asks OpenAI for WAV in the chosen voice and returns its bytes', async () => {
    const sent = answer(() => new Response(new Uint8Array([82, 73, 70, 70])))
    expect(await synthesizeOpenAiSpeech(REQUEST)).toEqual({
      ok: true,
      audio: new Uint8Array([82, 73, 70, 70])
    })
    expect(sent).toHaveLength(1)
    expect(sent[0].url).toBe('https://api.openai.com/v1/audio/speech')
    expect(sent[0].init.headers).toMatchObject({ Authorization: 'Bearer sk-test-secret-key' })
    expect(JSON.parse(String(sent[0].init.body))).toMatchObject({
      model: 'gpt-4o-mini-tts',
      input: 'Tudo certo.',
      voice: 'marin',
      response_format: 'wav'
    })
  })

  it('sends nothing without a saved key, or for a voice OpenAI does not list', async () => {
    const sent = answer(() => new Response(new Uint8Array([1])))
    key.saved = false
    expect(await synthesizeOpenAiSpeech(REQUEST)).toEqual({ ok: false, failure: 'no-key' })
    key.saved = true
    expect(await synthesizeOpenAiSpeech({ ...REQUEST, voice: 'Luciana' })).toMatchObject({
      ok: false,
      failure: 'refused'
    })
    expect(sent).toHaveLength(0)
  })

  it('names a refused key and an empty account without repeating the key', async () => {
    answer(
      () =>
        new Response(
          JSON.stringify({ error: { message: 'Incorrect API key provided: sk-test-secret-key.' } }),
          { status: 401 }
        )
    )
    const refused = await synthesizeOpenAiSpeech(REQUEST)
    expect(refused).toMatchObject({ ok: false, failure: 'unauthorized' })
    expect(JSON.stringify(refused)).not.toContain('sk-test-secret-key')

    answer(
      () =>
        new Response(
          JSON.stringify({ error: { code: 'insufficient_quota', message: 'No credit.' } }),
          { status: 429 }
        )
    )
    expect(await synthesizeOpenAiSpeech(REQUEST)).toMatchObject({ ok: false, failure: 'quota' })
  })

  it('abandons a request still out when it is cancelled', async () => {
    answer(
      ({ init }) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
    )
    const pending = synthesizeOpenAiSpeech(REQUEST)
    cancelOpenAiSpeech('r1')
    expect(await pending).toEqual({ ok: false, failure: 'cancelled' })
  })
})
