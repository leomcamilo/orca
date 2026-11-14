import { describe, expect, it } from 'vitest'
import { numberInWords, spokenPortuguese } from './spoken-portuguese'
import { speakableReply } from './speakable-reply'

// Openings the coordinating chat wrote on 2026-11-14, as written.
function heard(markdown: string, respellEnglish = false): string {
  return speakableReply(markdown)
    .sentences.map((sentence) => spokenPortuguese(sentence, { respellEnglish }))
    .join(' ')
}

describe('spokenPortuguese', () => {
  it('reads real openings without handles, and with versions, times and sizes in words', () => {
    expect(
      heard(
        'O Codex avisou que o candidato `1.4.258-leo.6` passou no gate e no build. Confirmei o recebimento na mensagem `msg_146952c9c544`.'
      )
    ).toBe(
      'O Codex avisou que o candidato um ponto quatro ponto duzentos e cinquenta e oito leo ponto seis passou no gate e no build. Confirmei o recebimento na mensagem.'
    )
    expect(
      heard(
        'A frente de build avisou que o backup do app antigo, feito hoje às 07:20, ainda está em uso por um processo do Orca e precisa ficar guardado. Ela já fez a limpeza que você autorizou e o disco subiu de cerca de 3,6 GB para 4,8 GB livres.'
      )
    ).toBe(
      'A frente de build avisou que o backup do app antigo, feito hoje às sete e vinte, ainda está em uso por um processo do Orca e precisa ficar guardado. Ela já fez a limpeza que você autorizou e o disco subiu de cerca de três vírgula seis gigabytes para quatro vírgula oito gigabytes livres.'
    )
  })

  it('reads dates, money, percentages and acronyms as they are said', () => {
    expect(
      spokenPortuguese('O modelo desliga em 06/01/2027 e custa US$ 0,015 por minuto na API.', {
        respellEnglish: false
      })
    ).toBe(
      'O modelo desliga em seis de janeiro de dois mil e vinte e sete e custa zero vírgula zero quinze dólares por minuto na a pê i.'
    )
    expect(spokenPortuguese('Erro de 31,1% em 1º de maio, OK.', { respellEnglish: false })).toBe(
      'Erro de trinta e um vírgula um por cento em primeiro de maio, ok.'
    )
  })

  it('respells common English terms only for a voice that reads them with Portuguese rules', () => {
    expect(spokenPortuguese('O build passou no gate.', { respellEnglish: true })).toBe(
      'O bíld passou no gueit.'
    )
    expect(spokenPortuguese('O build passou no gate.', { respellEnglish: false })).toBe(
      'O build passou no gate.'
    )
  })
})

describe('numberInWords', () => {
  it('says whole numbers the Brazilian way', () => {
    expect(numberInWords(100)).toBe('cem')
    expect(numberInWords(101)).toBe('cento e um')
    expect(numberInWords(1000)).toBe('mil')
    expect(numberInWords(1010)).toBe('mil e dez')
    expect(numberInWords(1200)).toBe('mil e duzentos')
    expect(numberInWords(1210)).toBe('mil duzentos e dez')
    expect(numberInWords(2026)).toBe('dois mil e vinte e seis')
    expect(numberInWords(1_500_000)).toBe('um milhão e quinhentos mil')
  })
})
