// About five minutes of 24 kHz mono WAV; a spoken line is seconds long.
export const MAX_SPEECH_AUDIO_BYTES = 16 * 1024 * 1024

/** The audio body of a speech response, read only up to the size a line could take. A server that
 *  says or sends more is cut off as it goes, so it cannot fill the main process's memory. */
export async function readSpeechAudio(response: Response): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get('content-length') ?? 0)
  if (declared > MAX_SPEECH_AUDIO_BYTES) {
    await response.body?.cancel().catch(() => {})
    return null
  }
  const reader = response.body?.getReader()
  if (!reader) {
    return new Uint8Array(0)
  }
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    size += value.byteLength
    if (size > MAX_SPEECH_AUDIO_BYTES) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const audio = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    audio.set(chunk, offset)
    offset += chunk.byteLength
  }
  return audio
}
