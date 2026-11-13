import { Volume2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'
import type { NativeChatSpokenReplies } from './use-native-chat-spoken-replies'

/** Turns reading this chat's replies aloud on or off. */
export function NativeChatSpokenReplyButton({
  spoken
}: {
  spoken: NativeChatSpokenReplies
}): React.JSX.Element {
  const t = useTranslate()
  const label = spoken.on
    ? t('components.native-chat.spokenReplies.stop', 'Stop reading replies aloud')
    : t('components.native-chat.spokenReplies.start', 'Read replies aloud')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={spoken.on ? 'secondary' : 'ghost'}
          size="icon-sm"
          aria-label={label}
          aria-pressed={spoken.on}
          onMouseDown={(event) => event.preventDefault()}
          onClick={spoken.toggle}
          className="pointer-coarse:size-11"
        >
          <Volume2 className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {spoken.on
          ? label
          : t(
              'components.native-chat.spokenReplies.startHint',
              'Read replies aloud with your system voice. Each message you send also asks {{agent}} to open its reply with a short part meant for listening.',
              { agent: spoken.agentLabel }
            )}
      </TooltipContent>
    </Tooltip>
  )
}
