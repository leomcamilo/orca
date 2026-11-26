import type { Translate } from '../../../i18n/mobile-i18n'
import type { MobileCodexVoiceFailure } from './mobile-codex-voice-call'
import type { MobileCodexVoiceView } from './mobile-codex-voice-view'

export function mobileCodexVoiceStatusLabel(t: Translate, view: MobileCodexVoiceView): string {
  switch (view.status) {
    case 'starting':
      return t('chat.voice.status.starting', 'Opening the microphone…')
    case 'connecting':
      return t('chat.voice.status.connecting', 'Connecting to Codex…')
    case 'reconnecting':
      return t('chat.voice.status.reconnecting', 'Reconnecting ({{attempt}}/{{max}})…', {
        attempt: view.attempt,
        max: view.maxAttempts
      })
    case 'live':
      if (view.speaking === 'assistant') {
        return t('chat.voice.status.assistantSpeaking', 'Codex is speaking')
      }
      if (view.muted) {
        return t('chat.voice.status.muted', 'Microphone muted')
      }
      return view.speaking === 'user'
        ? t('chat.voice.status.userSpeaking', 'Hearing you')
        : t('chat.voice.status.listening', 'Listening')
    case 'ended':
      return view.failure ? mobileCodexVoiceFailureLabel(t, view.failure.kind) : ''
    default:
      return ''
  }
}

export function mobileCodexVoiceFailureLabel(t: Translate, kind: MobileCodexVoiceFailure): string {
  switch (kind) {
    case 'microphone-denied':
      return t(
        'chat.voice.failure.microphoneDenied',
        'Microphone access is off. Allow it in Settings.'
      )
    case 'microphone-unavailable':
      return t('chat.voice.failure.microphoneUnavailable', 'The microphone could not open.')
    case 'connect-timeout':
    case 'answer-timeout':
      return t('chat.voice.failure.timeout', 'Codex did not answer in time.')
    case 'busy':
      return t('chat.voice.failure.busy', 'Voice is already on in this chat on another device.')
    case 'not-running':
      return t('chat.voice.failure.notRunning', "This chat's agent is not running.")
    case 'provider-exited':
      return t('chat.voice.failure.providerExited', "This chat's Codex stopped.")
    case 'provider-error':
      return t('chat.voice.failure.providerError', 'Codex voice failed.')
    case 'unsupported':
      return t(
        'chat.voice.failure.unsupported',
        "This computer's Orca does not offer voice to phones yet. Update Orca Leo on the Mac."
      )
    default:
      return t('chat.voice.failure.connectionLost', 'The connection dropped.')
  }
}

export function mobileCodexVoiceOutputLabel(t: Translate, port: string): string {
  if (port.startsWith('Bluetooth')) {
    return t('chat.voice.output.bluetooth', 'Bluetooth')
  }
  if (port === 'Headphones') {
    return t('chat.voice.output.headphones', 'Headphones')
  }
  if (port === 'Speaker') {
    return t('chat.voice.output.speaker', 'Speaker')
  }
  return port === 'Receiver' ? t('chat.voice.output.receiver', 'Earpiece') : ''
}
