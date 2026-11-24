import { useRef } from 'react'
import { Ear } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'
import { HANDS_FREE_NO_SPEECH_MS } from './hands-free-turns'
import { useHandsFreeTurns, type NativeChatHandsFreeComposer } from './use-hands-free-turns'
import type { NativeChatSpokenReplies } from './use-native-chat-spoken-replies'

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
