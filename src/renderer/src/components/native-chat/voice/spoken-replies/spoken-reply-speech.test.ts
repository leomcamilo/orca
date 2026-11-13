import { describe, expect, it } from 'vitest'
import {
  pickSpokenReplyVoice,
  SpokenReplySpeech,
  type SpokenReplyLine,
  type SpokenReplyVoice
} from './spoken-reply-speech'

function voice(name: string, lang: string, localService = true): SpokenReplyVoice {
  return { voiceURI: `uri:${name}`, name, lang, localService, default: false }
}

function rig() {
  const spoken: string[] = []
  const lines: (SpokenReplyLine | null)[] = []
  let finish: (() => void) | null = null
  let cancels = 0
  const speech = new SpokenReplySpeech(
    {
      speak: (text, _voice, onDone) => {
        spoken.push(text)
        finish = onDone
      },
      cancel: () => {
        cancels += 1
        // The system reports a cancelled line as ended.
        finish?.()
      }
    },
    (line) => lines.push(line)
  )
  return { speech, spoken, lines, finish: () => finish?.(), cancels: () => cancels }
}

describe('SpokenReplySpeech', () => {
  it('speaks a reply line by line, then the next chat in the queue', () => {
    const { speech, spoken, lines, finish } = rig()
    speech.say('chat-a', ['One.', 'Two.'], null)
    speech.say('chat-b', ['Other.'], null)
    expect(spoken).toEqual(['One.'])
    finish()
    finish()
    expect(spoken).toEqual(['One.', 'Two.', 'Other.'])
    finish()
    expect(lines.at(-1)).toBeNull()
  })

  it('silences one chat without touching the reply another chat has waiting', () => {
    const { speech, spoken, lines, cancels } = rig()
    speech.say('chat-a', ['One.', 'Two.'], null)
    speech.say('chat-b', ['Other.'], null)
    speech.silence('chat-a')
    expect(cancels()).toBe(1)
    expect(spoken).toEqual(['One.', 'Other.'])
    expect(lines.at(-1)).toEqual({ owner: 'chat-b', text: 'Other.' })
  })
})

describe('pickSpokenReplyVoice', () => {
  const voices = [
    voice('Samantha', 'en-US'),
    voice('Joana', 'pt-PT'),
    voice('Luciana', 'pt-BR'),
    voice('Cloud', 'pt-BR', false)
  ]

  it('keeps the chosen voice, and otherwise picks an on-device voice by language and region', () => {
    expect(pickSpokenReplyVoice(voices, 'uri:Joana', ['en'])?.name).toBe('Joana')
    expect(pickSpokenReplyVoice(voices, 'uri:Gone', ['pt', 'pt-BR'])?.name).toBe('Luciana')
    expect(pickSpokenReplyVoice(voices, undefined, ['en-GB'])?.name).toBe('Samantha')
    expect(pickSpokenReplyVoice(voices, undefined, ['ja'])).toBeNull()
  })
})
