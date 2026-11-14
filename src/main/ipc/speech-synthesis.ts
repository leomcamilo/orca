import { ipcMain } from 'electron'
import { cancelOpenAiSpeech, synthesizeOpenAiSpeech } from '../speech/openai-speech-synthesis'
import type { SpeechSynthesisResult } from '../../shared/speech-synthesis'
import { isTrustedUIRenderer } from './ui'

/** Spoken replies read by OpenAI. They spend from the saved OpenAI account, so only the app's own
 *  window may ask for them. */
export function registerSpeechSynthesisHandlers(): void {
  ipcMain.handle(
    'speech:synthesizeSpeech',
    (event, request: unknown): Promise<SpeechSynthesisResult> | SpeechSynthesisResult =>
      isTrustedUIRenderer(event.sender)
        ? synthesizeOpenAiSpeech(request)
        : { ok: false, failure: 'unavailable' }
  )
  ipcMain.handle('speech:cancelSpeechSynthesis', (event, requestId: unknown) => {
    if (isTrustedUIRenderer(event.sender)) {
      cancelOpenAiSpeech(requestId)
    }
  })
}
