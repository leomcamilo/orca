import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { SpeechSynthesisFailure } from '../../../../../../shared/speech-synthesis'

function failureText(failure: SpeechSynthesisFailure, message: string | undefined): string {
  switch (failure) {
    case 'no-key':
      return translate(
        'components.native-chat.spokenReplies.apiFailure.noKey',
        'Reading replies with OpenAI needs an OpenAI API key. Add one in Settings > Voice.'
      )
    case 'unauthorized':
      return translate(
        'components.native-chat.spokenReplies.apiFailure.unauthorized',
        'OpenAI did not accept the saved API key.'
      )
    case 'quota':
      return translate(
        'components.native-chat.spokenReplies.apiFailure.quota',
        'The OpenAI account has no credit left for speech.'
      )
    case 'rate-limited':
      return translate(
        'components.native-chat.spokenReplies.apiFailure.rateLimited',
        'OpenAI is limiting requests right now.'
      )
    case 'timeout':
    case 'network':
      return translate(
        'components.native-chat.spokenReplies.apiFailure.network',
        'Could not reach OpenAI.'
      )
    case 'unavailable':
      return translate(
        'components.native-chat.spokenReplies.apiFailure.unavailable',
        'Reading replies with OpenAI is not available here.'
      )
    case 'refused':
    case 'cancelled':
      return message
        ? translate(
            'components.native-chat.spokenReplies.apiFailure.refusedWithReason',
            'OpenAI could not read the reply: {{reason}}',
            { reason: message }
          )
        : translate(
            'components.native-chat.spokenReplies.apiFailure.refused',
            'OpenAI could not read the reply.'
          )
  }
}

/** Says why a reply was not read, once however many of its lines failed. */
export function showSpokenReplyApiFailure(
  failure: SpeechSynthesisFailure,
  message: string | undefined
): void {
  toast.error(
    translate(
      'components.native-chat.spokenReplies.apiFailure.title',
      'The reply was not read aloud'
    ),
    { id: 'spoken-reply-api-failure', description: failureText(failure, message) }
  )
}
