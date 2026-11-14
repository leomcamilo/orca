import { describe, expect, it } from 'vitest'
import type {
  SpeechSynthesisRequest,
  SpeechSynthesisResult
} from '../../../../../../shared/speech-synthesis'
import { createApiVoiceSynthesizer } from './spoken-reply-api-voice'
import type { SpokenReplyVoicePick } from './spoken-reply-speech'

const OPENAI: SpokenReplyVoicePick = { voice: null, language: 'pt', api: { voice: 'marin' } }
const SYSTEM: SpokenReplyVoicePick = { voice: null, language: 'pt' }

function rig() {
  const events: string[] = []
  const answers = new Map<string, (result: SpeechSynthesisResult) => void>()
  let endSound = (): void => {}
  const voice = createApiVoiceSynthesizer({
    synthesize: (request: SpeechSynthesisRequest) =>
      new Promise((resolve) => {
        events.push(`ask ${request.voice}: ${request.text}`)
        answers.set(request.text, resolve)
      }),
    cancel: (requestId) => events.push(`cancel ${requestId}`),
    audio: {
      play: async (_sound, onEnded) => {
        events.push('app plays')
        endSound = onEnded
        return { stop: () => events.push('app stops') }
      }
    },
    system: {
      speak: (text) => events.push(`system speaks: ${text}`),
      cancel: () => {}
    },
    onFailure: (failure) => events.push(`failure ${failure}`)
  })
  const answer = async (text: string, result: SpeechSynthesisResult): Promise<void> => {
    answers.get(text)?.(result)
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return { voice, events, answer, endSound: () => endSound() }
}

const SOUND: SpeechSynthesisResult = { ok: true, audio: new Uint8Array([1]) }

describe('createApiVoiceSynthesizer', () => {
  it('plays what the service returns and reports the line done once', async () => {
    const { voice, events, answer, endSound } = rig()
    const done: (boolean | undefined)[] = []
    voice.speak('Tudo certo.', OPENAI, (failed) => done.push(failed))
    await answer('Tudo certo.', SOUND)
    expect(events).toEqual(['ask marin: Tudo certo.', 'app plays'])
    endSound()
    endSound()
    expect(done).toEqual([undefined])
  })

  it('reports a failure and ends the reply, without falling back to the system voice', async () => {
    const { voice, events, answer } = rig()
    const done: (boolean | undefined)[] = []
    voice.speak('Oi.', OPENAI, (failed) => done.push(failed))
    await answer('Oi.', { ok: false, failure: 'no-key' })
    expect(events).toEqual(['ask marin: Oi.', 'failure no-key'])
    expect(done).toEqual([true])
  })

  it('cancels the requests still out when quieted, and never plays their answer', async () => {
    const { voice, events, answer } = rig()
    const done: (boolean | undefined)[] = []
    voice.prepare?.(['Um.', 'Dois.'], OPENAI)
    voice.speak('Um.', OPENAI, (failed) => done.push(failed))
    voice.cancel()
    expect(done).toEqual([undefined])
    expect(events.filter((event) => event.startsWith('cancel'))).toHaveLength(2)
    await answer('Um.', SOUND)
    expect(events).not.toContain('app plays')
    expect(done).toEqual([undefined])
  })

  it('asks for a reply’s later lines while its first is read, once each', async () => {
    const { voice, events, answer, endSound } = rig()
    voice.prepare?.(['Um.', 'Dois.'], OPENAI)
    voice.speak('Um.', OPENAI, () => {})
    await answer('Um.', SOUND)
    endSound()
    voice.speak('Dois.', OPENAI, () => {})
    await answer('Dois.', SOUND)
    expect(events.filter((event) => event.startsWith('ask'))).toEqual([
      'ask marin: Um.',
      'ask marin: Dois.'
    ])
  })

  it('leaves a line picked for the system voice to the system', () => {
    const { voice, events } = rig()
    voice.speak('Oi.', SYSTEM, () => {})
    expect(events).toEqual(['system speaks: Oi.'])
  })
})
