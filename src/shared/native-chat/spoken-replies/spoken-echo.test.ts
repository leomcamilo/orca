import { describe, expect, it } from 'vitest'
import { SpokenEchoWindow, withoutSpokenEcho } from './spoken-echo'

const READ = [
  'Terminei a revisão do módulo de voz.',
  'O gate passou em 38 de 38 checks.',
  'Falta só o teste com áudio de verdade.'
]

describe('withoutSpokenEcho', () => {
  it('drops the reply heard back through the microphone, however the transcript writes it', () => {
    // Numbers in words, accents dropped, a segment across two lines, a word lost.
    expect(withoutSpokenEcho('o gate passou em trinta e oito de trinta e oito checks', READ)).toBe(
      ''
    )
    expect(withoutSpokenEcho('Terminei a revisao do modulo de voz. O gate passou', READ)).toBe('')
    expect(withoutSpokenEcho('falta o teste com audio de verdade', READ)).toBe('')
  })

  it('drops the person repeating the reply on purpose, unless they add words of their own', () => {
    // The same words, said over the reply, cannot be told from its echo.
    expect(withoutSpokenEcho('o gate passou', READ)).toBe('')
    expect(withoutSpokenEcho('O gate passou mesmo? Então manda o SHA', READ)).toBe(
      'O gate passou mesmo? Então manda o SHA'
    )
    expect(withoutSpokenEcho('pode parar de ler', READ)).toBe('pode parar de ler')
  })

  it('keeps what the person said over the reply and takes out only the reply around it', () => {
    expect(
      withoutSpokenEcho(
        'falta só o teste com áudio de verdade. Para, quero perguntar outra coisa agora',
        READ
      )
    ).toBe('Para, quero perguntar outra coisa agora')
    expect(
      withoutSpokenEcho('Espera aí, quero mudar o plano. O gate passou em 38 de 38 checks', READ)
    ).toBe('Espera aí, quero mudar o plano.')
  })

  it('keeps the words the person shares with the reply when the reply did not say them in a row', () => {
    expect(withoutSpokenEcho('o teste do gate de voz falhou de novo no módulo', READ)).toBe(
      'o teste do gate de voz falhou de novo no módulo'
    )
  })

  it('drops what a garbled echo leaves behind instead of sending it', () => {
    expect(withoutSpokenEcho('terminei revisão módulo voz gate bolo passou', READ)).toBe('')
  })
})

describe('SpokenEchoWindow', () => {
  it('takes the echo out while the reply is read and for six seconds after it stops', () => {
    const echo = new SpokenEchoWindow()
    echo.note(READ[1], 1000)
    expect(echo.without('o gate passou em 38 de 38', 2000)).toBe('')
    echo.note(null, 3000)
    expect(echo.without('o gate passou em 38 de 38', 9000)).toBe('')
    expect(echo.without('o gate passou em 38 de 38', 9001)).toBe('o gate passou em 38 de 38')
  })
})
