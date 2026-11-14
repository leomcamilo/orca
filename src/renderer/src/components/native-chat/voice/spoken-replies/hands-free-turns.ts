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
  /** Words the person says over a reply quiet it, instead of waiting for it to end. */
  interrupts: boolean
  now: number
}

/** `overhear`: open the microphone while a reply is read, so the person can talk over it.
 *  `interrupt-voice`: words of theirs landed over the reply; quiet it. `close-unused`: nobody
 *  spoke into the open microphone. `close-unheard`: what it heard held no words, twice.
 *  `give-up`: it would not open. */
export type HandsFreeAction =
  | 'open-microphone'
  | 'overhear'
  | 'interrupt-voice'
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
  /** The microphone is open on a reply being read. The meter hears the reply too, so only words
   *  that land in the composer, which the dictation's echo filter has passed, count. */
  | { name: 'overhearing'; since: number; heard: boolean }
  /** `overheard`: the microphone was open over the reply, when the meter could not tell the
   *  person from the voice; words of theirs that land afterwards count as speech. */
  | {
      name: 'listening'
      since: number
      lastSpeechAt: number | null
      speaking: boolean
      overheard: boolean
    }
  | { name: 'sent'; since: number; sawWork: boolean }

function dueAt(phase: Phase): number | null {
  switch (phase.name) {
    case 'resting':
      return phase.readySince === null ? null : phase.readySince + HANDS_FREE_SETTLE_MS
    case 'opening':
      return phase.since + OPEN_TIMEOUT_MS
    case 'overhearing':
      // Once the microphone is open over the reply, only a change moves the turn.
      return phase.heard ? null : phase.since + OPEN_TIMEOUT_MS
    case 'listening':
      if (phase.speaking) {
        return null
      }
      return phase.lastSpeechAt === null
        ? phase.since + HANDS_FREE_NO_SPEECH_MS
        : phase.lastSpeechAt + HANDS_FREE_END_OF_SPEECH_MS
    case 'sent':
      return phase.sawWork ? null : phase.since + SENT_WITHOUT_WORK_MS
  }
}

function quiet(facts: HandsFreeFacts): boolean {
  return facts.dictation === 'idle' && !facts.agentWorking && !facts.voiceSpeaking && facts.canSend
}

// A draft already there would go out with whatever the microphone hears next, noise included, so
// the microphone opens on an empty composer only.
function ready(facts: HandsFreeFacts): boolean {
  return quiet(facts) && !facts.hasDraft
}

/** Takes turns with the agent by voice: opens the microphone once the agent has finished, keeps it
 *  open while the reply is read so the person can talk over it, and sends what they said after
 *  the reply and a pause. The microphone stays closed while the agent works. It sends only the
 *  dictation it opened into its own composer; dictation the person starts anywhere is theirs,
 *  and this waits it out. */
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
    const at = dueAt(this.phase)
    return at !== null && at > this.lookedAt ? at : null
  }

  /** The microphone is open, or opening, because this turn asked for it. */
  holdsMicrophone(): boolean {
    return (
      this.phase.name === 'opening' ||
      this.phase.name === 'overhearing' ||
      this.phase.name === 'listening'
    )
  }

  /** The microphone is open on a reply being read; the reply must keep playing. */
  overhears(): boolean {
    return this.phase.name === 'overhearing'
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
      if (
        facts.voiceSpeaking &&
        facts.dictation === 'idle' &&
        !facts.agentWorking &&
        facts.canSend &&
        !facts.hasDraft
      ) {
        this.phase = { name: 'overhearing', since: now, heard: false }
        return 'overhear'
      }
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
    if (phase.name === 'overhearing') {
      return this.overhear(phase, facts)
    }
    if (phase.name === 'opening') {
      if (facts.dictation === 'listening') {
        // A dictation that lands elsewhere started in the same moment; it is not this chat's.
        this.failedOpens = 0
        if (facts.ownsDictation) {
          this.phase = {
            name: 'listening',
            since: now,
            lastSpeechAt: null,
            speaking: false,
            overheard: false
          }
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
      if (phase.overheard && facts.hasDraft && phase.lastSpeechAt === null) {
        phase.lastSpeechAt = now
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
        // The reply may start reading in the moment the work ends.
        return this.move(facts)
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

  /** While a reply is read: the microphone stays open and the reply plays on, unless words of the
   *  person's land and they asked to interrupt. When the reply ends, what they said goes out after
   *  the next pause, and nothing is lost. */
  private overhear(
    phase: { name: 'overhearing'; since: number; heard: boolean },
    facts: HandsFreeFacts
  ): HandsFreeAction {
    const { now } = facts
    const mine = facts.dictation === 'listening' && facts.ownsDictation
    if (facts.dictation === 'listening' && !facts.ownsDictation) {
      this.rest(facts)
      return null
    }
    if (mine) {
      phase.heard = true
      this.failedOpens = 0
    }
    if (facts.dictation === 'idle' && (phase.heard || now - phase.since >= OPEN_TIMEOUT_MS)) {
      // Closed under it, or never opened: a microphone that will not open is not asked forever.
      this.failedOpens += phase.heard ? 0 : 1
      this.rest(facts)
      return this.failedOpens >= 2 ? 'give-up' : null
    }
    if (!facts.voiceSpeaking) {
      // What the person said over the reply goes after a pause. The meter is not trusted at this
      // moment: it may still hear the reply's last word.
      this.phase = mine
        ? {
            name: 'listening',
            since: now,
            lastSpeechAt: facts.hasDraft ? now : null,
            speaking: false,
            overheard: true
          }
        : { name: 'opening', since: phase.since }
      return null
    }
    if (mine && facts.interrupts && facts.hasDraft) {
      this.phase = {
        name: 'listening',
        since: now,
        lastSpeechAt: now,
        speaking: false,
        overheard: true
      }
      return 'interrupt-voice'
    }
    return null
  }

  /** Back to rest. The settle starts here when the room is already ready: no change may come
   *  afterwards to start it, and a turn that only changes can move would wait forever. */
  private rest(facts: HandsFreeFacts): void {
    this.phase = { name: 'resting', readySince: ready(facts) ? facts.now : null }
  }
}
