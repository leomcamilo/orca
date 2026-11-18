import type {
  SpeechSynthesisFailure,
  SpeechSynthesisProvider,
  SpeechSynthesisRequest,
  SpeechSynthesisResult
} from '../../../../../../shared/speech-synthesis'
import type { SpokenReplySynthesizer, SpokenReplyVoicePick } from './spoken-reply-speech'
import { spokenText } from './spoken-reply-words'

/** The slice of Web Audio the reader drives. */
export type SpokenReplyAudio = {
  /** Decodes and plays one sound; `onEnded` fires when it finishes or is stopped. */
  play: (sound: Uint8Array, onEnded: () => void) => Promise<{ stop: () => void }>
}

type Asked = { requestId: string; result: Promise<SpeechSynthesisResult> }

/** Reads lines picked for a speech service through it, and the rest with the system voice. A
 *  failure is reported and ends the reply: it never falls back to the system voice. */
export function createApiVoiceSynthesizer(deps: {
  synthesize: (request: SpeechSynthesisRequest) => Promise<SpeechSynthesisResult>
  cancel: (requestId: string) => void
  audio: SpokenReplyAudio
  system: SpokenReplySynthesizer
  onFailure: (
    failure: SpeechSynthesisFailure,
    message: string | undefined,
    provider: SpeechSynthesisProvider
  ) => void
}): SpokenReplySynthesizer {
  let requests = 0
  // Each speak and each cancel moves this on, so an answer that comes late knows it is stale.
  let generation = 0
  let playing: { stop: () => void } | null = null
  let finish: (() => void) | null = null
  // Asked ahead of their line, so one sentence follows another without a wait.
  const asked = new Map<string, Asked>()
  const out = new Set<string>()

  const keyOf = (text: string, pick: SpokenReplyVoicePick): string =>
    `${pick.api?.provider}\n${pick.api?.voice}\n${pick.api?.model ?? ''}\n${text}`

  const ask = (text: string, pick: SpokenReplyVoicePick): Asked => {
    const key = keyOf(text, pick)
    const known = asked.get(key)
    if (known) {
      asked.delete(key)
      return known
    }
    requests += 1
    const requestId = `spoken-reply-${requests}`
    out.add(requestId)
    const api = pick.api ?? { provider: 'openai', voice: 'marin' }
    const result = deps
      .synthesize({
        requestId,
        text,
        provider: api.provider,
        voice: api.voice,
        ...(api.model ? { model: api.model } : {})
      })
      .catch((): SpeechSynthesisResult => ({ ok: false, failure: 'network' }))
      .finally(() => out.delete(requestId))
    return { requestId, result }
  }

  const drop = (): void => {
    asked.clear()
    for (const requestId of out) {
      deps.cancel(requestId)
    }
    out.clear()
  }

  return {
    prepare: (lines, pick) => {
      drop()
      if (!pick.api) {
        return
      }
      for (const line of lines) {
        const text = spokenText(line, pick)
        const key = keyOf(text, pick)
        // A line said twice is asked for once here; its second reading asks again.
        if (!asked.has(key)) {
          asked.set(key, ask(text, pick))
        }
      }
    },
    speak: (line, pick, onDone) => {
      const text = spokenText(line, pick)
      if (!pick.api) {
        deps.system.speak(text, pick, onDone)
        return
      }
      generation += 1
      const mine = generation
      let done = false
      const end = (failed?: boolean): void => {
        if (done) {
          return
        }
        done = true
        if (generation === mine) {
          playing = null
          finish = null
        }
        onDone(failed)
      }
      finish = end
      void ask(text, pick).result.then(async (result) => {
        if (generation !== mine || done) {
          return
        }
        if (!result.ok) {
          if (result.failure !== 'cancelled' && pick.api) {
            deps.onFailure(result.failure, result.message, pick.api.provider)
          }
          end(result.failure !== 'cancelled')
          return
        }
        try {
          const sound = await deps.audio.play(result.audio, () => end())
          if (generation === mine && !done) {
            playing = sound
          } else {
            sound.stop()
          }
        } catch {
          if (pick.api) {
            deps.onFailure('refused', 'The speech audio could not be played', pick.api.provider)
          }
          end(true)
        }
      })
    },
    cancel: () => {
      generation += 1
      drop()
      playing?.stop()
      playing = null
      deps.system.cancel()
      // A line still being asked for has no sound to stop; it ends here.
      finish?.()
      finish = null
    }
  }
}

let context: AudioContext | null = null
// What the voice puts out, measured where it leaves for the speakers.
let output: { analyser: AnalyserNode; samples: Float32Array<ArrayBuffer> } | null = null
let sounding = 0

/** Plays through one shared AudioContext, created on first use. */
export const spokenReplyAudio: SpokenReplyAudio = {
  play: async (sound, onEnded) => {
    context ??= new AudioContext()
    await context.resume()
    if (!output) {
      const analyser = context.createAnalyser()
      analyser.fftSize = 1024
      analyser.connect(context.destination)
      output = { analyser, samples: new Float32Array(analyser.fftSize) }
    }
    // decodeAudioData takes the buffer over, so it gets its own copy.
    const buffer = await context.decodeAudioData(sound.slice().buffer)
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(output.analyser)
    let ended = false
    const end = (): void => {
      if (!ended) {
        ended = true
        sounding -= 1
        onEnded()
      }
    }
    source.onended = end
    sounding += 1
    source.start()
    return {
      stop: () => {
        source.onended = null
        source.stop()
        end()
      }
    }
  }
}

/** Whether a reply sounds through this page now, where the browser's echo cancellation hears it. */
export function spokenReplyAudioSounding(): boolean {
  return sounding > 0
}

/** RMS of what the voice plays now. */
export function spokenReplyOutputLevel(): number {
  if (!output) {
    return 0
  }
  output.analyser.getFloatTimeDomainData(output.samples)
  let sum = 0
  for (const sample of output.samples) {
    sum += sample * sample
  }
  return Math.sqrt(sum / output.samples.length)
}

/** Holds the reply where it is, or lets it play on from there. */
export function holdSpokenReplyAudio(held: boolean): void {
  if (context) {
    void (held ? context.suspend() : context.resume())
  }
}
