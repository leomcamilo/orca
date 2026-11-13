/** The slice of the Web Speech API the queue drives, so a test can stand in for the system voice. */
export type SpokenReplyVoice = {
  voiceURI: string
  name: string
  lang: string
  localService: boolean
  default: boolean
}

export type SpokenReplySynthesizer = {
  /** `onDone` fires once, when the line ends, fails or is cancelled. */
  speak: (text: string, voice: SpokenReplyVoice | null, onDone: () => void) => void
  cancel: () => void
}

export type SpokenReplyLine = { owner: string; text: string }

type Job = { owner: string; lines: string[]; voice: SpokenReplyVoice | null }

function languageOf(tag: string): string {
  return tag.replace('_', '-').toLowerCase()
}

/** The chosen voice if the system still has it; else an on-device voice for the first language
 *  that has one, preferring the exact region. Null leaves the choice to the system. */
export function pickSpokenReplyVoice(
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

  constructor(
    private readonly synthesizer: SpokenReplySynthesizer,
    private readonly onLine: (line: SpokenReplyLine | null) => void
  ) {}

  say(owner: string, lines: readonly string[], voice: SpokenReplyVoice | null): void {
    const spoken = lines.filter((line) => line.trim().length > 0)
    if (spoken.length === 0) {
      return
    }
    this.queue.push({ owner, lines: spoken, voice })
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
      this.advance()
    }
  }

  private advance(): void {
    if (this.current) {
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
    this.onLine({ owner: job.owner, text: job.lines[line] })
    this.synthesizer.speak(job.lines[line], job.voice, () => {
      // A cancelled line still reports its end; only the one being spoken moves the queue.
      if (this.current !== spoken) {
        return
      }
      this.current = null
      if (line + 1 < job.lines.length) {
        this.speakLine(job, line + 1)
        return
      }
      this.onLine(null)
      this.advance()
    })
  }
}
