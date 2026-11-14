import { describe, expect, it } from 'vitest'
import { openAiCompatibleSpeechUrl } from './openai-compatible-speech-voice-store'

describe('openAiCompatibleSpeechUrl', () => {
  it('reaches a server on this computer, the local network or the tailnet over plain http', () => {
    expect(openAiCompatibleSpeechUrl('http://localhost:8880/v1')).toBe(
      'http://localhost:8880/v1/audio/speech'
    )
    expect(openAiCompatibleSpeechUrl('http://100.121.155.28:8880/v1/')).toBe(
      'http://100.121.155.28:8880/v1/audio/speech'
    )
    expect(openAiCompatibleSpeechUrl('http://192.168.0.20:8880/v1/audio/speech')).toBe(
      'http://192.168.0.20:8880/v1/audio/speech'
    )
    expect(openAiCompatibleSpeechUrl('http://casa.tail88aa35.ts.net/v1')).toBe(
      'http://casa.tail88aa35.ts.net/v1/audio/speech'
    )
  })

  it('needs https for any other host, and keeps keys out of the address', () => {
    expect(() => openAiCompatibleSpeechUrl('http://voice.example.com/v1')).toThrow(/https/)
    expect(openAiCompatibleSpeechUrl('https://voice.example.com/v1')).toBe(
      'https://voice.example.com/v1/audio/speech'
    )
    expect(() => openAiCompatibleSpeechUrl('https://user:secret@voice.example.com/v1')).toThrow(
      /API Key field/
    )
  })
})
