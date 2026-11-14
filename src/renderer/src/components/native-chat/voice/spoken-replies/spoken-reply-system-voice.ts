import { create } from 'zustand'
import { appVoiceAudio, createAppVoiceSynthesizer } from './spoken-reply-app-voice'
import {
  SpokenReplySpeech,
  type SpokenReplyLine,
  type SpokenReplySynthesizer,
  type SpokenReplyVoice
} from './spoken-reply-speech'

/** The line being spoken, for the strip of the chat that owns it, and whether it is playing
 *  through the app's own audio: sound the microphone capture cancels as echo, which the system
 *  speaking directly is not. */
export const useSpokenReplyLine = create<{ line: SpokenReplyLine | null; throughApp: boolean }>(
  () => ({ line: null, throughApp: false })
)

function systemSynthesis(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null
}

/** The operating system's voices; empty where it has none (a Linux desktop without a speech
 *  service) and until the system lists them. */
export function systemSpokenReplyVoices(): SpokenReplyVoice[] {
  return (systemSynthesis()?.getVoices() ?? []).map((voice) => ({
    voiceURI: voice.voiceURI,
    name: voice.name,
    lang: voice.lang,
    localService: voice.localService,
    default: voice.default
  }))
}

export function subscribeSystemSpokenReplyVoices(listener: () => void): () => void {
  const synthesis = systemSynthesis()
  synthesis?.addEventListener('voiceschanged', listener)
  return () => synthesis?.removeEventListener('voiceschanged', listener)
}

function systemSynthesizer(synthesis: SpeechSynthesis): SpokenReplySynthesizer {
  // Chromium can drop an utterance's events once nothing else references it.
  const speaking = new Set<SpeechSynthesisUtterance>()
  return {
    speak: (text, pick, onDone) => {
      const utterance = new SpeechSynthesisUtterance(text)
      const systemVoice = synthesis
        .getVoices()
        .find((candidate) => candidate.voiceURI === pick.voice?.voiceURI)
      if (systemVoice) {
        utterance.voice = systemVoice
        utterance.lang = systemVoice.lang
      } else if (pick.language) {
        utterance.lang = pick.language
      }
      const done = (): void => {
        if (speaking.delete(utterance)) {
          onDone()
        }
      }
      utterance.onend = done
      utterance.onerror = done
      speaking.add(utterance)
      synthesis.speak(utterance)
    },
    cancel: () => synthesis.cancel()
  }
}

// Chromium can drop a line spoken in the same task as a cancel.
const AFTER_CANCEL_MS = 80
// The system lists its voices a moment after the first ask; a reply waits that long, no longer.
const VOICES_WAIT_MS = 1500

/** Runs `speak` once the system has listed its voices, so the first reply is not spoken in the
 *  system's default voice and language. Runs at once when they are listed already. */
function whenSystemVoicesListed(synthesis: SpeechSynthesis, speak: () => void): void {
  if (synthesis.getVoices().length > 0) {
    speak()
    return
  }
  let waiting = true
  const run = (): void => {
    if (waiting) {
      waiting = false
      synthesis.removeEventListener('voiceschanged', run)
      speak()
    }
  }
  synthesis.addEventListener('voiceschanged', run)
  setTimeout(run, VOICES_WAIT_MS)
}

function appVoice(synthesis: SpeechSynthesis): SpokenReplySynthesizer {
  return createAppVoiceSynthesizer({
    // Absent in the web client and on a host that predates it: the system speaks directly.
    render: async (request) => (await window.api.speech.renderSystemVoice?.(request)) ?? null,
    audio: appVoiceAudio,
    system: systemSynthesizer(synthesis),
    onPlaying: (throughApp) => useSpokenReplyLine.setState({ throughApp })
  })
}

let speech: SpokenReplySpeech | null | undefined

/** Null where the platform has no speech synthesis. */
export function systemSpokenReplySpeech(): SpokenReplySpeech | null {
  if (speech === undefined) {
    const synthesis = systemSynthesis()
    // The first ask starts the system listing its voices.
    synthesis?.getVoices()
    speech = synthesis
      ? new SpokenReplySpeech(
          appVoice(synthesis),
          (line) => useSpokenReplyLine.setState({ line }),
          {
            afterCancel: (next) => setTimeout(next, AFTER_CANCEL_MS),
            whenReady: (speak) => whenSystemVoicesListed(synthesis, speak)
          }
        )
      : null
  }
  return speech
}
