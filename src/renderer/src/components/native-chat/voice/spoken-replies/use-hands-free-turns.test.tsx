// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import {
  publishDictationMeter,
  resetDictationMeter
} from '@/components/dictation/dictation-meter-store'
import type { NativeChatSpokenReplies } from './use-native-chat-spoken-replies'
import { DICTATION_CONTROL_EVENT } from '@/components/dictation/dictation-control-events'
import { getDefaultSettings, getDefaultVoiceSettings } from '../../../../../../shared/constants'
import { useSpokenReplyMode } from './spoken-reply-mode'
import { useSpokenReplyLine } from './spoken-reply-system-voice'
import { useHandsFreeTurns } from './use-hands-free-turns'

// Stands in for the dictation controller, which knows where a dictation lands.
const dictation = { landsHere: true }
vi.mock('@/components/dictation/use-dictation-queued-send', () => ({
  dictationLandsInComposerOf: () => dictation.landsHere
}))

// What the turn asks of the dictation controller.
const controls: string[] = []
const recordControl = (event: Event): void => {
  if (event instanceof CustomEvent) {
    controls.push(String(event.detail))
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  dictation.landsHere = true
  controls.length = 0
  document.addEventListener(DICTATION_CONTROL_EVENT, recordControl)
})

afterEach(() => {
  cleanup()
  document.removeEventListener(DICTATION_CONTROL_EVENT, recordControl)
  vi.useRealTimers()
  resetDictationMeter()
  useAppStore.setState({ dictationState: 'idle', settings: null })
  useSpokenReplyLine.setState({ line: null, throughApp: false })
})

type Chat = { line: string | null; agentWorking: boolean; handsFree?: boolean; hasDraft?: boolean }
const STARTING: Chat = { line: null, agentWorking: false }
const STOPPED: Chat = { ...STARTING, handsFree: false }

function listenForTurns() {
  const events: string[] = []
  const spoken = (line: string | null, handsFree: boolean): NativeChatSpokenReplies => ({
    on: true,
    sessionId: 'chat-1',
    visible: true,
    line,
    agentLabel: 'Claude',
    handsFree,
    waitsForEmptyComposer: false,
    toggle: () => {},
    setHandsFree: (handsFree) => events.push(handsFree ? 'armed' : 'disarmed'),
    silence: () => events.push('reply quieted')
  })
  const chat = renderHook(
    ({ line, agentWorking, handsFree = true, hasDraft = false }: Chat) =>
      useHandsFreeTurns(
        spoken(line, handsFree),
        {
          dictationUnavailable: false,
          agentWorking,
          canSend: true,
          hasDraft,
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

it('opens again after a turn that has nothing to read, since no change follows the agent finishing', () => {
  const { events, rerender, speak, dictationIs, wait } = listenForTurns()
  wait(600)
  dictationIs('listening')
  speak(true)
  speak(false)
  wait(1400)
  dictationIs('idle')
  rerender({ line: null, agentWorking: true })
  rerender({ line: null, agentWorking: false })
  wait(600)
  expect(events).toEqual(['open microphone', 'send', 'open microphone'])
})

it('tries a microphone that will not open once more, then stops listening', () => {
  const { events, wait } = listenForTurns()
  wait(600)
  wait(5000)
  wait(600)
  expect(events).toEqual(['open microphone', 'open microphone'])
  wait(5000)
  expect(events).toEqual(['open microphone', 'open microphone', 'disarmed'])
})

it('listens again after sound without words, and stops listening the second time', () => {
  const { events, speak, dictationIs, wait } = listenForTurns()
  const soundWithoutWords = (): void => {
    wait(600)
    dictationIs('listening')
    speak(true)
    speak(false)
    wait(1400)
    dictationIs('idle')
    wait(4000)
  }
  soundWithoutWords()
  expect(events).toEqual(['open microphone', 'send'])
  soundWithoutWords()
  expect(events).toEqual(['open microphone', 'send', 'open microphone', 'send', 'disarmed'])
})

it('opens again when the dictation it was listening to ends by itself', () => {
  const { events, dictationIs, wait } = listenForTurns()
  wait(600)
  dictationIs('listening')
  dictationIs('idle')
  wait(600)
  expect(events).toEqual(['open microphone', 'open microphone'])
})

it('closes the microphone it opened when its listening is turned off, hidden or handed to another chat', () => {
  const { rerender, dictationIs, wait } = listenForTurns()
  wait(600)
  dictationIs('listening')
  rerender(STOPPED)
  expect(controls).toEqual(['cancel'])
})

it('closes the microphone it opened when a prompt card takes the composer away', () => {
  const { unmount, dictationIs, wait } = listenForTurns()
  wait(600)
  dictationIs('listening')
  unmount()
  expect(controls).toEqual(['cancel'])
})

it('closes a microphone nobody talks into once, not again as the listening ends', () => {
  const { events, rerender, dictationIs, wait } = listenForTurns()
  wait(600)
  dictationIs('listening')
  wait(30_000)
  expect(events).toEqual(['open microphone', 'disarmed'])
  rerender(STOPPED)
  expect(controls).toEqual(['cancel'])
})

it('leaves alone a dictation the person started, and the words it has just sent for', () => {
  dictation.landsHere = false
  const theirs = listenForTurns()
  theirs.dictationIs('listening')
  theirs.rerender(STOPPED)
  expect(controls).toEqual([])
  theirs.unmount()

  dictation.landsHere = true
  const mine = listenForTurns()
  mine.dictationIs('idle')
  mine.wait(600)
  mine.dictationIs('listening')
  mine.speak(true)
  mine.speak(false)
  mine.wait(1400)
  expect(mine.events).toEqual(['open microphone', 'send'])
  // The dictation is still landing the last words when the listening ends.
  mine.rerender(STOPPED)
  expect(controls).toEqual([])
})

it('opens the microphone on an empty composer only, and says so while a draft is in the way', () => {
  const { events, rerender, wait } = listenForTurns()
  rerender({ ...STARTING, hasDraft: true })
  wait(5000)
  expect(events).toEqual([])
  expect(useSpokenReplyMode.getState().waitsForEmptyComposer).toBe('chat-1')
  rerender(STARTING)
  expect(useSpokenReplyMode.getState().waitsForEmptyComposer).toBeNull()
  wait(600)
  expect(events).toEqual(['open microphone'])
})

function interruptByTalking(): void {
  useAppStore.setState({
    settings: {
      ...getDefaultSettings('/home/fixture'),
      voice: { ...getDefaultVoiceSettings(), spokenReplyInterrupt: true }
    }
  })
}
const playsThroughApp = (throughApp: boolean): void =>
  act(() => useSpokenReplyLine.setState({ throughApp }))
const READING: Chat = { line: 'Pronto.', agentWorking: false }

it('opens on a reply once it plays through the app, and quiets it when the person talks over it', () => {
  interruptByTalking()
  const { events, rerender, speak, dictationIs, wait } = listenForTurns()
  rerender(READING)
  // Still being rendered: nothing the microphone could tell from the person yet.
  wait(2000)
  expect(events).toEqual([])
  playsThroughApp(true)
  expect(events).toEqual(['open microphone'])
  expect(useSpokenReplyMode.getState().overhearing).toBe('chat-1')

  dictationIs('listening')
  speak(true)
  wait(399)
  expect(events).toEqual(['open microphone'])
  wait(1)
  expect(events).toEqual(['open microphone', 'reply quieted'])
  expect(useSpokenReplyMode.getState().overhearing).toBeNull()
  // Their turn has begun: what they say goes out after the pause, and nothing was cancelled.
  rerender(STARTING)
  speak(false)
  wait(1400)
  expect(events).toEqual(['open microphone', 'reply quieted', 'send'])
  expect(controls).toEqual([])
})

it('drops what the microphone took in when the reply ends untouched, and stops overhearing for another dictation', () => {
  interruptByTalking()
  const untouched = listenForTurns()
  untouched.rerender(READING)
  playsThroughApp(true)
  untouched.dictationIs('listening')
  untouched.rerender(STARTING)
  expect(controls).toEqual(['cancel'])
  expect(useSpokenReplyMode.getState().overhearing).toBeNull()
  untouched.unmount()

  controls.length = 0
  useAppStore.setState({ dictationState: 'idle' })
  const taken = listenForTurns()
  taken.rerender(READING)
  playsThroughApp(false)
  playsThroughApp(true)
  expect(useSpokenReplyMode.getState().overhearing).toBe('chat-1')
  // A dictation the person started elsewhere takes the microphone while the reply plays.
  dictation.landsHere = false
  taken.dictationIs('listening')
  expect(useSpokenReplyMode.getState().overhearing).toBeNull()
  expect(controls).toEqual([])
})

it('keeps the microphone closed on a reply while interrupting by talking is off', () => {
  const { events, rerender, wait } = listenForTurns()
  rerender(READING)
  playsThroughApp(true)
  wait(5000)
  expect(events).toEqual([])
})
