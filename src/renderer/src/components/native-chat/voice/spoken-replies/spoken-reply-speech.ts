import type { OpenAiSpeechVoice } from '../../../../../../shared/speech-synthesis'

/** The slice of the Web Speech API the queue drives, so a test can stand in for the system voice. */
export type SpokenReplyVoice = {
  voiceURI: string
  name: string
  lang: string
  localService: boolean
  default: boolean
}

/** The voice to speak with. Without one, the language still tells the system which to use.
 *  With `api`, a speech service reads the line instead of the system. */
export type SpokenReplyVoicePick = {
  voice: SpokenReplyVoice | null
  language: string | null
  api?: { voice: OpenAiSpeechVoice }
}

export type SpokenReplySynthesizer = {
  /** `onDone` fires once, when the line ends, is cancelled, or fails; a failed line ends its
   *  reply, since the lines after it would fail the same way. */
  speak: (text: string, pick: SpokenReplyVoicePick, onDone: (failed?: boolean) => void) => void
  cancel: () => void
  /** Told a reply's lines as its first is spoken, so the rest can be made ready meanwhile. */
  prepare?: (lines: readonly string[], pick: SpokenReplyVoicePick) => void
}

export type SpokenReplyLine = { owner: string; text: string }

type Job = { owner: string; lines: string[]; pick: () => SpokenReplyVoicePick }

export type SpokenReplySpeechTiming = {
  /** Runs the next reply after a cancel; a system that drops a line spoken right after one gets
   *  a moment first. */
  afterCancel: (next: () => void) => void
  /** Runs a line once the system can speak it in the right voice. */
  whenReady: (speak: () => void) => void
}

const AT_ONCE: SpokenReplySpeechTiming = {
  afterCancel: (next) => next(),
  whenReady: (speak) => speak()
}

function languageOf(tag: string): string {
  return tag.replace('_', '-').toLowerCase()
}

/** The chosen voice if the system still has it; else an on-device voice for the first language
 *  that has one, preferring the exact region. With no voice, the first language is the pick. */
export function pickSpokenReplyVoice(
  voices: readonly SpokenReplyVoice[],
  chosenVoiceURI: string | undefined,
  languages: readonly string[]
): SpokenReplyVoicePick {
  const voice = voiceFor(voices, chosenVoiceURI, languages)
  return { voice, language: voice?.lang ?? languages[0] ?? null }
}

function voiceFor(
  voices: readonly SpokenReplyVoice[],
  chosenVoiceURI: string | undefined,
  languages: readonly string[]
): SpokenReplyVoice | null {
  const chosen = voices.find((voice) => voice.voiceURI === chosenVoiceURI)
  if (chosen) {
    return chosen
  }
  const onDevice = voices.filter((voice) => voice.localService)
  const regions = languages.map(languageOf)
  for (const language of regions) {
    const primary = language.split('-')[0]
    const spoken = onDevice.filter((voice) => languageOf(voice.lang).split('-')[0] === primary)
    const match =
      spoken.find((voice) => languageOf(voice.lang) === language) ??
      spoken.find((voice) => regions.includes(languageOf(voice.lang))) ??
      spoken.find((voice) => voice.default) ??
      spoken[0]
    if (match) {
      return match
    }
  }
  return null
}

/** One voice for every chat: replies wait their turn, and a chat silences only its own. */
export class SpokenReplySpeech {
  private readonly queue: Job[] = []
  private current: { job: Job; line: number } | null = null
  // Between a cancel and the next line, nothing new starts.
  private settling = false

  constructor(
    private readonly synthesizer: SpokenReplySynthesizer,
    private readonly onLine: (line: SpokenReplyLine | null) => void,
    private readonly timing: SpokenReplySpeechTiming = AT_ONCE
  ) {}

  /** `pick` is asked when a line is spoken, since the system may list its voices after `say`. */
  say(owner: string, lines: readonly string[], pick: () => SpokenReplyVoicePick): void {
    const spoken = lines.filter((line) => line.trim().length > 0)
    if (spoken.length === 0) {
      return
    }
    this.queue.push({ owner, lines: spoken, pick })
    this.advance()
  }

  /** Stops this owner's speech and drops what it had waiting; other owners keep theirs. */
  silence(owner: string): void {
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      if (this.queue[index].owner === owner) {
        this.queue.splice(index, 1)
      }
    }
    if (this.current?.job.owner === owner) {
      this.current = null
      this.synthesizer.cancel()
      this.onLine(null)
      this.settling = true
      this.timing.afterCancel(() => {
        this.settling = false
        this.advance()
      })
    }
  }

  private advance(): void {
    if (this.current || this.settling) {
      return
    }
    const job = this.queue.shift()
    if (job) {
      this.speakLine(job, 0)
    }
  }

  private speakLine(job: Job, line: number): void {
    const spoken = { job, line }
    this.current = spoken
    // Published before any wait, so a line about to be spoken already counts as speech.
    this.onLine({ owner: job.owner, text: job.lines[line] })
    this.timing.whenReady(() => {
      // Silenced while it waited.
      if (this.current !== spoken) {
        return
      }
      const pick = job.pick()
      if (line === 0) {
        this.synthesizer.prepare?.(job.lines, pick)
      }
      this.synthesizer.speak(job.lines[line], pick, (failed) => {
        // A cancelled line still reports its end; only the one being spoken moves the queue.
        if (this.current !== spoken) {
          return
        }
        this.current = null
        if (!failed && line + 1 < job.lines.length) {
          this.speakLine(job, line + 1)
          return
        }
        this.onLine(null)
        this.advance()
      })
    })
  }
}
