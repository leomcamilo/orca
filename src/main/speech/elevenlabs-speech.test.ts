import { afterEach, describe, expect, it, vi } from 'vitest'
import { setMainHttpClient } from '../network/http-client'
import { listElevenLabsVoices, synthesizeElevenLabsSpeech } from './elevenlabs-speech'

vi.mock('../credentials/encrypted-api-key-file-store', () => ({
  createEncryptedApiKeyFileStore: () => ({
    has: () => true,
    read: () => 'xi-test-secret-key',
    save: () => {},
    clear: () => {}
  })
}))

type Sent = { url: string; init: RequestInit }

function answer(respond: () => Response): Sent[] {
  const sent: Sent[] = []
  setMainHttpClient({
    fetch: async (url, init = {}) => {
      sent.push({ url, init })
      return respond()
    },
    proxySession: () => null
  })
  return sent
}

afterEach(() => setMainHttpClient(null))

const LINE = { text: 'Tudo certo.', voice: 'EXAVITQu4vr4xnSDxMaL', model: 'eleven_flash_v2_5' }

describe('synthesizeElevenLabsSpeech', () => {
  it('asks ElevenLabs for the voice and model, with the key in its own header', async () => {
    const sent = answer(() => new Response(new Uint8Array([73, 68, 51])))
    expect(await synthesizeElevenLabsSpeech(LINE, new AbortController().signal)).toEqual({
      ok: true,
      audio: new Uint8Array([73, 68, 51])
    })
    expect(sent[0].url).toBe(
      'https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL?output_format=mp3_44100_128'
    )
    expect(sent[0].init.headers).toMatchObject({ 'xi-api-key': 'xi-test-secret-key' })
    expect(JSON.parse(String(sent[0].init.body))).toEqual({
      text: 'Tudo certo.',
      model_id: 'eleven_flash_v2_5'
    })
  })

  it('names an account out of credit, and sends nothing for a voice id that is not one', async () => {
    answer(
      () => new Response(JSON.stringify({ detail: { status: 'quota_exceeded' } }), { status: 401 })
    )
    expect(await synthesizeElevenLabsSpeech(LINE, new AbortController().signal)).toMatchObject({
      ok: false,
      failure: 'quota'
    })
    const sent = answer(() => new Response(new Uint8Array([1])))
    expect(
      await synthesizeElevenLabsSpeech(
        { ...LINE, voice: '../v1/user' },
        new AbortController().signal
      )
    ).toMatchObject({ ok: false, failure: 'refused' })
    expect(sent).toHaveLength(0)
  })
})

describe('listElevenLabsVoices', () => {
  it('lists the account voices by name', async () => {
    answer(
      () =>
        new Response(
          JSON.stringify({
            voices: [{ voice_id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah' }, { name: 'no id' }]
          })
        )
    )
    expect(await listElevenLabsVoices()).toEqual({
      ok: true,
      voices: [{ id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah' }]
    })
  })
})
