import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type {
  SpeechSynthesisFailure,
  SpeechSynthesisProvider
} from '../../../../../../shared/speech-synthesis'

const SERVICE_NAMES: Record<SpeechSynthesisProvider, string> = {
  openai: 'OpenAI',
  elevenlabs: 'ElevenLabs',
  'openai-compatible': 'voice server'
}

function failureText(
  failure: SpeechSynthesisFailure,
  message: string | undefined,
  provider: SpeechSynthesisProvider
): string {
  const service =
    provider === 'openai-compatible'
      ? translate('components.native-chat.spokenReplies.apiFailure.ownServer', 'your voice server')
      : SERVICE_NAMES[provider]
  switch (failure) {
    case 'no-key':
      return provider === 'openai-compatible'
        ? translate(
            'components.native-chat.spokenReplies.apiFailure.noServer',
            'No voice server is set up. Set one up in Settings > Voice.'
          )
        : translate(
            'components.native-chat.spokenReplies.apiFailure.noServiceKey',
            'Reading replies with {{service}} needs its API key. Add it in Settings > Voice.',
            { service }
          )
    case 'missing-permission':
      return translate(
        'components.native-chat.spokenReplies.apiFailure.missingPermission',
        'The saved {{service}} key is not allowed to read text aloud. Allow Text to Speech for it at {{service}}.',
        { service }
      )
    case 'over-limit':
      return translate(
        'components.native-chat.spokenReplies.apiFailure.overLimit',
        "This month's limit for paid voices is reached, so nothing was sent. Raise it in Settings > Voice."
      )
    case 'unauthorized':
      return translate(
        'components.native-chat.spokenReplies.apiFailure.unauthorized',
        '{{service}} did not accept the saved API key.',
        { service }
      )
    case 'quota':
      return translate(
        'components.native-chat.spokenReplies.apiFailure.quota',
        'The {{service}} account has no credit left for speech.',
        { service }
      )
    case 'rate-limited':
      return translate(
        'components.native-chat.spokenReplies.apiFailure.rateLimited',
        '{{service}} is limiting requests right now.',
        { service }
      )
    case 'timeout':
    case 'network':
      return translate(
        'components.native-chat.spokenReplies.apiFailure.network',
        'Could not reach {{service}}.',
        { service }
      )
    case 'unavailable':
      return translate(
        'components.native-chat.spokenReplies.apiFailure.unavailable',
        'Reading replies with a speech service is not available here.'
      )
    case 'refused':
    case 'cancelled':
      return message
        ? translate(
            'components.native-chat.spokenReplies.apiFailure.refusedWithReason',
            '{{service}} could not read the reply: {{reason}}',
            { service, reason: message }
          )
        : translate(
            'components.native-chat.spokenReplies.apiFailure.refused',
            '{{service}} could not read the reply.',
            { service }
          )
  }
}

/** Says why a reply was not read, once however many of its lines failed. */
export function showSpokenReplyApiFailure(
  failure: SpeechSynthesisFailure,
  message: string | undefined,
  provider: SpeechSynthesisProvider
): void {
  toast.error(
    translate(
      'components.native-chat.spokenReplies.apiFailure.title',
      'The reply was not read aloud'
    ),
    { id: 'spoken-reply-api-failure', description: failureText(failure, message, provider) }
  )
}
