// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultSettings, getDefaultVoiceSettings } from '../../../../../../shared/constants'
import type { AgentJournalRenderItem } from '../../../../../../shared/agent-session/journal/agent-session-journal-types'
import { holdVoiceCallPresence } from '../voice-call-presence'
import { NativeChatSpokenRepliesProvider } from './NativeChatSpokenRepliesProvider'
import { setSpokenReplyMode, spokenReplyRequestedFor } from './spoken-reply-mode'
import {
  useNativeChatSpokenRepliesControl,
  useSpokenReplyJournal
} from './use-native-chat-spoken-replies'

type FakeVoice = { voiceURI: string; name: string; lang: string; localService: boolean }
type FakeUtterance = {
  text: string
  voice: FakeVoice | null
  lang: string
  onend: (() => void) | null
}

const NO_ITEMS: AgentJournalRenderItem[] = []
const LUCIANA: FakeVoice = {
  voiceURI: 'uri:Luciana',
  name: 'Luciana',
  lang: 'pt-BR',
  localService: true
}

// One system voice for the file: the speech queue keeps the first synthesizer it is given.
const system = {
  voices: [LUCIANA] as FakeVoice[],
  spoken: [] as FakeUtterance[],
  voicesListed: null as (() => void) | null
}
vi.stubGlobal('SpeechSynthesisUtterance', function SpeechSynthesisUtterance(text: string) {
  return { text, voice: null, lang: '', onend: null, onerror: null }
})
Object.defineProperty(window, 'speechSynthesis', {
  configurable: true,
  value: {
    getVoices: () => system.voices,
    speak: (utterance: FakeUtterance) => system.spoken.push(utterance),
    cancel: () => system.spoken.at(-1)?.onend?.(),
    addEventListener: (_event: string, listener: () => void) => {
      system.voicesListed = listener
    },
    removeEventListener: () => {
      system.voicesListed = null
    }
  }
})

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  // A cancel holds the queue for a moment; the next test starts with it settled.
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  system.voices = [LUCIANA]
  system.spoken = []
  setSpokenReplyMode('chat-1', false)
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

function renderChat(isVisible = true) {
  useAppStore.setState({
    settings: {
      ...getDefaultSettings('/home/fixture'),
      voice: { ...getDefaultVoiceSettings(), spokenReplies: true, dictationLanguage: 'pt' }
    }
  })
  const chat = renderHook(
    ({ items }: { items: AgentJournalRenderItem[]; isVisible: boolean }) => {
      useSpokenReplyJournal(items)
      return useNativeChatSpokenRepliesControl()
    },
    {
      initialProps: { items: NO_ITEMS, isVisible },
      wrapper: ({ children }) => (
        <NativeChatSpokenRepliesProvider
          pane={{ sessionId: 'chat-1', agent: 'claude', isVisible: visible.current }}
        >
          {children}
        </NativeChatSpokenRepliesProvider>
      )
    }
  )
  const answer = (turnId: string, reply: string): void => {
    chat.rerender({ items: turn(turnId, 'running'), isVisible: visible.current })
    chat.rerender({ items: turn(turnId, 'completed', reply), isVisible: visible.current })
  }
  return { ...chat, answer }
}

// The wrapper takes no props of its own, so the chat's visibility is read from here.
const visible = { current: true }
const spokenTexts = (): string[] => system.spoken.map((utterance) => utterance.text)

it('reads a finished reply in the chosen language, quiets on request, and stays silent during dictation', () => {
  visible.current = true
  const { result, answer } = renderChat()
  expect(spokenReplyRequestedFor('chat-1')).toBe(false)
  act(() => result.current?.toggle())
  expect(spokenReplyRequestedFor('chat-1')).toBe(true)

  answer('t1', 'Tudo certo. **Os testes** passaram.\n\n```sh\npnpm test\n```')
  expect(spokenTexts()).toEqual(['Tudo certo.'])
  expect(system.spoken[0]).toMatchObject({ voice: LUCIANA, lang: 'pt-BR' })
  expect(result.current?.line).toBe('Tudo certo.')
  act(() => system.spoken[0].onend?.())
  expect(spokenTexts()).toEqual(['Tudo certo.', 'Os testes passaram.'])

  act(() => result.current?.silence())
  expect(result.current?.line).toBeNull()
  expect(result.current?.on).toBe(true)

  act(() => useAppStore.setState({ dictationState: 'listening' }))
  answer('t2', 'Segunda resposta.')
  expect(spokenTexts()).toHaveLength(2)
})

it('waits for the system to list its voices before the first reply', () => {
  visible.current = true
  system.voices = []
  const { result, answer } = renderChat()
  act(() => result.current?.toggle())
  answer('t1', 'Pronto.')
  expect(spokenTexts()).toEqual([])
  system.voices = [LUCIANA]
  act(() => system.voicesListed?.())
  expect(system.spoken).toMatchObject([{ text: 'Pronto.', voice: LUCIANA, lang: 'pt-BR' }])
})

it('stays silent while a Voice mode call in any chat holds the microphone', () => {
  visible.current = true
  const { result, answer } = renderChat()
  act(() => result.current?.toggle())
  let release = (): void => {}
  act(() => {
    release = holdVoiceCallPresence()
  })
  answer('t1', 'Dita durante a chamada.')
  expect(spokenTexts()).toEqual([])
  act(() => release())
  answer('t2', 'Dita depois da chamada.')
  expect(spokenTexts()).toEqual(['Dita depois da chamada.'])
})

it('reads nothing for a chat that is not on screen', () => {
  visible.current = false
  const { answer } = renderChat(false)
  act(() => setSpokenReplyMode('chat-1', true))
  answer('t1', 'Ninguém vê este chat.')
  expect(spokenTexts()).toEqual([])
})
