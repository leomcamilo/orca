import type { DictationState } from '../../../../../../shared/speech-types'

export type HandsFreeFacts = {
  dictation: DictationState
  /** The microphone's meter hears a voice right now. */
  userSpeaking: boolean
  agentWorking: boolean
  /** A reply is being read aloud. */
  voiceSpeaking: boolean
  /** The composer would take a send. */
  canSend: boolean
  now: number
}

/** `close-unused`: nobody spoke into the open microphone. `give-up`: it would not open. */
export type HandsFreeAction = 'open-microphone' | 'send' | 'close-unused' | 'give-up' | null

// The reply's last word must leave the room before the microphone opens on it.
export const HANDS_FREE_SETTLE_MS = 600
// Longer than a breath or a thought, shorter than waiting to be answered.
export const HANDS_FREE_END_OF_SPEECH_MS = 1400
// An open microphone nobody talks into is closed: it costs battery, and money on a cloud model.
export const HANDS_FREE_NO_SPEECH_MS = 30_000
const OPEN_TIMEOUT_MS = 5000
const SENT_WITHOUT_WORK_MS = 4000

type Phase =
  | { name: 'resting'; readySince: number | null }
  | { name: 'opening'; since: number }
  | { name: 'listening'; since: number; lastSpeechAt: number | null }
  | { name: 'sent'; since: number; sawWork: boolean }

/** Takes turns with the agent by voice: opens the microphone once the agent has finished and its
 *  reply has been read, sends what was said after a pause, then waits for the next reply. The
 *  microphone stays closed while the agent works or speaks. */
export class HandsFreeTurns {
  private phase: Phase = { name: 'resting', readySince: null }
  private failedOpens = 0

  next(facts: HandsFreeFacts): HandsFreeAction {
    const { now } = facts
    if (facts.dictation === 'error') {
      return 'give-up'
    }
    const phase = this.phase
    if (phase.name === 'resting') {
      // Dictation the person started is taken over: it sends itself after a pause too.
      if (facts.dictation === 'listening') {
        this.phase = { name: 'listening', since: now, lastSpeechAt: null }
        return null
      }
      const ready =
        facts.dictation === 'idle' && !facts.agentWorking && !facts.voiceSpeaking && facts.canSend
      if (!ready) {
        phase.readySince = null
        return null
      }
      phase.readySince ??= now
      if (now - phase.readySince < HANDS_FREE_SETTLE_MS) {
        return null
      }
      this.phase = { name: 'opening', since: now }
      return 'open-microphone'
    }
    if (phase.name === 'opening') {
      if (facts.dictation === 'listening') {
        this.failedOpens = 0
        this.phase = { name: 'listening', since: now, lastSpeechAt: null }
      } else if (facts.dictation === 'idle' && now - phase.since >= OPEN_TIMEOUT_MS) {
        // A microphone that will not open (no model, no permission) is not asked forever.
        this.failedOpens += 1
        this.phase = { name: 'resting', readySince: null }
        return this.failedOpens >= 2 ? 'give-up' : null
      }
      return null
    }
    if (phase.name === 'listening') {
      if (facts.dictation === 'idle') {
        this.phase = { name: 'resting', readySince: null }
        return null
      }
      if (facts.dictation !== 'listening') {
        return null
      }
      if (facts.userSpeaking) {
        phase.lastSpeechAt = now
        return null
      }
      if (phase.lastSpeechAt === null) {
        return now - phase.since >= HANDS_FREE_NO_SPEECH_MS ? 'close-unused' : null
      }
      if (now - phase.lastSpeechAt < HANDS_FREE_END_OF_SPEECH_MS) {
        return null
      }
      this.phase = { name: 'sent', since: now, sawWork: false }
      return 'send'
    }
    phase.sawWork ||= facts.agentWorking
    const answered = phase.sawWork ? !facts.agentWorking : now - phase.since >= SENT_WITHOUT_WORK_MS
    if (facts.dictation === 'idle' && answered) {
      this.phase = { name: 'resting', readySince: null }
    }
    return null
  }
}
