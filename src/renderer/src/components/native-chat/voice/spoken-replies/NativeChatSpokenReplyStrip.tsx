import { Ear, Square } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'
import { NativeChatComposerTabStrip } from '../../composer/controls/NativeChatComposerTabStrip'
import { NativeChatVoiceBars } from '../NativeChatVoiceBars'
import { useNativeChatSpokenRepliesControl } from './use-native-chat-spoken-replies'

/** Shows the sentence being spoken, with the one control that quiets it. */
export function NativeChatSpokenReplyStrip(props: {
  line: string
  agentLabel: string
  onSilence: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const silenceLabel = t('components.native-chat.spokenReplies.silence', 'Stop speaking')
  return (
    <NativeChatComposerTabStrip data-native-chat-spoken-reply="speaking">
      <NativeChatVoiceBars moving className="mt-0.5 size-3.5" />
      <div className="min-w-0 flex-1 py-0.5">
        <span role="status" className="font-medium">
          {t('components.native-chat.spokenReplies.speaking', 'Reading the reply aloud')}
        </span>
        <span className="block truncate text-2xs" title={props.line}>
          {props.line}
        </span>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-label={silenceLabel}
            onClick={props.onSilence}
          >
            <Square className="size-2.5 fill-current" />
            {t('components.native-chat.spokenReplies.silenceShort', 'Quiet')}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          {t(
            'components.native-chat.spokenReplies.silenceHint',
            'Stops the voice. {{agent}} keeps working.',
            { agent: props.agentLabel }
          )}
        </TooltipContent>
      </Tooltip>
    </NativeChatComposerTabStrip>
  )
}

/** Says, for as long as the chat listens for the person's turn, that what the microphone hears
 *  is sent on its own, with the control that ends it. */
export function NativeChatHandsFreeStrip(props: {
  agentLabel: string
  onStop: () => void
}): React.JSX.Element {
  const t = useTranslate()
  return (
    <NativeChatComposerTabStrip data-native-chat-spoken-reply="hands-free">
      <Ear className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 py-0.5">
        <span role="status" className="font-medium">
          {t('components.native-chat.spokenReplies.handsFreeOn', 'Listening for your turn')}
        </span>
        <span className="block truncate text-2xs">
          {t(
            'components.native-chat.spokenReplies.handsFreeDisclosure',
            'What the microphone hears is sent to {{agent}} after each pause.',
            { agent: props.agentLabel }
          )}
        </span>
      </div>
      <Button type="button" variant="ghost" size="xs" onClick={props.onStop}>
        <Square className="size-2.5 fill-current" />
        {t('components.native-chat.spokenReplies.handsFreeStopShort', 'Stop listening')}
      </Button>
    </NativeChatComposerTabStrip>
  )
}

/** Stays mounted while a prompt card replaces the composer, so the voice can always be quieted
 *  and the listening always ended. */
export function NativeChatSpokenReplyStripSlot(): React.JSX.Element | null {
  const spoken = useNativeChatSpokenRepliesControl()
  if (!spoken) {
    return null
  }
  if (spoken.line) {
    return (
      <NativeChatSpokenReplyStrip
        line={spoken.line}
        agentLabel={spoken.agentLabel}
        onSilence={spoken.silence}
      />
    )
  }
  return spoken.handsFree ? (
    <NativeChatHandsFreeStrip
      agentLabel={spoken.agentLabel}
      onStop={() => spoken.setHandsFree(false)}
    />
  ) : null
}
