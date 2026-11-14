import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setMainHttpClient } from '../network/http-client'
import { createSpokenReplySynthesis } from './spoken-reply-synthesis'
import { createSpeechSynthesisUsageLedger } from './speech-synthesis-usage'

const key = { saved: true }
vi.mock('./openai-api-key-store', () => ({
  hasOpenAiSpeechApiKey: () => key.saved,
  readOpenAiSpeechApiKey: () => 'sk-test-secret-key'
}))
vi.mock('./openai-compatible-speech-voice-store', () => ({
  readOpenAiCompatibleSpeechVoice: () => ({
    baseUrl: 'http://100.121.155.28:8880/v1',
    model: 'kokoro',
    voice: 'pf_dora',
    apiKey: ''
  }),
  openAiCompatibleSpeechUrl: (base: string) => `${base}/audio/speech`
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

const REQUEST = { requestId: 'r1', provider: 'openai', text: 'Tudo certo.', voice: 'marin' }
let directory: string
let limit: number | null

function synthesis() {
  return createSpokenReplySynthesis({
    usage: createSpeechSynthesisUsageLedger(
      () => join(directory, 'usage.json'),
      () => new Date(2026, 10, 14)
    ),
    monthlyLimit: () => limit
  })
}

beforeEach(() => {
  key.saved = true
  limit = null
  directory = mkdtempSync(join(tmpdir(), 'spoken-reply-usage-'))
})

afterEach(() => {
  setMainHttpClient(null)
  rmSync(directory, { recursive: true, force: true })
})

describe('createSpokenReplySynthesis', () => {
  it('asks OpenAI for WAV in the chosen voice, returns its bytes and counts what it sent', async () => {
    const sent = answer(() => new Response(new Uint8Array([82, 73, 70, 70])))
    const speech = synthesis()
    expect(await speech.synthesize(REQUEST)).toEqual({
      ok: true,
      audio: new Uint8Array([82, 73, 70, 70])
    })
    expect(sent[0].url).toBe('https://api.openai.com/v1/audio/speech')
    expect(sent[0].init.headers).toMatchObject({ Authorization: 'Bearer sk-test-secret-key' })
    expect(JSON.parse(String(sent[0].init.body))).toMatchObject({
      model: 'gpt-4o-mini-tts',
      input: 'Tudo certo.',
      voice: 'marin',
      response_format: 'wav'
    })
    const ledger = createSpeechSynthesisUsageLedger(
      () => join(directory, 'usage.json'),
      () => new Date(2026, 10, 14)
    )
    expect(await ledger.read()).toEqual({ month: '2026-11', characters: { openai: 11 } })
  })

  it('sends a compatible server its saved model and voice, with no key header when it has none', async () => {
    const sent = answer(() => new Response(new Uint8Array([1])))
    await synthesis().synthesize({ ...REQUEST, provider: 'openai-compatible', voice: '' })
    expect(sent[0].url).toBe('http://100.121.155.28:8880/v1/audio/speech')
    expect(sent[0].init.headers).not.toHaveProperty('Authorization')
    expect(JSON.parse(String(sent[0].init.body))).toMatchObject({
      model: 'kokoro',
      voice: 'pf_dora'
    })
  })

  it('sends nothing without a saved key, or for a voice OpenAI does not list', async () => {
    const sent = answer(() => new Response(new Uint8Array([1])))
    const speech = synthesis()
    key.saved = false
    expect(await speech.synthesize(REQUEST)).toEqual({ ok: false, failure: 'no-key' })
    key.saved = true
    expect(await speech.synthesize({ ...REQUEST, voice: 'Luciana' })).toMatchObject({
      ok: false,
      failure: 'refused'
    })
    expect(sent).toHaveLength(0)
  })

  it('refuses a paid line past the month’s limit before sending it, and never limits a compatible server', async () => {
    const sent = answer(() => new Response(new Uint8Array([1])))
    writeFileSync(
      join(directory, 'usage.json'),
      JSON.stringify({ month: '2026-11', characters: { elevenlabs: 5 } })
    )
    limit = 15
    const speech = synthesis()
    expect(await speech.synthesize(REQUEST)).toEqual({ ok: false, failure: 'over-limit' })
    expect(sent).toHaveLength(0)
    await speech.synthesize({ ...REQUEST, provider: 'openai-compatible', voice: '' })
    expect(sent).toHaveLength(1)
  })

  it('names a refused key and an empty account without repeating the key', async () => {
    answer(
      () =>
        new Response(
          JSON.stringify({ error: { message: 'Incorrect API key provided: sk-test-secret-key.' } }),
          { status: 401 }
        )
    )
    const refused = await synthesis().synthesize(REQUEST)
    expect(refused).toMatchObject({ ok: false, failure: 'unauthorized' })
    expect(JSON.stringify(refused)).not.toContain('sk-test-secret-key')
    answer(
      () =>
        new Response(
          JSON.stringify({ error: { code: 'insufficient_quota', message: 'No credit.' } }),
          {
            status: 429
          }
        )
    )
    expect(await synthesis().synthesize(REQUEST)).toMatchObject({ ok: false, failure: 'quota' })
  })

  it('abandons a request still out when it is cancelled or its window goes away', async () => {
    const hang = ({ init }: Sent) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    answer(hang)
    const speech = synthesis()
    const pending = speech.synthesize(REQUEST)
    await new Promise((resolve) => setTimeout(resolve, 0))
    speech.cancel('r1')
    expect(await pending).toEqual({ ok: false, failure: 'cancelled' })

    const gone = new AbortController()
    const orphaned = speech.synthesize({ ...REQUEST, requestId: 'r2' }, gone.signal)
    await new Promise((resolve) => setTimeout(resolve, 0))
    gone.abort()
    expect(await orphaned).toEqual({ ok: false, failure: 'cancelled' })
  })
})
