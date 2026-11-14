import { useEffect, useEffectEvent, useRef, useState, type RefObject } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { dispatchDictationControl } from '@/components/dictation/dictation-control-events'
import { useDictationSpeaking } from '@/components/dictation/dictation-meter-store'
import { dictationLandsInComposerOf } from '@/components/dictation/use-dictation-queued-send'
import { useVoiceCallPresence } from '../voice-call-presence'
import { HANDS_FREE_NO_SPEECH_MS, HandsFreeTurns } from './hands-free-turns'
import { setOverhearing } from './spoken-reply-mode'
import { spokenReplyPlaysThroughApp } from './spoken-reply-system-voice'
import type { NativeChatSpokenReplies } from './use-native-chat-spoken-replies'

export type NativeChatHandsFreeComposer = {
  dictationUnavailable: boolean
  agentWorking: boolean
  /** The composer would take a send now. */
  canSend: boolean
  /** The draft holds text or images. */
  hasDraft: boolean
  /** Focuses the composer and starts dictating into it. */
  onOpenMicrophone: () => void
  /** Sends the draft, waiting for the last dictated words to land. */
  onSend: () => void
}

/** Runs hands-free turns while the chat listens for the person. The turn moves when a fact it
 *  reads changes; between changes, one timer waits for the next moment it can move by itself,
 *  and none runs while it rests. */
export function useHandsFreeTurns(
  spoken: NativeChatSpokenReplies,
  composer: NativeChatHandsFreeComposer,
  /** A node inside this chat's composer, by which a dictation is known to land in it. */
  inComposer: RefObject<HTMLElement | null>
): void {
  const dictation = useAppStore((store) => store.dictationState)
  const userSpeaking = useDictationSpeaking()
  // A Voice mode call in any chat already holds the microphone.
  const inCall = useVoiceCallPresence((state) => state.calls > 0)
  const interrupts = useAppStore((store) => store.settings?.voice?.spokenReplyInterrupt === true)
  const voiceSpeaking = spoken.line !== null
  const canSend = composer.canSend && !composer.dictationUnavailable && !inCall
  const turns = useRef<HandsFreeTurns | null>(null)
  // Moved by the timer alone, to look again at the turn's next deadline.
  const [woken, setWoken] = useState(0)

  const look = useEffectEvent((): number | null => {
    const action = turns.current?.next({
      dictation,
      ownsDictation: dictationLandsInComposerOf(inComposer.current),
      userSpeaking,
      agentWorking: composer.agentWorking,
      voiceSpeaking,
      voiceCancelsEcho: interrupts && spokenReplyPlaysThroughApp(),
      canSend,
      hasDraft: composer.hasDraft,
      now: Date.now()
    })
    if (!voiceSpeaking) {
      setOverhearing(spoken.sessionId, false)
    }
    if (action === 'open-microphone') {
      composer.onOpenMicrophone()
    } else if (action === 'overhear') {
      // Marked first: an open microphone quiets a reply unless it is this chat's own.
      setOverhearing(spoken.sessionId, true)
      composer.onOpenMicrophone()
    } else if (action === 'interrupt-voice') {
      setOverhearing(spoken.sessionId, false)
      spoken.silence()
    } else if (action === 'stop-overhearing') {
      dispatchDictationControl('cancel')
      setOverhearing(spoken.sessionId, false)
    } else if (action === 'send') {
      composer.onSend()
    } else if (action === 'close-unused') {
      dispatchDictationControl('cancel')
      spoken.setHandsFree(false)
      toast.message(
        translate(
          'components.native-chat.spokenReplies.handsFreeUnused',
          'Stopped listening after {{seconds}} seconds without speech',
          { seconds: HANDS_FREE_NO_SPEECH_MS / 1000 }
        )
      )
    } else if (action === 'close-unheard') {
      spoken.setHandsFree(false)
      toast.message(
        translate(
          'components.native-chat.spokenReplies.handsFreeUnheard',
          'Stopped listening: the microphone picked up sound but no words, twice'
        )
      )
    } else if (action === 'give-up') {
      spoken.setHandsFree(false)
      toast.message(
        translate(
          'components.native-chat.spokenReplies.handsFreeFailed',
          'Stopped listening: dictation could not start'
        )
      )
    }
    return turns.current?.deadline() ?? null
  })

  const armed = spoken.handsFree
  const { sessionId } = spoken
  useEffect(() => {
    if (!armed) {
      return
    }
    turns.current = new HandsFreeTurns()
    return () => {
      turns.current = null
      setOverhearing(sessionId, false)
    }
  }, [armed, sessionId])

  useEffect(() => {
    if (!armed) {
      return
    }
    const deadline = look()
    if (deadline === null) {
      return
    }
    const timer = setTimeout(() => setWoken((count) => count + 1), deadline - Date.now())
    return () => clearTimeout(timer)
  }, [
    armed,
    dictation,
    userSpeaking,
    composer.agentWorking,
    composer.hasDraft,
    voiceSpeaking,
    canSend,
    woken
  ])
}
