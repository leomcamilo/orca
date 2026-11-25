import { describe, expect, it } from 'vitest'
import type { AgentJournalRenderItem } from '../../../../../../shared/agent-session/journal/agent-session-journal-types'
import { SpokenReplyCues } from './spoken-reply-cues'

let sequence = 0

function row(
  itemId: string,
  body: AgentJournalRenderItem['body'],
  extra: Partial<AgentJournalRenderItem> = {}
): AgentJournalRenderItem {
  sequence += 1
  return { itemId, revision: 1, body, sequence, observedAt: sequence, ...extra }
}

function turn(itemId: string, state: 'running' | 'completed' | 'interrupted') {
  return row(itemId, { kind: 'turn', turnId: itemId, state })
}

function reply(itemId: string, turnItemId: string, text: string, agentId?: string) {
  return row(
    itemId,
    { kind: 'message', role: 'assistant', blocks: [{ type: 'text', text }] },
    { turnScope: { kind: 'turn', turnItemId }, ...(agentId ? { agentId } : {}) }
  )
}

function approval(itemId: string, state: 'pending' | 'resolved') {
  return row(itemId, {
    kind: 'approval',
    title: 'Run pnpm test',
    detail: null,
    options: [],
    resolution: { state, selectedOptionId: null, resolvedBy: null, resolvedAt: null }
  })
}

describe('SpokenReplyCues', () => {
  it('speaks the last reply of a turn it watched end, once', () => {
    const cues = new SpokenReplyCues([])
    expect(cues.take([turn('t1', 'running'), reply('m1', 't1', 'Looking.')])).toEqual([])
    const ended = [
      turn('t1', 'completed'),
      reply('m1', 't1', 'Looking.'),
      reply('m2', 't1', 'Done. All green.'),
      reply('m3', 't1', 'A subagent note.', 'worker-1')
    ]
    expect(cues.take(ended)).toEqual([{ kind: 'reply', key: 't1', markdown: 'Done. All green.' }])
    expect(cues.take(ended)).toEqual([])
  })

  it('stays silent for history and for a turn the person stopped', () => {
    const cues = new SpokenReplyCues([])
    expect(cues.take([turn('old', 'completed'), reply('m0', 'old', 'Old answer.')])).toEqual([])
    cues.take([turn('t2', 'running')])
    expect(cues.take([turn('t2', 'interrupted'), reply('m4', 't2', 'Half an answer')])).toEqual([])
  })

  it('announces a prompt that opens, but not one already open when the mode started', () => {
    const open = approval('a0', 'pending')
    const cues = new SpokenReplyCues([open])
    expect(cues.take([open, approval('a1', 'pending')])).toEqual([
      { kind: 'approval', key: 'a1', title: 'Run pnpm test' }
    ])
    expect(cues.take([open, approval('a1', 'resolved')])).toEqual([])
  })

  it('stays silent for a turn another agent opened with a mail, and reads one the person opened', () => {
    const cues = new SpokenReplyCues([])
    const opener = (itemId: string, turnItemId: string, fromAgent: boolean) =>
      row(
        itemId,
        {
          kind: 'message',
          role: 'user',
          blocks: [{ type: 'text', text: 'Retorno da frente' }],
          ...(fromAgent
            ? { from: { kind: 'agent' as const, senders: [], orchestration: null } }
            : {})
        },
        { turnScope: { kind: 'turn', turnItemId } }
      )
    cues.take([turn('t3', 'running'), opener('u3', 't3', true)])
    expect(
      cues.take([turn('t3', 'completed'), opener('u3', 't3', true), reply('m5', 't3', 'Anotado.')])
    ).toEqual([])
    cues.take([turn('t4', 'running'), opener('u4', 't4', false)])
    expect(
      cues.take([turn('t4', 'completed'), opener('u4', 't4', false), reply('m6', 't4', 'Feito.')])
    ).toEqual([{ kind: 'reply', key: 't4', markdown: 'Feito.' }])
  })
})
