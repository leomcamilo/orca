import { useEffect, useEffectEvent } from 'react'
import { onDictationMicrophoneLevel } from '@/components/dictation/dictation-microphone-level'
import {
  holdSpokenReplyAudio,
  spokenReplyAudioSounding,
  spokenReplyOutputLevel
} from './spoken-reply-api-voice'
import { SpokenReplyBargeIn } from './spoken-reply-barge-in'

/** While `listening`, weighs each microphone window against the reply playing on this page: holds
 *  the reply when the microphone hears more than it explains, plays it on when that was its echo,
 *  and calls `onHeard` when the person kept talking with it held. A system voice plays outside the
 *  page, where nothing can be weighed, and is left alone. */
export function useSpokenReplyBargeIn(listening: boolean, onHeard: () => void): void {
  const heard = useEffectEvent(onHeard)
  useEffect(() => {
    if (!listening) {
      return
    }
    const detector = new SpokenReplyBargeIn()
    let held = false
    const hold = (next: boolean): void => {
      held = next
      holdSpokenReplyAudio(next)
    }
    const stopListening = onDictationMicrophoneLevel((microphone, now) => {
      if (!held && !spokenReplyAudioSounding()) {
        return
      }
      const decision = detector.hear({
        now,
        microphone,
        output: held ? 0 : spokenReplyOutputLevel()
      })
      if (decision === 'pause' || decision === 'resume') {
        hold(decision === 'pause')
      } else if (decision === 'stop') {
        stopListening()
        heard()
      }
    })
    return () => {
      stopListening()
      // Quieted or ended, the reply leaves nothing held for the next one.
      if (held) {
        holdSpokenReplyAudio(false)
      }
    }
  }, [listening])
}
