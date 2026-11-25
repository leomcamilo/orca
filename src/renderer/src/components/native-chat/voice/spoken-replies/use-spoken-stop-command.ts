import { useEffect, useEffectEvent } from 'react'
import { claimDictatedText } from '@/components/dictation/dictation-text-claims'
import { isSpokenStopCommand } from './spoken-stop-command'

/** While `listening`, takes "para" said alone out of the dictation, so it never lands in the
 *  draft, and calls `onStop` instead. */
export function useSpokenStopCommand(listening: boolean, onStop: () => void): void {
  const stop = useEffectEvent(onStop)
  useEffect(() => {
    if (!listening) {
      return
    }
    return claimDictatedText((text) => {
      if (!isSpokenStopCommand(text)) {
        return false
      }
      stop()
      return true
    })
  }, [listening])
}
