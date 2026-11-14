import { describe, expect, it } from 'vitest'
import { HandsFreeTurns, type HandsFreeFacts } from './hands-free-turns'

const quiet: Omit<HandsFreeFacts, 'now'> = {
  dictation: 'idle',
  ownsDictation: false,
  userSpeaking: false,
  agentWorking: false,
  voiceSpeaking: false,
  voiceCancelsEcho: false,
  canSend: true,
  hasDraft: false
}
const mine: Omit<HandsFreeFacts, 'now'> = { ...quiet, dictation: 'listening', ownsDictation: true }
const elsewhere: Omit<HandsFreeFacts, 'now'> = { ...quiet, dictation: 'listening' }
// A reply played through the app, and this chat's microphone open on it.
const reply: Omit<HandsFreeFacts, 'now'> = {
  ...quiet,
  voiceSpeaking: true,
  voiceCancelsEcho: true
}
const overheard: Omit<HandsFreeFacts, 'now'> = { ...reply, ...mine, voiceSpeaking: true }

describe('HandsFreeTurns', () => {
  it('opens the microphone after the reply, sends after a pause, and waits for the next reply', () => {
    const turns = new HandsFreeTurns()
    expect(turns.next({ ...quiet, voiceSpeaking: true, now: 0 })).toBeNull()
    expect(turns.next({ ...quiet, now: 100 })).toBeNull()
    expect(turns.next({ ...quiet, now: 700 })).toBe('open-microphone')
    expect(turns.next({ ...mine, now: 900 })).toBeNull()
    // Speech is reported when it starts and when it stops, however long it lasts.
    expect(turns.next({ ...mine, userSpeaking: true, now: 2000 })).toBeNull()
    expect(turns.deadline()).toBeNull()
    expect(turns.next({ ...mine, now: 9000 })).toBeNull()
    // The pause counts from where the speech stopped.
    expect(turns.deadline()).toBe(10_400)
    expect(turns.next({ ...mine, now: 10_300 })).toBeNull()
    expect(turns.next({ ...mine, now: 10_400 })).toBe('send')

    expect(turns.next({ ...quiet, dictation: 'stopping', now: 10_500 })).toBeNull()
    expect(turns.next({ ...quiet, agentWorking: true, now: 11_000 })).toBeNull()
    // While the agent works or speaks, only a change moves the turn: nothing is timed.
    expect(turns.deadline()).toBeNull()
    expect(turns.next({ ...quiet, voiceSpeaking: true, now: 61_000 })).toBeNull()
    expect(turns.deadline()).toBeNull()
    expect(turns.next({ ...quiet, now: 65_000 })).toBeNull()
    expect(turns.deadline()).toBe(65_600)
    expect(turns.next({ ...quiet, now: 65_600 })).toBe('open-microphone')
  })

  it('never sends for a dictation the person started somewhere else', () => {
    const turns = new HandsFreeTurns()
    // Dictating into another pane before this chat opened its microphone.
    expect(turns.next({ ...elsewhere, now: 0 })).toBeNull()
    expect(turns.next({ ...elsewhere, userSpeaking: true, now: 1000 })).toBeNull()
    expect(turns.next({ ...elsewhere, now: 5000 })).toBeNull()
    // And one that starts in the moment this chat asked for the microphone.
    turns.next({ ...quiet, now: 6000 })
    expect(turns.next({ ...quiet, now: 6600 })).toBe('open-microphone')
    expect(turns.next({ ...elsewhere, now: 6800 })).toBeNull()
    expect(turns.next({ ...elsewhere, userSpeaking: true, now: 7000 })).toBeNull()
    expect(turns.next({ ...elsewhere, now: 12_000 })).toBeNull()
    // Its own dictation, taken over by one elsewhere, is not sent either.
    turns.next({ ...quiet, now: 13_000 })
    expect(turns.next({ ...quiet, now: 13_600 })).toBe('open-microphone')
    turns.next({ ...mine, now: 13_800 })
    turns.next({ ...mine, userSpeaking: true, now: 14_000 })
    expect(turns.next({ ...elsewhere, now: 16_000 })).toBeNull()
  })

  it('keeps the microphone closed while a reply is spoken or about to be', () => {
    const turns = new HandsFreeTurns()
    expect(turns.next({ ...quiet, voiceSpeaking: true, now: 0 })).toBeNull()
    expect(turns.next({ ...quiet, voiceSpeaking: true, now: 5000 })).toBeNull()
    // The settle time starts over once the voice stops.
    expect(turns.next({ ...quiet, now: 5100 })).toBeNull()
    expect(turns.next({ ...quiet, voiceSpeaking: true, now: 5400 })).toBeNull()
    expect(turns.next({ ...quiet, now: 5500 })).toBeNull()
    expect(turns.next({ ...quiet, now: 6000 })).toBeNull()
    expect(turns.next({ ...quiet, now: 6100 })).toBe('open-microphone')
  })

  it('closes a microphone nobody talks into, or that hears sound without words twice', () => {
    const unused = new HandsFreeTurns()
    unused.next({ ...quiet, now: 0 })
    expect(unused.next({ ...quiet, now: 600 })).toBe('open-microphone')
    unused.next({ ...mine, now: 700 })
    expect(unused.next({ ...mine, now: 30_000 })).toBeNull()
    expect(unused.next({ ...mine, now: 30_700 })).toBe('close-unused')

    const noisy = new HandsFreeTurns()
    let now = 0
    const noiseThenNothing = (): ReturnType<HandsFreeTurns['next']> => {
      noisy.next({ ...quiet, now })
      expect(noisy.next({ ...quiet, now: (now += 600) })).toBe('open-microphone')
      noisy.next({ ...mine, now: (now += 100) })
      noisy.next({ ...mine, userSpeaking: true, now: (now += 100) })
      noisy.next({ ...mine, now: (now += 100) })
      expect(noisy.next({ ...mine, now: (now += 1400) })).toBe('send')
      // Nothing was sent, so the agent never starts working.
      return noisy.next({ ...quiet, now: (now += 4000) })
    }
    expect(noiseThenNothing()).toBeNull()
    expect(noiseThenNothing()).toBe('close-unheard')
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

  it('sends once and keeps the microphone closed while a sent message wakes a slow agent', () => {
    const turns = new HandsFreeTurns()
    const actions: string[] = []
    let now = 0
    const step = (facts: Omit<HandsFreeFacts, 'now'>, ms: number): void => {
      now += ms
      const action = turns.next({ ...facts, now })
      if (action) {
        actions.push(action)
      }
    }
    step(quiet, 0)
    step(quiet, 600)
    step(mine, 200)
    step({ ...mine, userSpeaking: true, hasDraft: true }, 200)
    step({ ...mine, hasDraft: true }, 100)
    step({ ...mine, hasDraft: true }, 1400)
    step({ ...quiet, dictation: 'stopping' }, 200)
    // The message is out or queued, and the agent takes 30 s to start working.
    for (let waited = 0; waited < 30_000; waited += 200) {
      step(quiet, 200)
    }
    expect(actions).toEqual(['open-microphone', 'send'])
    step({ ...quiet, agentWorking: true }, 200)
    // The agent is done; the microphone opens once the room has settled.
    step(quiet, 5000)
    step(quiet, 100)
    step(quiet, 600)
    expect(actions).toEqual(['open-microphone', 'send', 'open-microphone'])
  })

  it('opens on a reply played through the app and quiets it when the person talks over it', () => {
    const turns = new HandsFreeTurns()
    expect(turns.next({ ...reply, now: 0 })).toBe('overhear')
    expect(turns.next({ ...overheard, now: 300 })).toBeNull()
    // A click is too short to be the person talking.
    expect(turns.next({ ...overheard, userSpeaking: true, now: 500 })).toBeNull()
    expect(turns.next({ ...overheard, now: 700 })).toBeNull()
    expect(turns.next({ ...overheard, userSpeaking: true, now: 900 })).toBeNull()
    expect(turns.next({ ...overheard, userSpeaking: true, now: 1100 })).toBeNull()
    expect(turns.next({ ...overheard, userSpeaking: true, now: 1300 })).toBe('interrupt-voice')
    // From there it is the person's turn: their words go out after a pause.
    expect(turns.next({ ...mine, userSpeaking: true, now: 2000 })).toBeNull()
    expect(turns.next({ ...mine, now: 2100 })).toBeNull()
    expect(turns.next({ ...mine, now: 3500 })).toBe('send')
  })

  it('drops what the microphone took in when the reply ends untouched, then listens afresh', () => {
    const turns = new HandsFreeTurns()
    expect(turns.next({ ...reply, now: 0 })).toBe('overhear')
    expect(turns.next({ ...overheard, now: 300 })).toBeNull()
    expect(turns.next({ ...mine, now: 4000 })).toBe('stop-overhearing')
    expect(turns.next({ ...quiet, now: 4200 })).toBeNull()
    expect(turns.next({ ...quiet, now: 4800 })).toBe('open-microphone')
    // The system speaking directly cannot be told from the person, so the microphone stays shut.
    const direct = new HandsFreeTurns()
    expect(direct.next({ ...quiet, voiceSpeaking: true, now: 0 })).toBeNull()
  })
})
