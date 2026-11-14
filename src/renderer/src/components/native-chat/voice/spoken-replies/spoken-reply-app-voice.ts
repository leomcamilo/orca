import type { SystemVoiceRenderRequest } from '../../../../../../shared/system-voice-render'
import type { SpokenReplySynthesizer, SpokenReplyVoicePick } from './spoken-reply-speech'

/** The slice of Web Audio the player drives. */
export type AppVoiceAudio = {
  /** Decodes and plays one sound; `onEnded` fires when it finishes or is stopped. */
  play: (wav: Uint8Array, onEnded: () => void) => Promise<{ stop: () => void }>
}

/** Speaks through the app's own audio output where the host can render the system voice to
 *  sound (macOS), and has the system speak directly everywhere else or whenever that fails. */
export function createAppVoiceSynthesizer(deps: {
  render: (request: SystemVoiceRenderRequest) => Promise<Uint8Array | null>
  audio: AppVoiceAudio
  system: SpokenReplySynthesizer
  /** Told when a line starts and stops playing through the app's own audio, which the microphone
   *  capture cancels as echo. Never told so while the system speaks directly. */
  onPlaying?: (playing: boolean) => void
}): SpokenReplySynthesizer {
  // Each speak and each cancel moves this on, so a render that answers late knows it is stale.
  let generation = 0
  let playing: { stop: () => void } | null = null
  const setPlaying = (sound: { stop: () => void } | null): void => {
    if ((playing === null) !== (sound === null)) {
      deps.onPlaying?.(sound !== null)
    }
    playing = sound
  }
  let finish: (() => void) | null = null
  // Renders asked for ahead of their line, so one sentence follows another without a gap.
  const rendering = new Map<string, Promise<Uint8Array | null>>()
  const render = (text: string, pick: SpokenReplyVoicePick): Promise<Uint8Array | null> => {
    // The host renders in a named voice only; without one, the system speaks directly, where the
    // language still tells it which voice to use.
    if (!pick.voice) {
      return Promise.resolve(null)
    }
    const key = `${pick.voice?.voiceURI ?? ''}\n${text}`
    const asked = rendering.get(key)
    if (asked) {
      rendering.delete(key)
      return asked
    }
    return deps.render({ text, ...(pick.voice ? { voice: pick.voice.voiceURI } : {}) })
  }

  const speak = (text: string, pick: SpokenReplyVoicePick, onDone: () => void): void => {
    generation += 1
    const mine = generation
    let done = false
    const end = (): void => {
      if (!done) {
        done = true
        if (generation === mine) {
          setPlaying(null)
          finish = null
        }
        onDone()
      }
    }
    finish = end
    const bySystem = (): void => {
      if (generation === mine && !done) {
        deps.system.speak(text, pick, end)
      }
    }
    render(text, pick)
      .then(async (wav) => {
        if (generation !== mine || done) {
          return
        }
        if (!wav) {
          bySystem()
          return
        }
        const sound = await deps.audio.play(wav, end)
        if (generation === mine && !done) {
          setPlaying(sound)
        } else {
          sound.stop()
        }
      })
      .catch(bySystem)
  }

  return {
    speak,
    prepare: (lines, pick) => {
      rendering.clear()
      if (!pick.voice) {
        return
      }
      for (const text of lines) {
        const key = `${pick.voice?.voiceURI ?? ''}\n${text}`
        const asked = deps.render({ text, ...(pick.voice ? { voice: pick.voice.voiceURI } : {}) })
        // A failed render is found out when its line is spoken.
        asked.catch(() => {})
        rendering.set(key, asked)
      }
    },
    cancel: () => {
      rendering.clear()
      generation += 1
      playing?.stop()
      setPlaying(null)
      deps.system.cancel()
      // A line still being rendered has no sound to stop; it ends here.
      finish?.()
      finish = null
    }
  }
}

let context: AudioContext | null = null

/** Plays through one shared AudioContext, created on first use. */
export const appVoiceAudio: AppVoiceAudio = {
  play: async (wav, onEnded) => {
    context ??= new AudioContext()
    await context.resume()
    // decodeAudioData takes the buffer over, so it gets its own copy.
    const buffer = await context.decodeAudioData(wav.slice().buffer)
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
