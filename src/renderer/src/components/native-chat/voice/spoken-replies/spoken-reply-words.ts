import { spokenPortuguese } from '../../../../../../shared/native-chat/spoken-replies/spoken-portuguese'
import type { SpokenReplyVoicePick } from './spoken-reply-speech'

/** The words a voice is given for a line: in Portuguese, numbers, times, dates and acronyms
 *  spelled out, and for the system voice common English terms respelled. Other languages are
 *  left as written. */
export function spokenText(text: string, pick: SpokenReplyVoicePick): string {
  const language = (pick.voice?.lang ?? pick.language ?? '').toLowerCase()
  return language.startsWith('pt')
    ? spokenPortuguese(text, { respellEnglish: pick.api === undefined })
    : text
}
