import type { AgentJournalRenderItem } from '../../../../../../shared/agent-session/journal/agent-session-journal-types'
import { readAgentJournalTurn } from '../../../../../../shared/agent-session/lifecycle/agent-session-turn-record'

export type SpokenReplyCue =
  | { kind: 'reply'; key: string; markdown: string }
  | { kind: 'approval'; key: string; title: string }
  | { kind: 'question'; key: string; question: string }

function isPendingPrompt(item: AgentJournalRenderItem): boolean {
  return (
    (item.body.kind === 'approval' || item.body.kind === 'question') &&
    item.body.resolution.state === 'pending'
  )
}

function lastReplyOfTurn(items: readonly AgentJournalRenderItem[], turnItemId: string): string {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (
      item.agentId !== undefined ||
      item.body.kind !== 'message' ||
      item.body.role !== 'assistant' ||
      item.turnScope?.kind !== 'turn' ||
      item.turnScope.turnItemId !== turnItemId
    ) {
      continue
    }
    const text = item.body.blocks
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join('\n\n')
    if (text.trim().length > 0) {
      return text
    }
  }
  return ''
}

/** Decides what a chat says aloud from its journal: the final reply of each turn it watched end,
 *  and each prompt that opens. History, catch-up pages and a stopped turn say nothing. */
export class SpokenReplyCues {
  private readonly running = new Set<string>()
  private readonly settled = new Set<string>()
  private readonly announced = new Set<string>()

  /** Prompts already open are in front of the person, so they are not read. */
  constructor(items: readonly AgentJournalRenderItem[]) {
    for (const item of items) {
      if (isPendingPrompt(item)) {
        this.announced.add(item.itemId)
      }
    }
  }

  take(items: readonly AgentJournalRenderItem[]): SpokenReplyCue[] {
    const cues: SpokenReplyCue[] = []
    for (const item of items) {
      if (isPendingPrompt(item)) {
        if (!this.announced.has(item.itemId)) {
          this.announced.add(item.itemId)
          if (item.body.kind === 'approval') {
            cues.push({ kind: 'approval', key: item.itemId, title: item.body.title })
          } else if (item.body.kind === 'question') {
            cues.push({ kind: 'question', key: item.itemId, question: item.body.question })
          }
        }
        continue
      }
      const turn = item.agentId === undefined ? readAgentJournalTurn(item.body) : null
      if (!turn || this.settled.has(item.itemId)) {
        continue
      }
      if (turn.state === 'running') {
        this.running.add(item.itemId)
        continue
      }
      this.settled.add(item.itemId)
      // Only a turn seen running ended just now; any other is history.
      if (turn.state !== 'completed' || !this.running.delete(item.itemId)) {
        continue
      }
      const markdown = lastReplyOfTurn(items, item.itemId)
      if (markdown) {
        cues.push({ kind: 'reply', key: item.itemId, markdown })
      }
    }
    return cues
  }
}
