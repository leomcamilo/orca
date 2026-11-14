import { describe, expect, it } from 'vitest'
import { createAppVoiceSynthesizer } from './spoken-reply-app-voice'

const LUCIANA = {
  voiceURI: 'com.apple.voice.compact.pt-BR.Luciana',
  name: 'Luciana',
  lang: 'pt-BR',
  localService: true,
  default: false
}
const PICK = { voice: LUCIANA, language: 'pt-BR' }

function rig(rendered: Uint8Array | null | 'fails') {
  const events: string[] = []
  let endSound = (): void => {}
  let answerRender = (): void => {}
  const voice = createAppVoiceSynthesizer({
    render: (request) =>
      new Promise((resolve, reject) => {
        events.push(`render ${request.voice}: ${request.text}`)
        answerRender = () => (rendered === 'fails' ? reject(new Error('gone')) : resolve(rendered))
      }),
    audio: {
      play: async (_wav, onEnded) => {
        events.push('app plays')
        endSound = onEnded
        return { stop: () => events.push('app stops') }
      }
    },
    system: {
      speak: (text, _pick, onDone) => {
        events.push(`system speaks: ${text}`)
        endSound = onDone
      },
      cancel: () => events.push('system cancels')
    }
  })
  const settle = async (): Promise<void> => {
    answerRender()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  return { voice, events, settle, endSound: () => endSound() }
}

describe('createAppVoiceSynthesizer', () => {
  it('plays the rendered system voice through the app and reports its end once', async () => {
    const { voice, events, settle, endSound } = rig(new Uint8Array([1]))
    let done = 0
    voice.speak('Tudo certo.', PICK, () => (done += 1))
    await settle()
    expect(events).toEqual([
      'render com.apple.voice.compact.pt-BR.Luciana: Tudo certo.',
      'app plays'
    ])
    expect(voice.playsThroughApp()).toBe(true)
    endSound()
    endSound()
    expect(done).toBe(1)
    expect(voice.playsThroughApp()).toBe(false)
  })

  it('has the system speak when the host renders nothing or the render fails', async () => {
    for (const rendered of [null, 'fails'] as const) {
      const { voice, events, settle } = rig(rendered)
      voice.speak('Oi.', PICK, () => {})
      await settle()
      expect(events.at(-1)).toBe('system speaks: Oi.')
      expect(voice.playsThroughApp()).toBe(false)
    }
  })

  it('leaves a line with no matching voice to the system, which is told the language', async () => {
    const { voice, events, settle } = rig(new Uint8Array([1]))
    voice.speak('Oi.', { voice: null, language: 'pt' }, () => {})
    await settle()
    expect(events).toEqual(['system speaks: Oi.'])
  })

  it('ends a line cancelled while it renders, and never plays it', async () => {
    const { voice, events, settle } = rig(new Uint8Array([1]))
    let done = 0
    voice.speak('Longa.', PICK, () => (done += 1))
    voice.cancel()
    expect(done).toBe(1)
    await settle()
    expect(events).not.toContain('app plays')
    expect(done).toBe(1)
  })

  it('renders a reply\'s later lines while its first is spoken', async () => {
    const { voice, events, settle } = rig(new Uint8Array([1]))
    voice.prepare?.(['Um.', 'Dois.'], PICK)
    voice.speak('Um.', PICK, () => {})
    await settle()
    expect(events.filter((event) => event.startsWith('render'))).toEqual([
      'render com.apple.voice.compact.pt-BR.Luciana: Um.',
      'render com.apple.voice.compact.pt-BR.Luciana: Dois.'
    ])
  })
})
