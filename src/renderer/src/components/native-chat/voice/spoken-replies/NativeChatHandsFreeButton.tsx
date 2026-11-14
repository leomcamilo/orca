import { useEffect, useEffectEvent, useRef, type RefObject } from 'react'
import { Ear } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { dispatchDictationControl } from '@/components/dictation/dictation-control-events'
import { useDictationMeter } from '@/components/dictation/dictation-meter-store'
import { dictationLandsInComposerOf } from '@/components/dictation/use-dictation-queued-send'
import { useVoiceCallPresence } from '../voice-call-presence'
import { HANDS_FREE_NO_SPEECH_MS, HandsFreeTurns } from './hands-free-turns'
import { setOverhearing } from './spoken-reply-mode'
import { spokenReplyPlaysThroughApp } from './spoken-reply-system-voice'
import type { NativeChatSpokenReplies } from './use-native-chat-spoken-replies'

const TURN_CHECK_MS = 200

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

function useHandsFreeTurns(
  spoken: NativeChatSpokenReplies,
  composer: NativeChatHandsFreeComposer,
  /** A node inside this chat's composer, by which a dictation is known to land in it. */
  inComposer: RefObject<HTMLElement | null>
): void {
  const dictation = useAppStore((store) => store.dictationState)
  const meter = useDictationMeter()
  // A Voice mode call in any chat already holds the microphone.
  const inCall = useVoiceCallPresence((state) => state.calls > 0)
  const interrupts = useAppStore((store) => store.settings?.voice?.spokenReplyInterrupt === true)
  const turns = useRef<HandsFreeTurns | null>(null)
  // Dictated words can land and be sent between two checks; this keeps them from being missed.
  const draftSeen = useRef(false)
  useEffect(() => {
    draftSeen.current ||= composer.hasDraft
  }, [composer.hasDraft])
  const check = useEffectEvent(() => {
    const hasDraft = composer.hasDraft || draftSeen.current
    draftSeen.current = false
    const action = turns.current?.next({
      dictation,
      ownsDictation: dictationLandsInComposerOf(inComposer.current),
      userSpeaking: meter.isSpeaking,
      agentWorking: composer.agentWorking,
      voiceSpeaking: spoken.line !== null,
      voiceCancelsEcho: interrupts && spokenReplyPlaysThroughApp(),
      canSend: composer.canSend && !composer.dictationUnavailable && !inCall,
      hasDraft,
      now: performance.now()
    })
    if (spoken.line === null) {
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
  })
  const armed = spoken.handsFree
  const { sessionId } = spoken
  useEffect(() => {
    if (!armed) {
      return
    }
    turns.current = new HandsFreeTurns()
    const timer = setInterval(check, TURN_CHECK_MS)
    return () => {
      clearInterval(timer)
      setOverhearing(sessionId, false)
      turns.current = null
    }
  }, [armed, sessionId])
}

/** Turns hands-free turns on or off for this chat, and runs them while they are on. */
export function NativeChatHandsFreeButton({
  spoken,
  composer
}: {
  spoken: NativeChatSpokenReplies
  composer: NativeChatHandsFreeComposer
}): React.JSX.Element {
  const t = useTranslate()
  const inComposer = useRef<HTMLSpanElement>(null)
  useHandsFreeTurns(spoken, composer, inComposer)
  const label = spoken.handsFree
    ? t('components.native-chat.spokenReplies.handsFreeStop', 'Stop listening for your turn')
    : t('components.native-chat.spokenReplies.handsFreeStart', 'Listen for your turn')
  const blocked = !spoken.handsFree && composer.dictationUnavailable
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button gets no pointer events, so the wrapper carries the hover. */}
        <span ref={inComposer} className="inline-flex">
          <Button
            type="button"
            variant={spoken.handsFree ? 'secondary' : 'ghost'}
            size="icon-sm"
            aria-label={label}
            aria-pressed={spoken.handsFree}
            disabled={blocked}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => spoken.setHandsFree(!spoken.handsFree)}
            className="pointer-coarse:size-11"
          >
            <Ear className="size-4" />
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {blocked
          ? t(
              'components.native-chat.spokenReplies.handsFreeNeedsDictation',
              'Turn on dictation in Settings to listen for your turn'
            )
          : spoken.handsFree
            ? label
            : t(
                'components.native-chat.spokenReplies.handsFreeHint',
                'Talk in turns without touching the keyboard. The microphone opens when {{agent}} has finished, and whatever it hears is sent to {{agent}} after a short pause, without asking. The reply is read aloud. It stops after {{seconds}} seconds without speech.',
                { agent: spoken.agentLabel, seconds: HANDS_FREE_NO_SPEECH_MS / 1000 }
              )}
      </TooltipContent>
    </Tooltip>
  )
}
