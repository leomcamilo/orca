import { describe, expect, it } from 'vitest'
import { MAX_SPEECH_AUDIO_BYTES, readSpeechAudio } from './speech-audio-response'

function streamOf(chunks: Uint8Array[], pulled: { count: number }): ReadableStream<Uint8Array> {
  return new ReadableStream({
    pull(controller) {
      const chunk = chunks[pulled.count]
      pulled.count += 1
      if (chunk) {
        controller.enqueue(chunk)
      } else {
        controller.close()
      }
    }
  })
}

describe('readSpeechAudio', () => {
  it('returns the whole body of a line-sized answer', async () => {
    const pulled = { count: 0 }
    const audio = await readSpeechAudio(
      new Response(streamOf([new Uint8Array([1, 2]), new Uint8Array([3])], pulled))
    )
    expect(audio).toEqual(new Uint8Array([1, 2, 3]))
  })

  it('refuses an answer that declares or streams more than a line could take, without reading it all', async () => {
    const declared = new Response(new Uint8Array([1]), {
      headers: { 'content-length': String(MAX_SPEECH_AUDIO_BYTES + 1) }
    })
    expect(await readSpeechAudio(declared)).toBeNull()

    const half = new Uint8Array(MAX_SPEECH_AUDIO_BYTES / 2 + 1)
    const pulled = { count: 0 }
    const streamed = new Response(streamOf([half, half, half, half], pulled))
    expect(await readSpeechAudio(streamed)).toBeNull()
    expect(pulled.count).toBeLessThan(4)
  })
})
