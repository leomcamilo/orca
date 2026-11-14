import { useEffect, useId, useState } from 'react'
import type { VoiceSettings } from '../../../../../shared/speech-types'
import {
  DEFAULT_ELEVENLABS_SPEECH_MODEL,
  DEFAULT_SPOKEN_REPLY_MONTHLY_CHARACTER_LIMIT,
  ELEVENLABS_SPEECH_MODELS,
  OPENAI_SPEECH_USD_PER_THOUSAND_CHARACTERS_ESTIMATE,
  type SpeechSynthesisUsage
} from '../../../../../shared/speech-synthesis'
import { useTranslate } from '@/i18n/use-translate'
import { getIntlLocale } from '@/i18n/i18n'
import { Input } from '../../ui/input'
import { SettingsRow } from '../form-controls/SettingsFormControls'

const MAX_LIMIT = 10_000_000

function estimatedUsd(usage: SpeechSynthesisUsage, elevenLabsModel: string | undefined): number {
  const elevenLabsRate =
    ELEVENLABS_SPEECH_MODELS.find((model) => model.id === elevenLabsModel)
      ?.usdPerThousandCharacters ??
    ELEVENLABS_SPEECH_MODELS.find((model) => model.id === DEFAULT_ELEVENLABS_SPEECH_MODEL)
      ?.usdPerThousandCharacters ??
    0
  return (
    ((usage.characters.openai ?? 0) * OPENAI_SPEECH_USD_PER_THOUSAND_CHARACTERS_ESTIMATE +
      (usage.characters.elevenlabs ?? 0) * elevenLabsRate) /
    1000
  )
}

/** What the paid voices read this month, about what it cost, and the limit that stops them. */
export function VoiceSpokenReplyUsageSettings({
  voiceSettings,
  disabled,
  onUpdateVoiceSettings
}: {
  voiceSettings: VoiceSettings
  disabled: boolean
  onUpdateVoiceSettings: (updates: Partial<VoiceSettings>) => void
}): React.JSX.Element {
  const t = useTranslate()
  const limitId = useId()
  const [usage, setUsage] = useState<SpeechSynthesisUsage | null>(null)
  const saved = voiceSettings.spokenReplyMonthlyCharacterLimit
  const limit = saved === undefined ? DEFAULT_SPOKEN_REPLY_MONTHLY_CHARACTER_LIMIT : saved
  const [draft, setDraft] = useState(limit === null ? '' : String(limit))

  useEffect(() => {
    let current = true
    void window.api.speech.getSpeechSynthesisUsage?.().then((read) => {
      if (current) {
        setUsage(read)
      }
    })
    return () => {
      current = false
    }
  }, [voiceSettings.spokenReplyProvider])

  const used = (usage?.characters.openai ?? 0) + (usage?.characters.elevenlabs ?? 0)
  const usd = usage ? estimatedUsd(usage, voiceSettings.spokenReplyElevenLabsModel) : 0
  const commit = (): void => {
    const value = draft.trim() === '' ? null : Number(draft.replace(/\D/g, ''))
    if (value === null || (Number.isSafeInteger(value) && value <= MAX_LIMIT)) {
      onUpdateVoiceSettings({ spokenReplyMonthlyCharacterLimit: value })
    } else {
      setDraft(limit === null ? '' : String(limit))
    }
  }
  return (
    <SettingsRow
      className="flex-col items-stretch @lg:flex-row @lg:items-center"
      label={t(
        'components.settings.voice.spokenReplies.limitLabel',
        'Monthly limit for paid voices'
      )}
      labelId={limitId}
      description={t(
        'components.settings.voice.spokenReplies.usageDescription',
        'Read this month on this computer: {{used}} characters, about US$ {{usd}}. At the limit replies stop being read, with a notice, before anything is sent. Empty means no limit.',
        {
          used: used.toLocaleString(getIntlLocale()),
          usd: usd.toLocaleString(getIntlLocale(), {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          })
        }
      )}
      control={
        <div className="flex items-center gap-2">
          <Input
            aria-labelledby={limitId}
            inputMode="numeric"
            className="h-8 w-28"
            value={draft}
            disabled={disabled}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                commit()
              }
            }}
          />
          <span className="text-xs text-muted-foreground">
            {t('components.settings.voice.spokenReplies.limitUnit', 'characters')}
          </span>
        </div>
      }
    />
  )
}
