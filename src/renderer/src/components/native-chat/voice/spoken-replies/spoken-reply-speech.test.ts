import { describe, expect, it } from 'vitest'
import {
  pickSpokenReplyVoice,
  SpokenReplySpeech,
  type SpokenReplyLine,
  type SpokenReplyVoice,
  type SpokenReplyVoicePick
} from './spoken-reply-speech'

const SYSTEM_CHOICE: SpokenReplyVoicePick = { voice: null, language: null }

function voice(name: string, lang: string, localService = true): SpokenReplyVoice {
  return { voiceURI: `uri:${name}`, name, lang, localService, default: false }
}

function rig() {
  const spoken: string[] = []
  const lines: (SpokenReplyLine | null)[] = []
  let finish: (() => void) | null = null
  let afterCancel: (() => void) | null = null
  const speech = new SpokenReplySpeech(
    {
      speak: (text, _pick, onDone) => {
        spoken.push(text)
        finish = onDone
      },
      // The system reports a cancelled line as ended.
      cancel: () => finish?.()
    },
    (line) => lines.push(line),
    (next) => {
      afterCancel = next
    }
  )
  return {
    speech,
    spoken,
    lines,
    finish: () => finish?.(),
    settle: () => afterCancel?.()
  }
}

describe('SpokenReplySpeech', () => {
  it('speaks a reply line by line, then the next chat in the queue', () => {
    const { speech, spoken, lines, finish } = rig()
    speech.say('chat-a', ['One.', 'Two.'], SYSTEM_CHOICE)
    speech.say('chat-b', ['Other.'], SYSTEM_CHOICE)
    expect(spoken).toEqual(['One.'])
    finish()
    finish()
    expect(spoken).toEqual(['One.', 'Two.', 'Other.'])
    finish()
    expect(lines.at(-1)).toBeNull()
  })

  it('silences one chat, then speaks what another has waiting once the cancel settles', () => {
    const { speech, spoken, lines, settle } = rig()
    speech.say('chat-a', ['One.', 'Two.'], SYSTEM_CHOICE)
    speech.say('chat-b', ['Other.'], SYSTEM_CHOICE)
    speech.silence('chat-a')
    expect(lines.at(-1)).toBeNull()
    // A reply asked for before the cancel settles waits with the rest.
    speech.say('chat-a', ['Again.'], SYSTEM_CHOICE)
    expect(spoken).toEqual(['One.'])
    settle()
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
    expect(pickSpokenReplyVoice(voices, 'uri:Joana', ['en']).voice?.name).toBe('Joana')
    expect(pickSpokenReplyVoice(voices, 'uri:Gone', ['pt', 'pt-BR']).voice?.name).toBe('Luciana')
    expect(pickSpokenReplyVoice(voices, undefined, ['en-GB']).voice?.name).toBe('Samantha')
  })

  it('names the wanted language when the system has no voice for it', () => {
    expect(pickSpokenReplyVoice(voices, undefined, ['ja', 'en'])).toEqual({
      voice: voices[0],
      language: 'en-US'
    })
    expect(pickSpokenReplyVoice([], undefined, ['pt', 'en'])).toEqual({
      voice: null,
      language: 'pt'
    })
  })
})
