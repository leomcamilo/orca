// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultSettings, getDefaultVoiceSettings } from '../../../../../../shared/constants'
import type { AgentJournalRenderItem } from '../../../../../../shared/agent-session/journal/agent-session-journal-types'
import { NativeChatSpokenRepliesProvider } from './NativeChatSpokenRepliesProvider'
import { spokenReplyRequestedFor } from './spoken-reply-mode'
import {
  useNativeChatSpokenRepliesControl,
  useSpokenReplyJournal
} from './use-native-chat-spoken-replies'

type FakeUtterance = { text: string; onend: (() => void) | null }

const NO_ITEMS: AgentJournalRenderItem[] = []

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  useAppStore.setState({ dictationState: 'idle', settings: null })
})

function turn(itemId: string, state: 'running' | 'completed', reply?: string) {
  const items: AgentJournalRenderItem[] = [
    {
      itemId,
      revision: 1,
      sequence: 1,
      observedAt: 1,
      body: { kind: 'turn', turnId: itemId, state }
    }
  ]
  if (reply !== undefined) {
    items.push({
      itemId: `${itemId}-reply`,
      revision: 1,
      sequence: 2,
      observedAt: 2,
      turnScope: { kind: 'turn', turnItemId: itemId },
      body: { kind: 'message', role: 'assistant', blocks: [{ type: 'text', text: reply }] }
    })
  }
  return items
}

it('reads a finished reply in the system voice, quiets on request, and stays silent during dictation', () => {
  const spoken: FakeUtterance[] = []
  let cancels = 0
  vi.stubGlobal('SpeechSynthesisUtterance', function SpeechSynthesisUtterance(text: string) {
    return { text, voice: null, lang: '', onend: null, onerror: null }
  })
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    value: {
      getVoices: () => [],
      speak: (utterance: FakeUtterance) => spoken.push(utterance),
      cancel: () => {
        cancels += 1
        spoken.at(-1)?.onend?.()
      }
    }
  })
  useAppStore.setState({
    settings: {
      ...getDefaultSettings('/home/fixture'),
      voice: { ...getDefaultVoiceSettings(), spokenReplies: true }
    }
  })
  const { result, rerender } = renderHook(
    ({ items }: { items: AgentJournalRenderItem[] }) => {
      useSpokenReplyJournal(items)
      return useNativeChatSpokenRepliesControl()
    },
    {
      initialProps: { items: NO_ITEMS },
      wrapper: ({ children }) => (
        <NativeChatSpokenRepliesProvider pane={{ sessionId: 'chat-1', agent: 'claude' }}>
          {children}
        </NativeChatSpokenRepliesProvider>
      )
    }
  )
  expect(spokenReplyRequestedFor('chat-1')).toBe(false)
  act(() => result.current?.toggle())
  expect(spokenReplyRequestedFor('chat-1')).toBe(true)

  rerender({ items: turn('t1', 'running') })
  rerender({
    items: turn('t1', 'completed', 'Tudo certo. **Os testes** passaram.\n\n```sh\npnpm test\n```')
  })
  expect(spoken.map((utterance) => utterance.text)).toEqual(['Tudo certo.'])
  expect(result.current?.line).toBe('Tudo certo.')
  act(() => spoken[0].onend?.())
  expect(spoken.map((utterance) => utterance.text)).toEqual(['Tudo certo.', 'Os testes passaram.'])

  act(() => result.current?.silence())
  expect(cancels).toBe(1)
  expect(result.current?.line).toBeNull()
  expect(result.current?.on).toBe(true)

  act(() => useAppStore.setState({ dictationState: 'listening' }))
  rerender({ items: turn('t2', 'running') })
  rerender({ items: turn('t2', 'completed', 'Segunda resposta.') })
  expect(spoken).toHaveLength(2)
})
