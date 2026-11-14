import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { getDataFile } from '../persistence/loading-store/user-data-path'
import {
  isSpeechSynthesisProvider,
  PAID_SPEECH_PROVIDERS,
  type SpeechSynthesisProvider,
  type SpeechSynthesisUsage
} from '../../shared/speech-synthesis'

export type SpeechSynthesisUsageLedger = {
  read: () => Promise<SpeechSynthesisUsage>
  add: (provider: SpeechSynthesisProvider, characters: number) => Promise<void>
}

function monthOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function readUsage(raw: string, month: string): SpeechSynthesisUsage {
  const empty = { month, characters: {} }
  try {
    const data: { month?: unknown; characters?: unknown } = JSON.parse(raw)
    if (data.month !== month || typeof data.characters !== 'object' || data.characters === null) {
      return empty
    }
    const characters: SpeechSynthesisUsage['characters'] = {}
    for (const [provider, count] of Object.entries(data.characters)) {
      if (isSpeechSynthesisProvider(provider) && Number.isSafeInteger(count) && count >= 0) {
        characters[provider] = count
      }
    }
    return { month, characters }
  } catch {
    return empty
  }
}

/** Characters sent to the paid services this month, which their limit counts. */
export function paidSpeechCharacters(usage: SpeechSynthesisUsage): number {
  return PAID_SPEECH_PROVIDERS.reduce((sum, provider) => sum + (usage.characters[provider] ?? 0), 0)
}

/** Counts, per calendar month on this computer, the characters sent to each speech service. A new
 *  month starts from zero. Writes one at a time, so two lines never undercount each other. */
export function createSpeechSynthesisUsageLedger(
  file: () => string,
  now: () => Date
): SpeechSynthesisUsageLedger {
  let queue: Promise<unknown> = Promise.resolve()
  const read = async (): Promise<SpeechSynthesisUsage> =>
    readUsage(await readFile(file(), 'utf8').catch(() => ''), monthOf(now()))
  const add = (provider: SpeechSynthesisProvider, characters: number): Promise<void> => {
    const next = queue.then(async () => {
      const usage = await read()
      usage.characters[provider] = (usage.characters[provider] ?? 0) + characters
      await mkdir(dirname(file()), { recursive: true })
      await writeFile(file(), JSON.stringify(usage))
    })
    queue = next.catch(() => {})
    return next
  }
  return { read: () => queue.then(read, read), add }
}

export const speechSynthesisUsage = createSpeechSynthesisUsageLedger(
  () => join(dirname(getDataFile()), 'spoken-reply-usage.json'),
  () => new Date()
)
