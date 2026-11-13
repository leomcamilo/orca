import { create } from 'zustand'
import {
  SpokenReplySpeech,
  type SpokenReplyLine,
  type SpokenReplySynthesizer,
  type SpokenReplyVoice
} from './spoken-reply-speech'

/** The line being spoken, for the strip of the chat that owns it. */
export const useSpokenReplyLine = create<{ line: SpokenReplyLine | null }>(() => ({ line: null }))

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
    speak: (text, voice, onDone) => {
      const utterance = new SpeechSynthesisUtterance(text)
      const systemVoice = voice
        ? synthesis.getVoices().find((candidate) => candidate.voiceURI === voice.voiceURI)
        : undefined
      if (systemVoice) {
        utterance.voice = systemVoice
        utterance.lang = systemVoice.lang
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

let speech: SpokenReplySpeech | null | undefined

/** Null where the platform has no speech synthesis. */
export function systemSpokenReplySpeech(): SpokenReplySpeech | null {
  if (speech === undefined) {
    const synthesis = systemSynthesis()
    speech = synthesis
      ? new SpokenReplySpeech(systemSynthesizer(synthesis), (line) =>
          useSpokenReplyLine.setState({ line })
        )
      : null
  }
  return speech
}
