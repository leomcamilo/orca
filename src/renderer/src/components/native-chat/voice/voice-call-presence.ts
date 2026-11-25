import { create } from 'zustand'

/** How many Voice mode calls hold a microphone open, in any chat. A voice that reads replies
 *  aloud stays quiet meanwhile: the call would hear it as the person talking. */
export const useVoiceCallPresence = create<{ calls: number }>(() => ({ calls: 0 }))

/** Counts one open call until the returned release runs. */
export function holdVoiceCallPresence(): () => void {
  useVoiceCallPresence.setState((state) => ({ calls: state.calls + 1 }))
  return () => useVoiceCallPresence.setState((state) => ({ calls: state.calls - 1 }))
}
