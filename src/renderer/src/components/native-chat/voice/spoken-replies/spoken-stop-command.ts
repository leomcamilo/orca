// "Stop" in the app's two languages. Said alone it stops the agent; inside a sentence it is part
// of what the person says.
const STOP_WORDS = new Set(['para', 'stop'])
// "Para, para!" is still the command; a longer run of it is not someone talking.
const MOST_REPEATS = 3

/** Whether a dictated phrase is only the spoken command that stops the agent. */
export function isSpokenStopCommand(text: string): boolean {
  const words = text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0)
  return (
    words.length > 0 && words.length <= MOST_REPEATS && words.every((word) => STOP_WORDS.has(word))
  )
}
