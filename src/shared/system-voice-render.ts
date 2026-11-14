/** A line longer than this is not rendered; spoken replies are cut far below it. */
export const SYSTEM_VOICE_RENDER_MAX_CHARACTERS = 1000

export type SystemVoiceRenderRequest = {
  text: string
  /** The system's identifier for the voice; absent, the system's default voice speaks. */
  voice?: string
}
