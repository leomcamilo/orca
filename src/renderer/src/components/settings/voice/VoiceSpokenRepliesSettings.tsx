import { useId, useSyncExternalStore } from 'react'
import { Volume2 } from 'lucide-react'
import { Button } from '../../ui/button'
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
import { spokenReplyVoiceFor } from '@/components/native-chat/voice/spoken-replies/use-native-chat-spoken-replies'
import type { SpokenReplyVoice } from '@/components/native-chat/voice/spoken-replies/spoken-reply-speech'

// Radix Select cannot hold an empty value, and a voice URI is never this word.
const AUTOMATIC_VALUE = 'automatic'
const SAMPLE_OWNER = 'settings:spoken-reply-sample'

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

/** Reading replies aloud with the system voice, in chats other than Codex's. */
export function VoiceSpokenRepliesSettings({
  voiceSettings,
  onUpdateVoiceSettings
}: {
  voiceSettings: VoiceSettings
  onUpdateVoiceSettings: (updates: Partial<VoiceSettings>) => void
}): React.JSX.Element {
  const t = useTranslate()
  const labelId = useId()
  const voices = useSyncExternalStore(subscribeSystemSpokenReplyVoices, voicesSnapshot)
  const on = voiceSettings.spokenReplies === true
  const chosen = voices.some((voice) => voice.voiceURI === voiceSettings.spokenReplyVoice)
    ? voiceSettings.spokenReplyVoice
    : undefined
  const sampleLabel = t('components.settings.voice.spokenReplies.sample', 'Play a sample')
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
                'Adds a speaker button to the chat. While it is on, each message you send also asks the agent to open its reply with a short part meant for listening, and your system voice reads that part. Code, tables and links stay on screen. A second button makes the chat listen for your turn with dictation.'
              )
        }
        checked={on}
        disabled={unavailable && !on}
        onChange={() => onUpdateVoiceSettings({ spokenReplies: !on })}
      />
      <SettingsSwitchRow
        label={t('components.settings.voice.spokenReplies.interruptLabel', 'Interrupt by talking')}
        description={t(
          'components.settings.voice.spokenReplies.interruptDescription',
          'While a chat listens for your turn, keeps the microphone open as a reply is read and quiets the reply when you talk over it. The agent keeps working. On macOS only. Use headphones if the voice interrupts itself.'
        )}
        checked={voiceSettings.spokenReplyInterrupt === true}
        disabled={!on}
        onChange={() =>
          onUpdateVoiceSettings({
            spokenReplyInterrupt: voiceSettings.spokenReplyInterrupt !== true
          })
        }
      />
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
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={sampleLabel}
              title={sampleLabel}
              disabled={unavailable}
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
    </SettingsGroup>
  )
}
