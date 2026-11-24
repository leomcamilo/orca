/** Microphone level over what the voice puts out, for a reply heard back. On laptop speakers it
 *  measured near −40 dB after echo cancellation and near −5 dB without it; a reading starts at
 *  −20 dB and learns its own from there. */
export const BARGE_IN_PRIOR_COUPLING = 0.1
/** How far above the echo it explains the microphone must be to look like the person. */
export const BARGE_IN_MARGIN = 2.5
// The microphone hears what the voice played this long ago: output, room and capture latency.
const ECHO_DELAY_MS = 300
// Below this the voice is between words, and only the room's noise is expected.
const OUTPUT_FLOOR = 0.003
const MIN_NOISE = 0.002
// The room is the quietest the microphone was lately: a steady hum is explained, speech is not.
const NOISE_WINDOW_MS = 1500
// Two 50 ms windows: a click or a plosive of the voice is shorter.
const CANDIDATE_FRAMES = 2
// With the voice held, its echo and the room's reverberation die out within this.
const SETTLE_MS = 100
const PROBE_MS = 400
// Speech that goes on while the voice is held: two windows within 12 dB of what paused it.
const PROBE_SPEECH_FRAMES = 2
const PROBE_SHARE = 0.25
// After a pause the voice explained, it plays on undisturbed for a while.
const COOLDOWN_MS = 1500

export type BargeInFrame = {
  /** Milliseconds, on the clock the microphone's windows are stamped with. */
  now: number
  /** RMS of the last microphone window, after the browser's echo cancellation. */
  microphone: number
  /** RMS of what the voice plays now; 0 while it is held. */
  output: number
}

/** `pause`: hold the voice to listen. `resume`: it was the voice's echo; play on. `stop`: the
 *  person kept talking with the voice held; quiet it for good. */
export type BargeInDecision = 'pause' | 'resume' | 'stop' | null

/** Tells the person talking over a reply from the reply heard back, while a voice plays it on this
 *  page. A microphone louder than the voice explains holds the voice; only speech that goes on while
 *  it is held stops it, so the voice cannot quiet itself for good. */
export class SpokenReplyBargeIn {
  private coupling = BARGE_IN_PRIOR_COUPLING
  private noise = MIN_NOISE
  private outputs: { at: number; level: number }[] = []
  private heard: { at: number; level: number }[] = []
  private over = 0
  private probe: { since: number; level: number; ratio: number | null; speech: number } | null =
    null
  private calmUntil = Number.NEGATIVE_INFINITY
  // Once the person is heard, the reply is theirs to end; nothing more is decided.
  private stopped = false

  hear(frame: BargeInFrame): BargeInDecision {
    if (this.stopped) {
      return null
    }
    const decision = this.probe ? this.listenHeld(frame, this.probe) : this.listenOver(frame)
    this.stopped = decision === 'stop'
    return decision
  }

  private listenOver({ now, microphone, output }: BargeInFrame): BargeInDecision {
    this.outputs = [
      ...this.outputs.filter((entry) => now - entry.at < ECHO_DELAY_MS),
      { at: now, level: output }
    ]
    const voice = Math.max(...this.outputs.map((entry) => entry.level))
    this.heard = [
      ...this.heard.filter((entry) => now - entry.at < NOISE_WINDOW_MS),
      { at: now, level: microphone }
    ]
    this.noise = Math.max(MIN_NOISE, Math.min(...this.heard.map((entry) => entry.level)))
    const explained = Math.max(voice >= OUTPUT_FLOOR ? this.coupling * voice : 0, this.noise)
    if (microphone <= explained * BARGE_IN_MARGIN) {
      this.over = 0
      if (voice >= OUTPUT_FLOOR) {
        // A louder echo is taken at once in part; a quieter one is trusted slowly.
        const ratio = microphone / voice
        this.coupling += (ratio - this.coupling) * (ratio > this.coupling ? 0.3 : 0.02)
      }
      return null
    }
    if (now < this.calmUntil) {
      return null
    }
    this.over += 1
    if (this.over < CANDIDATE_FRAMES) {
      return null
    }
    this.over = 0
    this.probe = {
      since: now,
      level: microphone,
      ratio: voice >= OUTPUT_FLOOR ? microphone / voice : null,
      speech: 0
    }
    return 'pause'
  }

  private listenHeld(
    { now, microphone }: BargeInFrame,
    probe: { since: number; level: number; ratio: number | null; speech: number }
  ): BargeInDecision {
    const elapsed = now - probe.since
    if (
      elapsed >= SETTLE_MS &&
      microphone >= probe.level * PROBE_SHARE &&
      microphone > this.noise * BARGE_IN_MARGIN
    ) {
      probe.speech += 1
      if (probe.speech >= PROBE_SPEECH_FRAMES) {
        this.probe = null
        return 'stop'
      }
    }
    if (elapsed < SETTLE_MS + PROBE_MS) {
      return null
    }
    this.probe = null
    this.outputs = []
    this.calmUntil = now + COOLDOWN_MS
    if (probe.ratio !== null) {
      // That loud was the voice: a level like it no longer holds the reading.
      this.coupling = Math.max(this.coupling, probe.ratio / BARGE_IN_MARGIN)
    }
    return 'resume'
  }
}
