import { describe, expect, it } from 'vitest'
import { HandsFreeTurns, type HandsFreeFacts } from './hands-free-turns'

const quiet: Omit<HandsFreeFacts, 'now'> = {
  dictation: 'idle',
  userSpeaking: false,
  agentWorking: false,
  voiceSpeaking: false,
  canSend: true
}

describe('HandsFreeTurns', () => {
  it('opens the microphone after the reply, sends after a pause, and waits for the next reply', () => {
    const turns = new HandsFreeTurns()
    expect(turns.next({ ...quiet, voiceSpeaking: true, now: 0 })).toBeNull()
    expect(turns.next({ ...quiet, now: 100 })).toBeNull()
    expect(turns.next({ ...quiet, now: 700 })).toBe('open-microphone')
    expect(turns.next({ ...quiet, dictation: 'listening', now: 900 })).toBeNull()
    expect(
      turns.next({ ...quiet, dictation: 'listening', userSpeaking: true, now: 2000 })
    ).toBeNull()
    // A pause shorter than the end of speech keeps listening.
    expect(turns.next({ ...quiet, dictation: 'listening', now: 3000 })).toBeNull()
    expect(turns.next({ ...quiet, dictation: 'listening', now: 3400 })).toBe('send')

    expect(turns.next({ ...quiet, dictation: 'stopping', now: 3500 })).toBeNull()
    expect(turns.next({ ...quiet, agentWorking: true, now: 4000 })).toBeNull()
    expect(turns.next({ ...quiet, agentWorking: true, now: 60_000 })).toBeNull()
    expect(turns.next({ ...quiet, voiceSpeaking: true, now: 61_000 })).toBeNull()
    expect(turns.next({ ...quiet, now: 65_000 })).toBeNull()
    expect(turns.next({ ...quiet, now: 65_600 })).toBe('open-microphone')
  })

  it('closes a microphone nobody talks into', () => {
    const turns = new HandsFreeTurns()
    turns.next({ ...quiet, now: 0 })
    expect(turns.next({ ...quiet, now: 600 })).toBe('open-microphone')
    turns.next({ ...quiet, dictation: 'listening', now: 700 })
    expect(turns.next({ ...quiet, dictation: 'listening', now: 30_000 })).toBeNull()
    expect(turns.next({ ...quiet, dictation: 'listening', now: 30_700 })).toBe('close-unused')
  })

  it('keeps the microphone closed while the agent works, and gives up when it will not open', () => {
    const turns = new HandsFreeTurns()
    expect(turns.next({ ...quiet, agentWorking: true, now: 0 })).toBeNull()
    expect(turns.next({ ...quiet, agentWorking: true, now: 5000 })).toBeNull()
    expect(turns.next({ ...quiet, canSend: false, now: 6000 })).toBeNull()
    turns.next({ ...quiet, now: 7000 })
    expect(turns.next({ ...quiet, now: 7600 })).toBe('open-microphone')
    expect(turns.next({ ...quiet, now: 12_600 })).toBeNull()
    turns.next({ ...quiet, now: 12_700 })
    expect(turns.next({ ...quiet, now: 13_300 })).toBe('open-microphone')
    expect(turns.next({ ...quiet, now: 18_300 })).toBe('give-up')
    expect(new HandsFreeTurns().next({ ...quiet, dictation: 'error', now: 0 })).toBe('give-up')
  })
})
