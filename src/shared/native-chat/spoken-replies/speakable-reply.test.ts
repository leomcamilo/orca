import { describe, expect, it } from 'vitest'
import { speakablePhrase, speakableReply } from './speakable-reply'

describe('speakableReply', () => {
  it('reads the opening paragraph and leaves code, tables and later detail on screen', () => {
    const reply = [
      'Corrigi o erro de login. Os testes passaram, mas falta você aprovar a migração.',
      '',
      '## Detalhes',
      '',
      '```ts',
      'const session = await signIn(user)',
      '```',
      '',
      '| Arquivo | Linhas |',
      '| --- | --- |',
      '| auth.ts | 12 |'
    ].join('\n')
    expect(speakableReply(reply)).toEqual({
      sentences: [
        'Corrigi o erro de login.',
        'Os testes passaram, mas falta você aprovar a migração.'
      ],
      cut: false
    })
  })

  it('drops markdown marks, links and paths from what is spoken', () => {
    const reply =
      'I changed **two files**: `src/main/speech/model-catalog.ts` and [the docs](https://example.com/docs). See https://example.com/pr/12 for more.'
    expect(speakableReply(reply).sentences).toEqual([
      'I changed two files: model-catalog.ts and the docs.',
      'See for more.'
    ])
  })

  it('stops after three sentences and says the opening was cut', () => {
    const reply = 'One. Two. Three. Four. Five.'
    expect(speakableReply(reply)).toEqual({ sentences: ['One.', 'Two.', 'Three.'], cut: true })
  })

  it('reads a short opening together with the paragraph after it', () => {
    expect(speakableReply('Pronto.\n\nO build passou em 3.5 minutos.').sentences).toEqual([
      'Pronto.',
      'O build passou em 3.5 minutos.'
    ])
  })

  it('reads the line that introduces a list and marks the rest as unread', () => {
    expect(speakableReply('Encontrei dois problemas:\n\n- token expirado\n- cache antigo')).toEqual(
      { sentences: ['Encontrei dois problemas.'], cut: true }
    )
  })

  it('reads the first items of a reply that is only a list', () => {
    expect(speakableReply('- Build ok\n- Tests ok').sentences).toEqual(['Build ok.', 'Tests ok.'])
  })

  it('keeps a date whole and says nothing for a reply that is only code', () => {
    expect(speakableReply('A entrega fica para 13/11/2026.').sentences).toEqual([
      'A entrega fica para 13/11/2026.'
    ])
    expect(speakableReply('```sh\nls\n```')).toEqual({ sentences: [], cut: false })
  })
})

describe('speakablePhrase', () => {
  it('reads the first line of a prompt title without its code marks', () => {
    expect(speakablePhrase('Run `pnpm test`?\nin /Users/someone/project')).toBe('Run pnpm test?')
  })
})
