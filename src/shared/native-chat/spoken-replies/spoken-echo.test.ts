import { describe, expect, it } from 'vitest'
import { SpokenEchoWindow, isSpokenEcho } from './spoken-echo'

const READ = [
  'Terminei a revisão do módulo de voz.',
  'O gate passou em 38 de 38 checks.',
  'Falta só o teste com áudio de verdade.'
]

describe('isSpokenEcho', () => {
  it('drops the reply heard back through the microphone, however the transcript writes it', () => {
    // Numbers in words, accents dropped, a segment across two lines, a word lost.
    expect(isSpokenEcho('o gate passou em trinta e oito de trinta e oito checks', READ)).toBe(true)
    expect(isSpokenEcho('Terminei a revisao do modulo de voz. O gate passou', READ)).toBe(true)
    expect(isSpokenEcho('falta o teste com audio de verdade', READ)).toBe(true)
  })

  it('drops the person repeating the reply on purpose, unless they add words of their own', () => {
    // The same words, said over the reply, cannot be told from its echo.
    expect(isSpokenEcho('o gate passou', READ)).toBe(true)
    expect(isSpokenEcho('O gate passou mesmo? Então manda o SHA', READ)).toBe(false)
    expect(isSpokenEcho('pode parar de ler', READ)).toBe(false)
  })
})

describe('SpokenEchoWindow', () => {
  it('drops the echo while the reply is read and for six seconds after it stops', () => {
    const echo = new SpokenEchoWindow()
    echo.note(READ[1], 1000)
    expect(echo.heard('o gate passou em 38 de 38', 2000)).toBe(true)
    echo.note(null, 3000)
    expect(echo.heard('o gate passou em 38 de 38', 9000)).toBe(true)
    expect(echo.heard('o gate passou em 38 de 38', 9001)).toBe(false)
  })
})
