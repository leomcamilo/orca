import { describe, expect, it } from 'vitest'
import { isSpokenStopCommand } from './spoken-stop-command'

describe('isSpokenStopCommand', () => {
  it('takes "para" said alone, however the transcript writes it', () => {
    for (const heard of ['para', 'Para.', 'Pára!', 'para, para', 'Stop.']) {
      expect(isSpokenStopCommand(heard)).toBe(true)
    }
  })

  it('leaves "para" inside a sentence, and words that only start like it, as what was said', () => {
    for (const heard of [
      'para de ler isso',
      'Para, faz o teste antes',
      'paralelo',
      'pode parar',
      ''
    ]) {
      expect(isSpokenStopCommand(heard)).toBe(false)
    }
  })
})
