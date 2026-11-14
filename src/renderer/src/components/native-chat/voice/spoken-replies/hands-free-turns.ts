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
  /** The composer would take a send. */
  canSend: boolean
  /** The composer holds words, dictated or typed. */
  hasDraft: boolean
  now: number
}

/** `close-unused`: nobody spoke into the open microphone. `close-unheard`: what it heard held no
 *  words, twice. `give-up`: it would not open. */
export type HandsFreeAction =
  | 'open-microphone'
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
const OPEN_TIMEOUT_MS = 5000
const SENT_WITHOUT_WORK_MS = 4000

type Phase =
  | { name: 'resting'; readySince: number | null }
  | { name: 'opening'; since: number }
  | { name: 'listening'; since: number; lastSpeechAt: number | null; speaking: boolean }
  | { name: 'sent'; since: number; sawWork: boolean }

function quiet(facts: HandsFreeFacts): boolean {
  return facts.dictation === 'idle' && !facts.agentWorking && !facts.voiceSpeaking && facts.canSend
}

// A draft already there would go out with whatever the microphone hears next, noise included, so
// the microphone opens on an empty composer only.
function ready(facts: HandsFreeFacts): boolean {
  return quiet(facts) && !facts.hasDraft
}

/** Takes turns with the agent by voice: opens the microphone once the agent has finished and its
 *  reply has been read, sends what was said after a pause, then waits for the next reply. The
 *  microphone stays closed while the agent works or speaks. It sends only the dictation it opened
 *  into its own composer; dictation the person starts anywhere is theirs, and this waits it out. */
export class HandsFreeTurns {
  private phase: Phase = { name: 'resting', readySince: null }
  private failedOpens = 0
  // Noise passes for speech at the meter, but sends nothing; it must not keep the microphone open.
  private unheardSends = 0
  private lookedAt = 0
  private draftInTheWay = false

  /** When to look again though no fact has changed: the end of a settle, a pause or a wait. Null
   *  while only a change can move the turn, so nothing ticks while it rests. */
  deadline(): number | null {
    const phase = this.phase
    const at =
      phase.name === 'resting'
        ? phase.readySince === null
          ? null
          : phase.readySince + HANDS_FREE_SETTLE_MS
        : phase.name === 'opening'
          ? phase.since + OPEN_TIMEOUT_MS
          : phase.name === 'listening'
            ? phase.speaking
              ? null
              : phase.lastSpeechAt === null
                ? phase.since + HANDS_FREE_NO_SPEECH_MS
                : phase.lastSpeechAt + HANDS_FREE_END_OF_SPEECH_MS
            : phase.sawWork
              ? null
              : phase.since + SENT_WITHOUT_WORK_MS
    return at !== null && at > this.lookedAt ? at : null
  }

  /** The microphone is open, or opening, because this turn asked for it. */
  holdsMicrophone(): boolean {
    return this.phase.name === 'opening' || this.phase.name === 'listening'
  }

  /** Only the draft in the composer keeps the microphone from opening. */
  waitsForEmptyComposer(): boolean {
    return this.draftInTheWay
  }

  next(facts: HandsFreeFacts): HandsFreeAction {
    const action = this.move(facts)
    this.draftInTheWay = this.phase.name === 'resting' && quiet(facts) && facts.hasDraft
    return action
  }

  private move(facts: HandsFreeFacts): HandsFreeAction {
    const { now } = facts
    this.lookedAt = now
    if (facts.dictation === 'error') {
      return 'give-up'
    }
    const phase = this.phase
    if (phase.name === 'resting') {
      if (!ready(facts)) {
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
        // A dictation that lands elsewhere started in the same moment; it is not this chat's.
        this.failedOpens = 0
        if (facts.ownsDictation) {
          this.phase = { name: 'listening', since: now, lastSpeechAt: null, speaking: false }
        } else {
          this.rest(facts)
        }
      } else if (facts.dictation === 'idle' && now - phase.since >= OPEN_TIMEOUT_MS) {
        // A microphone that will not open (no model, no permission) is not asked forever.
        this.failedOpens += 1
        this.rest(facts)
        return this.failedOpens >= 2 ? 'give-up' : null
      }
      return null
    }
    if (phase.name === 'listening') {
      if (facts.dictation === 'idle' || !facts.ownsDictation) {
        this.rest(facts)
        return null
      }
      if (facts.dictation !== 'listening') {
        return null
      }
      // The facts arrive as changes, not as a stream: speech lasts from its start to its end.
      if (facts.userSpeaking || phase.speaking) {
        phase.lastSpeechAt = now
      }
      phase.speaking = facts.userSpeaking
      if (facts.userSpeaking) {
        return null
      }
      if (phase.lastSpeechAt === null) {
        if (now - phase.since < HANDS_FREE_NO_SPEECH_MS) {
          return null
        }
        this.phase = { name: 'resting', readySince: null }
        return 'close-unused'
      }
      if (now - phase.lastSpeechAt < HANDS_FREE_END_OF_SPEECH_MS) {
        return null
      }
      this.phase = { name: 'sent', since: now, sawWork: false }
      return 'send'
    }
    phase.sawWork ||= facts.agentWorking
    if (facts.dictation !== 'idle') {
      return null
    }
    if (phase.sawWork) {
      this.unheardSends = 0
      if (!facts.agentWorking) {
        this.rest(facts)
      }
      return null
    }
    if (now - phase.since < SENT_WITHOUT_WORK_MS) {
      return null
    }
    this.unheardSends += 1
    this.rest(facts)
    return this.unheardSends >= 2 ? 'close-unheard' : null
  }

  /** Back to rest. The settle starts here when the room is already ready: no change may come
   *  afterwards to start it, and a turn that only changes can move would wait forever. */
  private rest(facts: HandsFreeFacts): void {
    this.phase = { name: 'resting', readySince: ready(facts) ? facts.now : null }
  }
}
