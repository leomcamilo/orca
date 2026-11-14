// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import {
  publishDictationMeter,
  resetDictationMeter
} from '@/components/dictation/dictation-meter-store'
import type { NativeChatSpokenReplies } from './use-native-chat-spoken-replies'
import { useHandsFreeTurns } from './use-hands-free-turns'

// Stands in for the dictation controller, which knows where a dictation lands.
const dictation = { landsHere: true }
vi.mock('@/components/dictation/use-dictation-queued-send', () => ({
  dictationLandsInComposerOf: () => dictation.landsHere
}))

beforeEach(() => {
  vi.useFakeTimers()
  dictation.landsHere = true
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  resetDictationMeter()
  useAppStore.setState({ dictationState: 'idle' })
})

type Chat = { line: string | null; agentWorking: boolean }
const STARTING: Chat = { line: null, agentWorking: false }

function listenForTurns() {
  const events: string[] = []
  const spoken = (line: string | null): NativeChatSpokenReplies => ({
    on: true,
    sessionId: 'chat-1',
    visible: true,
    line,
    agentLabel: 'Claude',
    handsFree: true,
    toggle: () => {},
    setHandsFree: (handsFree) => events.push(handsFree ? 'armed' : 'disarmed'),
    silence: () => {}
  })
  const chat = renderHook(
    ({ line, agentWorking }: Chat) =>
      useHandsFreeTurns(
        spoken(line),
        {
          dictationUnavailable: false,
          agentWorking,
          canSend: true,
          onOpenMicrophone: () => events.push('open microphone'),
          onSend: () => events.push('send')
        },
        { current: null }
      ),
    { initialProps: STARTING }
  )
  const speak = (isSpeaking: boolean): void =>
    act(() => publishDictationMeter({ level: isSpeaking ? 0.5 : 0, isSpeaking, isClipping: false }))
  const dictationIs = (dictationState: 'idle' | 'listening' | 'stopping'): void =>
    act(() => useAppStore.setState({ dictationState }))
  const wait = (ms: number): void =>
    act(() => {
      vi.advanceTimersByTime(ms)
    })
  return { ...chat, events, speak, dictationIs, wait }
}

it('opens the microphone once the room settles and sends what was said after the pause', () => {
  const { events, speak, dictationIs, wait } = listenForTurns()
  wait(599)
  expect(events).toEqual([])
  wait(1)
  expect(events).toEqual(['open microphone'])

  dictationIs('listening')
  speak(true)
  // However long the person talks, nothing is sent until they pause.
  wait(20_000)
  speak(false)
  wait(1399)
  expect(events).toEqual(['open microphone'])
  wait(1)
  expect(events).toEqual(['open microphone', 'send'])
})

it('keeps no timer while the agent works or a reply is read, and opens again after them', () => {
  const { events, rerender, wait } = listenForTurns()
  rerender({ line: null, agentWorking: true })
  expect(vi.getTimerCount()).toBe(0)
  wait(60_000)
  rerender({ line: 'Pronto.', agentWorking: false })
  expect(vi.getTimerCount()).toBe(0)
  wait(60_000)
  expect(events).toEqual([])
  rerender({ line: null, agentWorking: false })
  wait(600)
  expect(events).toEqual(['open microphone'])
})

it('leaves a dictation that lands elsewhere alone, and closes a microphone nobody talks into', () => {
  const { events, speak, dictationIs, wait } = listenForTurns()
  dictation.landsHere = false
  dictationIs('listening')
  speak(true)
  speak(false)
  wait(10_000)
  expect(events).toEqual([])

  dictationIs('idle')
  dictation.landsHere = true
  wait(600)
  dictationIs('listening')
  wait(30_000)
  expect(events).toEqual(['open microphone', 'disarmed'])
})
