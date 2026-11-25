import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { Store } from '../persistence/loading-store/store'
import {
  clearElevenLabsApiKey,
  hasElevenLabsApiKey,
  listElevenLabsVoices,
  saveElevenLabsApiKey
} from '../speech/elevenlabs-speech'
import {
  clearOpenAiCompatibleSpeechVoice,
  saveOpenAiCompatibleSpeechVoice,
  summarizeOpenAiCompatibleSpeechVoice
} from '../speech/openai-compatible-speech-voice-store'
import { createSpokenReplySynthesis } from '../speech/spoken-reply-synthesis'
import { speechSynthesisUsage } from '../speech/speech-synthesis-usage'
import {
  DEFAULT_SPOKEN_REPLY_MONTHLY_CHARACTER_LIMIT,
  type SpeechSynthesisResult
} from '../../shared/speech-synthesis'
import { abortWhenRendererGone } from './renderer-requests/renderer-lifetime-abort'
import { isTrustedUIRenderer } from './ui'

const UNTRUSTED = new Error('Unauthorized speech IPC sender')

function trusted(event: IpcMainInvokeEvent): void {
  if (!isTrustedUIRenderer(event.sender)) {
    throw UNTRUSTED
  }
}

/** Spoken replies read by a speech service. They spend from the person's accounts and hold their
 *  keys, so only the app's own window may ask. */
export function registerSpeechSynthesisHandlers(store: Store): void {
  const synthesis = createSpokenReplySynthesis({
    usage: speechSynthesisUsage,
    monthlyLimit: () => {
      const limit = store.getSettings().voice?.spokenReplyMonthlyCharacterLimit
      return limit === null
        ? null
        : Number.isSafeInteger(limit) && limit !== undefined && limit >= 0
          ? limit
          : DEFAULT_SPOKEN_REPLY_MONTHLY_CHARACTER_LIMIT
    }
  })
  ipcMain.handle(
    'speech:synthesizeSpeech',
    async (event, request: unknown): Promise<SpeechSynthesisResult> => {
      if (!isTrustedUIRenderer(event.sender)) {
        return { ok: false, failure: 'unavailable' }
      }
      // A window reloaded mid-request has no one left to play the answer.
      const rendererLifetime = abortWhenRendererGone(event.sender)
      try {
        return await synthesis.synthesize(request, rendererLifetime.signal)
      } finally {
        rendererLifetime.dispose()
      }
    }
  )
  ipcMain.handle('speech:cancelSpeechSynthesis', (event, requestId: unknown) => {
    trusted(event)
    synthesis.cancel(requestId)
  })
  ipcMain.handle('speech:getSpeechSynthesisUsage', (event) => {
    trusted(event)
    return speechSynthesisUsage.read()
  })
  ipcMain.handle('speech:getElevenLabsKeyStatus', async (event) => {
    trusted(event)
    return { configured: await hasElevenLabsApiKey() }
  })
  ipcMain.handle('speech:saveElevenLabsApiKey', async (event, apiKey: unknown) => {
    trusted(event)
    await saveElevenLabsApiKey(apiKey)
    return { configured: await hasElevenLabsApiKey() }
  })
  ipcMain.handle('speech:clearElevenLabsApiKey', async (event) => {
    trusted(event)
    await clearElevenLabsApiKey()
    return { configured: await hasElevenLabsApiKey() }
  })
  ipcMain.handle('speech:listElevenLabsVoices', (event) => {
    trusted(event)
    return listElevenLabsVoices()
  })
  ipcMain.handle('speech:getOpenAiCompatibleSpeechVoice', (event) => {
    trusted(event)
    return summarizeOpenAiCompatibleSpeechVoice()
  })
  ipcMain.handle('speech:saveOpenAiCompatibleSpeechVoice', async (event, input: unknown) => {
    trusted(event)
    await saveOpenAiCompatibleSpeechVoice(input)
    return summarizeOpenAiCompatibleSpeechVoice()
  })
  ipcMain.handle('speech:clearOpenAiCompatibleSpeechVoice', async (event) => {
    trusted(event)
    await clearOpenAiCompatibleSpeechVoice()
  })
}
