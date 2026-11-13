import { create } from 'zustand'
import { useAppStore } from '@/store'
import type { AgentType } from '../../../../../../shared/agent-status/contracts/agent-status-types'

/** The chats reading their replies aloud. Kept in memory: a restart starts every chat silent. */
export const useSpokenReplyMode = create<{ on: Readonly<Record<string, true>> }>(() => ({
  on: {}
}))

export function setSpokenReplyMode(sessionId: string, on: boolean): void {
  useSpokenReplyMode.setState((state) => {
    const { [sessionId]: _was, ...others } = state.on
    return { on: on ? { ...others, [sessionId]: true } : others }
  })
}

/** Codex chats talk through Codex's own Voice mode instead. */
export function spokenRepliesOffered(agent: AgentType, enabled: boolean | undefined): boolean {
  return enabled === true && agent !== 'codex'
}

/** Whether this chat's next message asks its agent for an opening meant for listening. */
export function spokenReplyRequestedFor(sessionId: string): boolean {
  return (
    useSpokenReplyMode.getState().on[sessionId] === true &&
    useAppStore.getState().settings?.voice?.spokenReplies === true
  )
}
