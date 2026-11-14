import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runProcess } from '@orca/process-host'
import {
  SYSTEM_VOICE_RENDER_MAX_CHARACTERS,
  type SystemVoiceRenderRequest
} from '../../shared/system-voice-render'

const RENDER_TIMEOUT_MS = 15_000
// A voice identifier as the system lists it, such as com.apple.voice.compact.pt-BR.Luciana.
const VOICE_IDENTIFIER = /^[\w.-]{1,160}$/

/** One line of speech in the system voice, as a WAV the app plays itself: sound the app plays is
 *  what its microphone capture can cancel as echo, which the system's own playback is not.
 *  macOS only; null elsewhere, for a voice the system does not have, and on any failure, so the
 *  caller falls back to the system speaking directly. */
export async function renderSystemVoice(request: unknown): Promise<Uint8Array | null> {
  if (process.platform !== 'darwin' || typeof request !== 'object' || request === null) {
    return null
  }
  const { text, voice }: Partial<SystemVoiceRenderRequest> = request
  if (
    typeof text !== 'string' ||
    text.trim().length === 0 ||
    text.length > SYSTEM_VOICE_RENDER_MAX_CHARACTERS ||
    (voice !== undefined && (typeof voice !== 'string' || !VOICE_IDENTIFIER.test(voice)))
  ) {
    return null
  }
  let directory: string | undefined
  try {
    directory = await mkdtemp(join(tmpdir(), 'orca-voice-'))
    const file = join(directory, 'line.wav')
    const result = await runProcess({
      program: '/usr/bin/say',
      // The text goes in on stdin, so nothing in it reads as an option.
      args: [
        ...(voice ? ['-v', voice] : []),
        '-o',
        file,
        '--file-format=WAVE',
        '--data-format=LEI16@22050',
        '-f',
        '-'
      ],
      input: text,
      timeoutMs: RENDER_TIMEOUT_MS
    })
    return result.code === 0 ? new Uint8Array(await readFile(file)) : null
  } catch {
    return null
  } finally {
    if (directory) {
      await rm(directory, { recursive: true, force: true }).catch(() => {})
    }
  }
}
