import { describe, expect, it } from 'vitest'
import {
  blocksWithoutSpokenReplyRequest,
  withSpokenReplyRequest,
  withoutSpokenReplyRequest
} from './spoken-reply-request'
import { clampConversationNameFirstPrompt } from '../../source-control/ai/generation/conversation-name-generation'
import { latestStructuredAgentSessionPrompt } from '../../agent-session/requests/structured-agent-session-latest-request'

describe('spoken reply request', () => {
  it('adds one note to a message and shows the message without it', () => {
    const sent = withSpokenReplyRequest('Qual o estado do build?')
    expect(sent.startsWith('Qual o estado do build?\n\n[Orca Voice mode: ')).toBe(true)
    expect(withSpokenReplyRequest(sent)).toBe(sent)
    expect(withoutSpokenReplyRequest(sent)).toBe('Qual o estado do build?')
    expect(withoutSpokenReplyRequest(`${sent}\n`)).toBe('Qual o estado do build?')
  })

  it('leaves a command and an empty message as written', () => {
    expect(withSpokenReplyRequest('/compact keep the plan')).toBe('/compact keep the plan')
    expect(withSpokenReplyRequest('  ')).toBe('  ')
  })

  it('hides the note in shown blocks and keeps untouched blocks as they are', () => {
    const plain = [{ type: 'text' as const, text: 'hello [Orca Voice mode: off]' }]
    expect(blocksWithoutSpokenReplyRequest(plain)).toBe(plain)
    const sent = [{ type: 'text' as const, text: withSpokenReplyRequest('hello') }]
    expect(blocksWithoutSpokenReplyRequest(sent)).toEqual([{ type: 'text', text: 'hello' }])
  })

  it('keeps the note out of what names a chat and previews its latest prompt', () => {
    const sent = withSpokenReplyRequest('Corrige o login')
    expect(clampConversationNameFirstPrompt(sent)).toBe('Corrige o login')
    expect(
      latestStructuredAgentSessionPrompt([
        {
          itemId: 'u1',
          revision: 1,
          sequence: 1,
          observedAt: 1,
          body: { kind: 'message', role: 'user', blocks: [{ type: 'text', text: sent }] }
        }
      ])
    ).toBe('Corrige o login')
  })
})
