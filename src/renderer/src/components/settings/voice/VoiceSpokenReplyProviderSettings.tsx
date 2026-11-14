import { useId } from 'react'
import { Volume2 } from 'lucide-react'
import { Button } from '../../ui/button'
import type { VoiceSettings } from '../../../../../shared/speech-types'
import {
  DEFAULT_OPENAI_SPEECH_VOICE,
  isOpenAiSpeechVoice,
  OPENAI_SPEECH_VOICES,
  type SpokenReplyProvider
} from '../../../../../shared/speech-synthesis'
import { useTranslate } from '@/i18n/use-translate'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select'
import { SettingsRow } from '../form-controls/SettingsFormControls'
import { systemSpokenReplySpeech } from '@/components/native-chat/voice/spoken-replies/spoken-reply-system-voice'
import { spokenReplyVoiceFor } from '@/components/native-chat/voice/spoken-replies/use-native-chat-spoken-replies'

const SAMPLE_OWNER = 'settings:spoken-reply-sample'

/** Plays one line as replies will sound with these settings. */
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

/** Who reads replies: the system voice, or OpenAI with the key saved for dictation. */
export function VoiceSpokenReplyProviderSettings({
  voiceSettings,
  disabled,
  onAddOpenAiKey,
  onUpdateVoiceSettings
}: {
  voiceSettings: VoiceSettings
  disabled: boolean
  onAddOpenAiKey: () => void
  onUpdateVoiceSettings: (updates: Partial<VoiceSettings>) => void
}): React.JSX.Element {
  const t = useTranslate()
  const providerLabelId = useId()
  const voiceLabelId = useId()
  const provider: SpokenReplyProvider =
    voiceSettings.spokenReplyProvider === 'openai' ? 'openai' : 'system'
  const openAiVoice = isOpenAiSpeechVoice(voiceSettings.spokenReplyOpenAiVoice)
    ? voiceSettings.spokenReplyOpenAiVoice
    : DEFAULT_OPENAI_SPEECH_VOICE
  const keyConfigured = voiceSettings.openAiApiKeyConfigured
  return (
    <>
      <SettingsRow
        className="flex-col items-stretch @lg:flex-row @lg:items-center"
        label={t('components.settings.voice.spokenReplies.providerLabel', 'Read by')}
        labelId={providerLabelId}
        description={t(
          'components.settings.voice.spokenReplies.providerDescription',
          'The system voice runs on this computer. OpenAI sends the text it reads to OpenAI.'
        )}
        control={
          <Select
            value={provider}
            disabled={disabled}
            onValueChange={(value) =>
              onUpdateVoiceSettings({
                spokenReplyProvider: value === 'openai' ? 'openai' : undefined
              })
            }
          >
            <SelectTrigger size="sm" className="min-w-40" aria-labelledby={providerLabelId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">
                {t('components.settings.voice.spokenReplies.providerSystem', 'System voice')}
              </SelectItem>
              <SelectItem value="openai">
                {t('components.settings.voice.spokenReplies.providerOpenAi', 'OpenAI (API)')}
              </SelectItem>
            </SelectContent>
          </Select>
        }
      />
      {provider === 'openai' ? (
        <SettingsRow
          className="flex-col items-stretch @lg:flex-row @lg:items-center"
          label={t('components.settings.voice.spokenReplies.openAiVoiceLabel', 'OpenAI voice')}
          labelId={voiceLabelId}
          description={
            keyConfigured ? (
              t(
                'components.settings.voice.spokenReplies.openAiVoiceDescription',
                'Billed to your OpenAI account, about US$ 0.015 per minute of speech by an earlier OpenAI estimate. Model gpt-4o-mini-tts, which OpenAI shuts down on January 6, 2027.'
              )
            ) : (
              <span>
                {t(
                  'components.settings.voice.spokenReplies.openAiNoKey',
                  'No OpenAI API key is saved, so nothing will be read.'
                )}{' '}
                <Button type="button" variant="link" size="inline" onClick={onAddOpenAiKey}>
                  {t('components.settings.voice.spokenReplies.openAiAddKey', 'Add a key')}
                </Button>
              </span>
            )
          }
          control={
            <div className="flex items-center gap-1">
              <SpokenReplySampleButton
                voiceSettings={voiceSettings}
                disabled={disabled || !keyConfigured}
              />
              <Select
                value={openAiVoice}
                disabled={disabled}
                onValueChange={(value) => onUpdateVoiceSettings({ spokenReplyOpenAiVoice: value })}
              >
                <SelectTrigger size="sm" className="min-w-32" aria-labelledby={voiceLabelId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPENAI_SPEECH_VOICES.map((voice) => (
                    <SelectItem key={voice} value={voice}>
                      {`${voice.charAt(0).toUpperCase()}${voice.slice(1)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        />
      ) : null}
    </>
  )
}
