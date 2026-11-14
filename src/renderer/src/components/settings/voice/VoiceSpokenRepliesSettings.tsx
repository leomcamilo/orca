import { useId, useSyncExternalStore } from 'react'
import type { VoiceSettings } from '../../../../../shared/speech-types'
import { useTranslate } from '@/i18n/use-translate'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select'
import { SettingsRow, SettingsSwitchRow } from '../form-controls/SettingsFormControls'
import { SettingsGroup } from '../section-layout/SettingsGroup'
import {
  subscribeSystemSpokenReplyVoices,
  systemSpokenReplySpeech,
  systemSpokenReplyVoices
} from '@/components/native-chat/voice/spoken-replies/spoken-reply-system-voice'
import {
  SpokenReplySampleButton,
  VoiceSpokenReplyProviderSettings
} from './VoiceSpokenReplyProviderSettings'
import type { SpokenReplyVoice } from '@/components/native-chat/voice/spoken-replies/spoken-reply-speech'

// Radix Select cannot hold an empty value, and a voice URI is never this word.
const AUTOMATIC_VALUE = 'automatic'

let listedVoices: SpokenReplyVoice[] = []
let listedKey = ''

// A stable array between changes, as useSyncExternalStore requires of a snapshot.
function voicesSnapshot(): SpokenReplyVoice[] {
  const voices = systemSpokenReplyVoices().filter((voice) => voice.localService)
  const key = voices.map((voice) => voice.voiceURI).join('\n')
  if (key !== listedKey) {
    listedKey = key
    listedVoices = voices
  }
  return listedVoices
}

/** Reading replies aloud, with the system voice or OpenAI, in chats other than Codex's. */
export function VoiceSpokenRepliesSettings({
  voiceSettings,
  onAddOpenAiKey,
  onUpdateVoiceSettings
}: {
  voiceSettings: VoiceSettings
  /** Opens the dialog that saves the OpenAI key dictation uses too. */
  onAddOpenAiKey: () => void
  onUpdateVoiceSettings: (updates: Partial<VoiceSettings>) => void
}): React.JSX.Element {
  const t = useTranslate()
  const labelId = useId()
  const voices = useSyncExternalStore(subscribeSystemSpokenReplyVoices, voicesSnapshot)
  const on = voiceSettings.spokenReplies === true
  const chosen = voices.some((voice) => voice.voiceURI === voiceSettings.spokenReplyVoice)
    ? voiceSettings.spokenReplyVoice
    : undefined
  const usesOpenAi = voiceSettings.spokenReplyProvider === 'openai'
  const unavailable = systemSpokenReplySpeech() === null || voices.length === 0

  return (
    <SettingsGroup
      bodyClassName="@container"
      title={t('components.settings.voice.spokenReplies.title', 'Spoken replies (experimental)')}
      description={t(
        'components.settings.voice.spokenReplies.description',
        'Hear the opening of each reply in Claude, OpenCode and other chats. Separate from dictation and from Codex Voice mode.'
      )}
    >
      <SettingsSwitchRow
        label={t('components.settings.voice.spokenReplies.enableLabel', 'Offer spoken replies')}
        description={
          unavailable
            ? t(
                'components.settings.voice.spokenReplies.unavailable',
                'This system has no speech voice installed.'
              )
            : t(
                'components.settings.voice.spokenReplies.enableDescription',
                'Adds a speaker button to the chat. While it is on, each message you send also asks the agent to open its reply with a short part meant for listening, and the voice chosen below reads that part. Code, tables and links stay on screen. A second button makes the chat listen for your turn with dictation.'
              )
        }
        checked={on}
        disabled={unavailable && !on}
        onChange={() => onUpdateVoiceSettings({ spokenReplies: !on })}
      />
      <VoiceSpokenReplyProviderSettings
        voiceSettings={voiceSettings}
        disabled={unavailable}
        onAddOpenAiKey={onAddOpenAiKey}
        onUpdateVoiceSettings={onUpdateVoiceSettings}
      />
      {usesOpenAi ? null : (
        <SettingsRow
          className="flex-col items-stretch @lg:flex-row @lg:items-center"
          label={t('components.settings.voice.spokenReplies.voiceLabel', 'Voice')}
          labelId={labelId}
          description={t(
            'components.settings.voice.spokenReplies.voiceDescription',
            'A voice installed on this computer. Automatic follows your dictation or app language.'
          )}
          control={
            <div className="flex items-center gap-1">
              <SpokenReplySampleButton voiceSettings={voiceSettings} disabled={unavailable} />
              <Select
                value={chosen ?? AUTOMATIC_VALUE}
                disabled={unavailable}
                onValueChange={(value) =>
                  onUpdateVoiceSettings({
                    spokenReplyVoice: value === AUTOMATIC_VALUE ? undefined : value
                  })
                }
              >
                <SelectTrigger size="sm" className="min-w-40" aria-labelledby={labelId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTOMATIC_VALUE}>
                    {t('components.settings.voice.spokenReplies.automaticVoice', 'Automatic')}
                  </SelectItem>
                  {voices.map((voice) => (
                    <SelectItem key={voice.voiceURI} value={voice.voiceURI}>
                      {`${voice.name} · ${voice.lang}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
        />
      )}
    </SettingsGroup>
  )
}
