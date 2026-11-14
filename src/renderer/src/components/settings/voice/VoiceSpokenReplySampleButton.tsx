import { Volume2 } from 'lucide-react'
import { Button } from '../../ui/button'
import type { VoiceSettings } from '../../../../../shared/speech-types'
import { useTranslate } from '@/i18n/use-translate'
import { systemSpokenReplySpeech } from '@/components/native-chat/voice/spoken-replies/spoken-reply-system-voice'
import { spokenReplyVoiceFor } from '@/components/native-chat/voice/spoken-replies/use-native-chat-spoken-replies'

const SAMPLE_OWNER = 'settings:spoken-reply-sample'

/** Plays one line as replies will sound with these settings; a speech service bills it too. */
export function SpokenReplySampleButton({
  voiceSettings,
  disabled
}: {
  voiceSettings: VoiceSettings
  disabled: boolean
}): React.JSX.Element {
  const t = useTranslate()
  const label = t('components.settings.voice.spokenReplies.sample', 'Play a sample')
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => {
        const speech = systemSpokenReplySpeech()
        speech?.silence(SAMPLE_OWNER)
        speech?.say(
          SAMPLE_OWNER,
          [
            t(
              'components.settings.voice.spokenReplies.sampleText',
              'This is how replies will sound.'
            )
          ],
          () => spokenReplyVoiceFor(voiceSettings)
        )
      }}
    >
      <Volume2 className="size-3.5" />
    </Button>
  )
}
