import { z } from 'zod'
import { isIP } from 'node:net'
import { createVoiceCredentialStore } from './voice-credential-store'
import type {
  OpenAiCompatibleSpeechVoiceProvider,
  OpenAiCompatibleSpeechVoiceProviderSummary
} from '../../shared/speech-synthesis'

// URL, model, voice and key are sealed together so a key is only ever sent to the host it was
// saved for. Apart from the transcription provider: a speech server is often another machine.
const store = createVoiceCredentialStore({
  fileName: 'openai-compatible-speech-voice.enc',
  envelopePrefix: 'orca-openai-compatible-speech-voice:v1:',
  providerLabel: 'OpenAI-compatible voice server'
})

const SPEECH_PATH = '/audio/speech'

const providerSchema = z.object({
  baseUrl: z.string().catch(''),
  model: z.string().catch(''),
  voice: z.string().catch(''),
  apiKey: z.string().catch('')
}) satisfies z.ZodType<OpenAiCompatibleSpeechVoiceProvider>

function privateIpv4(host: string): boolean {
  const [a, b] = host.split('.').map(Number)
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    // Tailscale's addresses.
    (a === 100 && b >= 64 && b <= 127)
  )
}

/** Plain http only reaches this machine, the local network or the tailnet; anything else must be
 *  https, so the text and the key never cross the internet in the clear. */
export function isLocalSpeechHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.ts.net')) {
    return true
  }
  if (isIP(host) === 4) {
    return privateIpv4(host)
  }
  return host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')
}

/** Accepts a base like `http://100.121.155.28:8880/v1` or the full speech URL. */
export function openAiCompatibleSpeechUrl(baseUrl: string): string {
  let url: URL
  try {
    url = new URL(baseUrl.trim())
  } catch {
    throw new Error('Enter a full base URL, such as http://localhost:8880/v1')
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('The base URL must start with https:// or http://')
  }
  if (url.protocol === 'http:' && !isLocalSpeechHost(url.hostname)) {
    throw new Error(
      'Use https:// for a server outside this computer, the local network or the tailnet'
    )
  }
  // fetch refuses these, and its error would echo the password.
  if (url.username || url.password) {
    throw new Error('Put the key in the API Key field, not in the base URL')
  }
  const path = url.pathname.replace(/\/+$/, '')
  url.pathname = path.endsWith(SPEECH_PATH) ? path : `${path}${SPEECH_PATH}`
  return url.toString()
}

export async function readOpenAiCompatibleSpeechVoice(): Promise<OpenAiCompatibleSpeechVoiceProvider | null> {
  const raw = (await store.has()) ? await store.read() : null
  return raw === null ? null : providerSchema.parse(JSON.parse(raw))
}

export async function summarizeOpenAiCompatibleSpeechVoice(): Promise<OpenAiCompatibleSpeechVoiceProviderSummary | null> {
  try {
    const provider = await readOpenAiCompatibleSpeechVoice()
    return provider
      ? {
          baseUrl: provider.baseUrl,
          model: provider.model,
          voice: provider.voice,
          hasApiKey: provider.apiKey !== ''
        }
      : null
  } catch {
    return null
  }
}

async function savedKeyFor(baseUrl: string): Promise<string> {
  try {
    const saved = await readOpenAiCompatibleSpeechVoice()
    return saved !== null &&
      openAiCompatibleSpeechUrl(saved.baseUrl) === openAiCompatibleSpeechUrl(baseUrl)
      ? saved.apiKey
      : ''
  } catch {
    return ''
  }
}

/** A blank key keeps the saved one only while the URL is unchanged. */
async function saveProvider(input: unknown): Promise<void> {
  const parsed = providerSchema.parse(input)
  const baseUrl = parsed.baseUrl.trim()
  const model = parsed.model.trim()
  const voice = parsed.voice.trim()
  openAiCompatibleSpeechUrl(baseUrl)
  if (!model || !voice) {
    throw new Error('Enter the model and voice names the server expects')
  }
  await store.save(
    JSON.stringify({
      baseUrl,
      model,
      voice,
      apiKey: parsed.apiKey.trim() || (await savedKeyFor(baseUrl))
    })
  )
}

let changes: Promise<void> = Promise.resolve()
function changeProvider(operation: () => Promise<void>): Promise<void> {
  const next = changes.then(operation, operation)
  changes = next.catch(() => undefined)
  return next
}

export const saveOpenAiCompatibleSpeechVoice = (input: unknown): Promise<void> =>
  changeProvider(() => saveProvider(input))
export const clearOpenAiCompatibleSpeechVoice = (): Promise<void> => changeProvider(store.clear)
