import { useEffect, useState } from 'react'
import { Button } from '../../ui/button'
import type { OpenAiCompatibleSpeechVoiceProviderSummary } from '../../../../../shared/speech-synthesis'
import type { VoiceSettings } from '../../../../../shared/speech-types'
import { useTranslate } from '@/i18n/use-translate'
import { SettingsRow } from '../form-controls/SettingsFormControls'
import { SpokenReplyServiceDialog } from './SpokenReplyServiceDialog'
import { SpokenReplySampleButton } from './VoiceSpokenReplySampleButton'

/** A voice server of the person's own that speaks OpenAI's speech API, on this computer, the
 *  local network or the tailnet. */
export function VoiceSpokenReplyServerSettings({
  voiceSettings,
  disabled
}: {
  voiceSettings: VoiceSettings
  disabled: boolean
}): React.JSX.Element {
  const t = useTranslate()
  const [server, setServer] = useState<OpenAiCompatibleSpeechVoiceProviderSummary | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const speech = window.api.speech

  useEffect(() => {
    let current = true
    void speech.getOpenAiCompatibleSpeechVoice?.().then((saved) => {
      if (current) {
        setServer(saved)
      }
    })
    return () => {
      current = false
    }
  }, [speech])

  return (
    <>
      <SettingsRow
        label={t('components.settings.voice.spokenReplies.serverLabel', 'Voice server')}
        description={
          server
            ? `${server.baseUrl} · ${server.model} · ${server.voice}`
            : t(
                'components.settings.voice.spokenReplies.serverMissing',
                'A server that speaks the OpenAI speech API, such as one on your home computer. Plain http only reaches this computer, the local network or the tailnet.'
              )
        }
        control={
          <div className="flex items-center gap-1">
            <SpokenReplySampleButton voiceSettings={voiceSettings} disabled={disabled || !server} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => setDialogOpen(true)}
            >
              {server
                ? t('components.settings.voice.spokenReplies.serverChange', 'Change')
                : t('components.settings.voice.spokenReplies.serverSetUp', 'Set up')}
            </Button>
          </div>
        }
      />
      <SpokenReplyServiceDialog
        open={dialogOpen}
        title={t('components.settings.voice.spokenReplies.serverDialogTitle', 'Voice server')}
        description={t(
          'components.settings.voice.spokenReplies.serverDialogDescription',
          'The text of each reply read is sent to this server. A blank key keeps the saved one while the address is unchanged.'
        )}
        fields={[
          {
            id: 'baseUrl',
            label: t('components.settings.voice.spokenReplies.serverUrl', 'Base URL'),
            placeholder: t(
              'components.settings.voice.spokenReplies.serverUrlExample',
              'http://localhost:8880/v1'
            ),
            initial: server?.baseUrl
          },
          {
            id: 'model',
            label: t('components.settings.voice.spokenReplies.serverModel', 'Model'),
            placeholder: t('components.settings.voice.spokenReplies.serverModelExample', 'kokoro'),
            initial: server?.model
          },
          {
            id: 'voice',
            label: t('components.settings.voice.spokenReplies.serverVoice', 'Voice'),
            placeholder: t('components.settings.voice.spokenReplies.serverVoiceExample', 'pf_dora'),
            initial: server?.voice
          },
          {
            id: 'apiKey',
            label: t('components.settings.voice.spokenReplies.serverKey', 'API key (optional)'),
            secret: true,
            optional: true
          }
        ]}
        configured={server !== null}
        onOpenChange={setDialogOpen}
        onSave={async ({ baseUrl, model, voice, apiKey }) => {
          const saved = await speech.saveOpenAiCompatibleSpeechVoice?.({
            baseUrl,
            model,
            voice,
            apiKey
          })
          setServer(saved ?? null)
        }}
        onClear={async () => {
          await speech.clearOpenAiCompatibleSpeechVoice?.()
          setServer(null)
        }}
      />
    </>
  )
}
