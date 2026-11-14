import type {
  SpeechSynthesisFailure,
  SpeechSynthesisRequest,
  SpeechSynthesisResult
} from '../../../../../../shared/speech-synthesis'
import type { SpokenReplySynthesizer, SpokenReplyVoicePick } from './spoken-reply-speech'

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
  onFailure: (failure: SpeechSynthesisFailure, message?: string) => void
}): SpokenReplySynthesizer {
  let requests = 0
  // Each speak and each cancel moves this on, so an answer that comes late knows it is stale.
  let generation = 0
  let playing: { stop: () => void } | null = null
  let finish: (() => void) | null = null
  // Asked ahead of their line, so one sentence follows another without a wait.
  const asked = new Map<string, Asked>()
  const out = new Set<string>()

  const ask = (text: string, pick: SpokenReplyVoicePick): Asked => {
    const key = `${pick.api?.voice ?? ''}\n${text}`
    const known = asked.get(key)
    if (known) {
      asked.delete(key)
      return known
    }
    requests += 1
    const requestId = `spoken-reply-${requests}`
    out.add(requestId)
    const result = deps
      .synthesize({ requestId, text, voice: pick.api?.voice ?? 'marin' })
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
      for (const text of lines) {
        asked.set(`${pick.api.voice}\n${text}`, ask(text, pick))
      }
    },
    speak: (text, pick, onDone) => {
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
          if (result.failure !== 'cancelled') {
            deps.onFailure(result.failure, result.message)
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
          deps.onFailure('refused', 'The speech audio could not be played')
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

/** Plays through one shared AudioContext, created on first use. */
export const spokenReplyAudio: SpokenReplyAudio = {
  play: async (sound, onEnded) => {
    context ??= new AudioContext()
    await context.resume()
    // decodeAudioData takes the buffer over, so it gets its own copy.
    const buffer = await context.decodeAudioData(sound.slice().buffer)
    const source = context.createBufferSource()
    source.buffer = buffer
    source.connect(context.destination)
    source.onended = onEnded
    source.start()
    return {
      stop: () => {
        source.onended = null
        source.stop()
        onEnded()
      }
    }
  }
}
