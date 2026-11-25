type MicrophoneLevelListener = (rms: number, now: number) => void

const listeners = new Set<MicrophoneLevelListener>()

/** Each 50 ms window's loudness at the microphone, after the browser's echo cancellation, on the
 *  performance.now() clock. */
export function publishDictationMicrophoneLevel(rms: number, now: number): void {
  for (const listener of listeners) {
    listener(rms, now)
  }
}

export function onDictationMicrophoneLevel(listener: MicrophoneLevelListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
