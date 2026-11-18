// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { getDefaultSettings, getDefaultVoiceSettings } from '../../../../../../shared/orca-profiles/constants'
import {
  publishDictationMeter,
  resetDictationMeter
} from '@/components/dictation/dictation-meter-store'
import type { NativeChatSpokenReplies } from './use-native-chat-spoken-replies'
import { DICTATION_CONTROL_EVENT } from '@/components/dictation/dictation-control-events'
import { publishDictationMicrophoneLevel } from '@/components/dictation/dictation-microphone-level'
import { useSpokenReplyMode } from './spoken-reply-mode'
import { dictatedTextClaimed } from '@/components/dictation/dictation-text-claims'
import type { VoiceSettings } from '../../../../../../shared/speech/speech-types'
import { useHandsFreeTurns } from './use-hands-free-turns'

// Stands in for the dictation controller, which knows where a dictation lands.
const dictation = { landsHere: true }
vi.mock('@/components/dictation/use-dictation-queued-send', () => ({
  dictationLandsInComposerOf: () => dictation.landsHere
}))

// Stands in for a voice read by an API, which plays on this page.
const holds: boolean[] = []
const voice = { sounding: true, output: 0.1, holds }
vi.mock('./spoken-reply-api-voice', () => ({
  spokenReplyAudioSounding: () => voice.sounding,
  spokenReplyOutputLevel: () => voice.output,
  holdSpokenReplyAudio: (held: boolean) => voice.holds.push(held)
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
  voice.sounding = true
  voice.holds.length = 0
  controls.length = 0
  document.addEventListener(DICTATION_CONTROL_EVENT, recordControl)
})

afterEach(() => {
  cleanup()
  document.removeEventListener(DICTATION_CONTROL_EVENT, recordControl)
  vi.useRealTimers()
  resetDictationMeter()
  useAppStore.setState({ dictationState: 'idle', settings: null })
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
    queuesForTurnEnd: false,
    toggle: () => {},
    setHandsFree: (handsFree) => events.push(handsFree ? 'armed' : 'disarmed'),
    silence: () => events.push('silence')
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
          onSend: () => events.push('send'),
          onStopTurn: () => events.push('stop the agent')
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

it('keeps no timer while the agent works, unless asked to listen meanwhile, and listens over the reply', () => {
  voiceSettings({ spokenReplyListenWhileWorking: false })
  const { events, rerender, speak, dictationIs, wait } = listenForTurns()
  rerender({ line: null, agentWorking: true })
  expect(vi.getTimerCount()).toBe(0)
  wait(60_000)
  rerender({ line: 'Pronto.', agentWorking: false })
  expect(events).toEqual(['open microphone'])
  // Marked so the microphone's dictation does not quiet the reply.
  expect(useSpokenReplyMode.getState().overhearing).toBe('chat-1')
  dictationIs('listening')
  speak(true)
  rerender({ line: 'Pronto.', agentWorking: false, hasDraft: true })
  wait(60_000)
  expect(events).toEqual(['open microphone'])
  rerender({ line: null, agentWorking: false, hasDraft: true })
  expect(useSpokenReplyMode.getState().overhearing).toBeNull()
  speak(false)
  wait(1400)
  expect(events).toEqual(['open microphone', 'send'])
})

it('stops the reply for words of the person once they turn on Interrupt by speaking', () => {
  useAppStore.setState({
    settings: {
      ...getDefaultSettings('/tmp'),
      voice: { ...getDefaultVoiceSettings(), spokenReplyInterrupt: true }
    }
  })
  const { events, rerender, speak, dictationIs } = listenForTurns()
  rerender({ line: 'Pronto.', agentWorking: false })
  dictationIs('listening')
  // The meter hears the reply as well, so it stops nothing by itself.
  speak(true)
  expect(events).toEqual(['open microphone'])
  rerender({ line: 'Pronto.', agentWorking: false, hasDraft: true })
  expect(events).toEqual(['open microphone', 'silence'])
})

/** Microphone windows from `from` to `to` ms, with the voice playing `output` meanwhile. */
function hear(from: number, to: number, microphone: number, output: number): void {
  act(() => {
    for (let now = from; now < to; now += 50) {
      voice.output = output
      publishDictationMicrophoneLevel(microphone, now)
    }
  })
}

function voiceSettings(chosen: Partial<VoiceSettings>): void {
  useAppStore.setState({
    settings: { ...getDefaultSettings('/tmp'), voice: { ...getDefaultVoiceSettings(), ...chosen } }
  })
}

it('listens while the agent works, and stops it for "para" said alone, which never lands', () => {
  const { events, rerender, dictationIs, wait } = listenForTurns()
  rerender({ line: null, agentWorking: true })
  wait(600)
  expect(events).toEqual(['open microphone'])
  dictationIs('listening')
  expect(useSpokenReplyMode.getState().queueing).toBe('chat-1')
  expect(dictatedTextClaimed('Para.')).toBe(true)
  expect(events).toEqual(['open microphone', 'stop the agent'])
  // Inside a sentence it is what the person says, and lands in the draft.
  expect(dictatedTextClaimed('para de ler isso')).toBe(false)
})

it('holds a voice read by an API as the person talks over it, and quiets it as they go on', () => {
  voiceSettings({ spokenReplyInterrupt: true })
  const { events, rerender, dictationIs } = listenForTurns()
  rerender({ line: 'Pronto.', agentWorking: false })
  dictationIs('listening')
  // Its own echo, after the browser's echo cancellation, plays on.
  hear(0, 1000, 0.04, 0.1)
  expect(voice.holds).toEqual([])
  hear(1000, 1100, 0.3, 0.1)
  expect(voice.holds).toEqual([true])
  expect(events).toEqual(['open microphone'])
  hear(1100, 1250, 0.25, 0)
  expect(events).toEqual(['open microphone', 'silence'])
})

it('plays a reply on after holding it for a burst of its own echo', () => {
  voiceSettings({ spokenReplyInterrupt: true })
  const { events, rerender, dictationIs } = listenForTurns()
  rerender({ line: 'Pronto.', agentWorking: false })
  dictationIs('listening')
  hear(0, 1000, 0.04, 0.1)
  hear(1000, 1100, 0.2, 0.1)
  hear(1100, 1600, 0.003, 0)
  expect(voice.holds).toEqual([true, false])
  expect(events).toEqual(['open microphone'])
})

it('never holds a reply the person talks over unless they turned on Interrupt by speaking', () => {
  voiceSettings({ spokenReplyInterrupt: false })
  const { events, rerender, dictationIs } = listenForTurns()
  rerender({ line: 'Pronto.', agentWorking: false })
  dictationIs('listening')
  hear(0, 1000, 0.04, 0.1)
  hear(1000, 1500, 0.3, 0.1)
  expect(voice.holds).toEqual([])
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
