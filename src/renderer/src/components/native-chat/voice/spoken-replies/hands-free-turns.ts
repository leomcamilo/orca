import type { DictationState } from '../../../../../../shared/speech-types'

export type HandsFreeFacts = {
  dictation: DictationState
  /** The running dictation writes into this chat's composer. */
  ownsDictation: boolean
  /** The microphone's meter hears a voice right now. */
  userSpeaking: boolean
  agentWorking: boolean
  /** A reply is being read aloud, or is about to be. */
  voiceSpeaking: boolean
  /** The reply plays through the app, so the microphone can stay open on it and tell the
   *  person's voice from it. */
  voiceCancelsEcho: boolean
  /** The composer would take a send. */
  canSend: boolean
  /** The composer holds words, dictated or typed, since the last look. */
  hasDraft: boolean
  now: number
}

/** `overhear`: open the microphone while the reply is read. `interrupt-voice`: the person talked
 *  over the reply; quiet it and keep listening. `stop-overhearing`: the reply ended untouched;
 *  drop what the microphone took in. `close-unused`: nobody spoke into the open microphone.
 *  `close-unheard`: what it heard held no words, twice. `give-up`: it would not open. */
export type HandsFreeAction =
  | 'open-microphone'
  | 'overhear'
  | 'interrupt-voice'
  | 'stop-overhearing'
  | 'send'
  | 'close-unused'
  | 'close-unheard'
  | 'give-up'
  | null

// The reply's last word must leave the room before the microphone opens on it.
export const HANDS_FREE_SETTLE_MS = 600
// Longer than a breath or a thought, shorter than waiting to be answered.
export const HANDS_FREE_END_OF_SPEECH_MS = 1400
// An open microphone nobody talks into is closed: it costs battery, and money on a cloud model.
export const HANDS_FREE_NO_SPEECH_MS = 30_000
// A cough or a click is shorter than this; a word is not.
export const HANDS_FREE_INTERRUPT_MS = 400
const OPEN_TIMEOUT_MS = 5000
const SENT_WITHOUT_WORK_MS = 4000
// A message that did go out may wake a resting agent, which takes a while to start working.
const SENT_WAITS_FOR_WORK_MS = 60_000

type Phase =
  | { name: 'resting'; readySince: number | null }
  | { name: 'opening'; since: number }
  | { name: 'overhearing'; speechSince: number | null }
  | { name: 'listening'; since: number; lastSpeechAt: number | null; wrote: boolean }
  | { name: 'sent'; since: number; sawWork: boolean; wrote: boolean }

const RESTING: Phase = { name: 'resting', readySince: null }

/** Takes turns with the agent by voice: opens the microphone once the agent has finished and its
 *  reply has been read, sends what was said after a pause, then waits for the next reply. The
 *  microphone stays closed while the agent works or speaks, unless the reply plays through the
 *  app: then it opens on the reply, and the person talking over it quiets the reply without
 *  stopping the agent. It sends only the dictation it opened into its own composer; dictation
 *  the person starts anywhere is theirs, and this waits it out. */
export class HandsFreeTurns {
  private phase: Phase = { ...RESTING }
  private failedOpens = 0
  // Noise passes for speech at the meter, but sends nothing; it must not keep the microphone open.
  private unheardSends = 0

  next(facts: HandsFreeFacts): HandsFreeAction {
    const { now } = facts
    if (facts.dictation === 'error') {
      return 'give-up'
    }
    const phase = this.phase
    if (phase.name === 'resting') {
      if (
        facts.voiceSpeaking &&
        facts.voiceCancelsEcho &&
        facts.dictation === 'idle' &&
        facts.canSend
      ) {
        this.phase = { name: 'overhearing', speechSince: null }
        return 'overhear'
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
    if (phase.name === 'overhearing') {
      const mine = facts.dictation === 'listening' && facts.ownsDictation
      if (!facts.voiceSpeaking) {
        this.phase = { ...RESTING }
        return mine || facts.dictation === 'starting' ? 'stop-overhearing' : null
      }
      if (facts.dictation === 'listening' && !facts.ownsDictation) {
        this.phase = { ...RESTING }
        return null
      }
      if (!mine || !facts.userSpeaking) {
        phase.speechSince = null
        return null
      }
      phase.speechSince ??= now
      if (now - phase.speechSince < HANDS_FREE_INTERRUPT_MS) {
        return null
      }
      this.phase = { name: 'listening', since: now, lastSpeechAt: now, wrote: false }
      return 'interrupt-voice'
    }
    if (phase.name === 'opening') {
      if (facts.dictation === 'listening') {
        // A dictation that lands elsewhere started in the same moment; it is not this chat's.
        this.failedOpens = 0
        this.phase = facts.ownsDictation
          ? { name: 'listening', since: now, lastSpeechAt: null, wrote: false }
          : { ...RESTING }
      } else if (facts.dictation === 'idle' && now - phase.since >= OPEN_TIMEOUT_MS) {
        // A microphone that will not open (no model, no permission) is not asked forever.
        this.failedOpens += 1
        this.phase = { ...RESTING }
        return this.failedOpens >= 2 ? 'give-up' : null
      }
      return null
    }
    if (phase.name === 'listening') {
      if (facts.dictation === 'idle' || !facts.ownsDictation) {
        this.phase = { ...RESTING }
        return null
      }
      phase.wrote ||= facts.hasDraft
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
      this.phase = { name: 'sent', since: now, sawWork: false, wrote: phase.wrote }
      return 'send'
    }
    phase.sawWork ||= facts.agentWorking
    // A cloud model's words land only now, after the microphone closes.
    phase.wrote ||= facts.hasDraft
    if (facts.dictation !== 'idle') {
      return null
    }
    if (phase.sawWork) {
      this.unheardSends = 0
      if (!facts.agentWorking) {
        this.phase = { ...RESTING }
      }
      return null
    }
    if (now - phase.since < (phase.wrote ? SENT_WAITS_FOR_WORK_MS : SENT_WITHOUT_WORK_MS)) {
      return null
    }
    if (phase.wrote) {
      this.unheardSends = 0
      this.phase = { ...RESTING }
      return null
    }
    this.unheardSends += 1
    this.phase = { ...RESTING }
    return this.unheardSends >= 2 ? 'close-unheard' : null
  }
}
