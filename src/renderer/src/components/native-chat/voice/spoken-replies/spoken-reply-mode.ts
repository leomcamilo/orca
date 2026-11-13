import { create } from 'zustand'
import { useAppStore } from '@/store'
import type { AgentType } from '../../../../../../shared/agent-status/contracts/agent-status-types'

type ChatSet = Readonly<Record<string, true>>

/** The chats reading their replies aloud, and those among them also listening for the person's
 *  turn. Kept in memory: a restart starts every chat silent, with its microphone closed. */
export const useSpokenReplyMode = create<{ on: ChatSet; handsFree: ChatSet }>(() => ({
  on: {},
  handsFree: {}
}))

function withChat(chats: ChatSet, sessionId: string, member: boolean): ChatSet {
  const { [sessionId]: _was, ...others } = chats
  return member ? { ...others, [sessionId]: true } : others
}

/** Turning replies off closes the microphone too: nobody talks hands-free to a silent chat. */
export function setSpokenReplyMode(sessionId: string, on: boolean): void {
  useSpokenReplyMode.setState((state) => ({
    on: withChat(state.on, sessionId, on),
    handsFree: on ? state.handsFree : withChat(state.handsFree, sessionId, false)
  }))
}

/** Listening for the person's turn only makes a conversation with replies read back. One chat
 *  listens at a time: there is one microphone, and what it hears must have one destination. */
export function setHandsFreeMode(sessionId: string, handsFree: boolean): void {
  useSpokenReplyMode.setState((state) => ({
    on: handsFree ? withChat(state.on, sessionId, true) : state.on,
    handsFree: handsFree ? { [sessionId]: true } : withChat(state.handsFree, sessionId, false)
  }))
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
