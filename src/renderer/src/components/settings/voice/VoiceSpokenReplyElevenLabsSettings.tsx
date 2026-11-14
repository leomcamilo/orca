import { useCallback, useEffect, useId, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '../../ui/button'
import type { VoiceSettings } from '../../../../../shared/speech-types'
import {
  DEFAULT_ELEVENLABS_SPEECH_MODEL,
  ELEVENLABS_SPEECH_MODELS,
  isElevenLabsSpeechModel,
  type ElevenLabsVoice
} from '../../../../../shared/speech-synthesis'
import { useTranslate } from '@/i18n/use-translate'
import { getIntlLocale } from '@/i18n/i18n'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select'
import { SettingsRow } from '../form-controls/SettingsFormControls'
import { SpokenReplyServiceDialog } from './SpokenReplyServiceDialog'
import { SpokenReplySampleButton } from './VoiceSpokenReplySampleButton'

const MODEL_LABELS: Record<string, string> = {
  eleven_flash_v2_5: 'Flash v2.5',
  eleven_multilingual_v2: 'Multilingual v2'
}

/** ElevenLabs: its key, one of the account's voices, and a model with its price. */
export function VoiceSpokenReplyElevenLabsSettings({
  voiceSettings,
  disabled,
  onUpdateVoiceSettings
}: {
  voiceSettings: VoiceSettings
  disabled: boolean
  onUpdateVoiceSettings: (updates: Partial<VoiceSettings>) => void
}): React.JSX.Element {
  const t = useTranslate()
  const voiceLabelId = useId()
  const modelLabelId = useId()
  const [configured, setConfigured] = useState(false)
  const [voices, setVoices] = useState<ElevenLabsVoice[] | null>(null)
  const [listing, setListing] = useState(false)
  const [listFailure, setListFailure] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const speech = window.api.speech

  const listVoices = useCallback(async () => {
    setListing(true)
    const listed = await speech.listElevenLabsVoices?.()
    setListing(false)
    if (listed?.ok) {
      setVoices(listed.voices)
      setListFailure(null)
    } else {
      setListFailure(listed?.message ?? listed?.failure ?? 'unavailable')
    }
  }, [speech])

  useEffect(() => {
    let current = true
    void speech.getElevenLabsKeyStatus?.().then((status) => {
      if (current) {
        setConfigured(status.configured)
      }
    })
    return () => {
      current = false
    }
  }, [speech])

  useEffect(() => {
    if (configured) {
      void listVoices()
    }
  }, [configured, listVoices])

  const model = isElevenLabsSpeechModel(voiceSettings.spokenReplyElevenLabsModel)
    ? voiceSettings.spokenReplyElevenLabsModel
    : DEFAULT_ELEVENLABS_SPEECH_MODEL
  const chosenVoice = voiceSettings.spokenReplyElevenLabsVoice
  const voiceOptions =
    chosenVoice && !voices?.some((voice) => voice.id === chosenVoice)
      ? [{ id: chosenVoice, name: chosenVoice }, ...(voices ?? [])]
      : (voices ?? [])
  return (
    <>
      <SettingsRow
        label={t('components.settings.voice.spokenReplies.elevenLabsKeyLabel', 'ElevenLabs key')}
        description={
          configured
            ? t(
                'components.settings.voice.spokenReplies.elevenLabsKeySaved',
                'Saved. The text read is sent to ElevenLabs and billed to that account.'
              )
            : t(
                'components.settings.voice.spokenReplies.elevenLabsKeyMissing',
                'No ElevenLabs API key is saved, so nothing will be read.'
              )
        }
        control={
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => setDialogOpen(true)}
          >
            {configured
              ? t('components.settings.voice.spokenReplies.changeKey', 'Change key')
              : t('components.settings.voice.spokenReplies.openAiAddKey', 'Add a key')}
          </Button>
        }
      />
      <SettingsRow
        className="flex-col items-stretch @lg:flex-row @lg:items-center"
        label={t(
          'components.settings.voice.spokenReplies.elevenLabsVoiceLabel',
          'ElevenLabs voice'
        )}
        labelId={voiceLabelId}
        description={
          listFailure
            ? t(
                'components.settings.voice.spokenReplies.elevenLabsVoicesFailed',
                'Could not list the voices: {{reason}}',
                { reason: listFailure }
              )
            : t(
                'components.settings.voice.spokenReplies.elevenLabsVoiceDescription',
                'From your ElevenLabs account. Multilingual voices read Brazilian Portuguese.'
              )
        }
        control={
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t(
                'components.settings.voice.spokenReplies.listVoicesAgain',
                'List voices again'
              )}
              disabled={disabled || !configured || listing}
              onClick={() => void listVoices()}
            >
              <RefreshCw className={`size-3.5 ${listing ? 'motion-safe:animate-spin' : ''}`} />
            </Button>
            <SpokenReplySampleButton
              voiceSettings={voiceSettings}
              disabled={disabled || !configured || !chosenVoice}
            />
            <Select
              value={chosenVoice ?? ''}
              disabled={disabled || voiceOptions.length === 0}
              onValueChange={(value) =>
                onUpdateVoiceSettings({ spokenReplyElevenLabsVoice: value })
              }
            >
              <SelectTrigger size="sm" className="min-w-40" aria-labelledby={voiceLabelId}>
                <SelectValue
                  placeholder={t(
                    'components.settings.voice.spokenReplies.chooseVoice',
                    'Choose a voice'
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {voiceOptions.map((voice) => (
                  <SelectItem key={voice.id} value={voice.id}>
                    {voice.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />
      <SettingsRow
        className="flex-col items-stretch @lg:flex-row @lg:items-center"
        label={t('components.settings.voice.spokenReplies.elevenLabsModelLabel', 'Model')}
        labelId={modelLabelId}
        description={t(
          'components.settings.voice.spokenReplies.elevenLabsModelDescription',
          'List price per 1,000 characters read, from elevenlabs.io in November 2026.'
        )}
        control={
          <Select
            value={model}
            disabled={disabled}
            onValueChange={(value) => onUpdateVoiceSettings({ spokenReplyElevenLabsModel: value })}
          >
            <SelectTrigger size="sm" className="min-w-40" aria-labelledby={modelLabelId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ELEVENLABS_SPEECH_MODELS.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {t(
                    'components.settings.voice.spokenReplies.elevenLabsModelOption',
                    '{{model}} · US$ {{price}}',
                    {
                      model: MODEL_LABELS[option.id],
                      price: option.usdPerThousandCharacters.toLocaleString(getIntlLocale(), {
                        minimumFractionDigits: 2
                      })
                    }
                  )}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />
      <SpokenReplyServiceDialog
        open={dialogOpen}
        title={t('components.settings.voice.spokenReplies.elevenLabsDialogTitle', 'ElevenLabs')}
        description={t(
          'components.settings.voice.spokenReplies.elevenLabsDialogDescription',
          'An API key from your ElevenLabs account. The text of each reply read is sent to ElevenLabs.'
        )}
        fields={[
          {
            id: 'apiKey',
            label: t('components.settings.voice.spokenReplies.apiKeyLabel', 'API key'),
            secret: true
          }
        ]}
        configured={configured}
        onOpenChange={setDialogOpen}
        onSave={async ({ apiKey }) => {
          const status = await speech.saveElevenLabsApiKey?.(apiKey)
          setConfigured(status?.configured === true)
        }}
        onClear={async () => {
          const status = await speech.clearElevenLabsApiKey?.()
          setConfigured(status?.configured === true)
          setVoices(null)
        }}
      />
    </>
  )
}
