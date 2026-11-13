import { createContext, useCallback, useContext, useEffect, useMemo } from 'react'
import { useAppStore } from '@/store'
import { i18n, translate } from '@/i18n/i18n'
import { structuredAgentLabel } from '@/lib/agent-session/launch/structured-agent-session-launch-label'
import type { AgentType } from '../../../../../../shared/agent-status/contracts/agent-status-types'
import type { AgentJournalRenderItem } from '../../../../../../shared/agent-session/journal/agent-session-journal-types'
import type { VoiceSettings } from '../../../../../../shared/speech-types'
import {
  speakablePhrase,
  speakableReply
} from '../../../../../../shared/native-chat/spoken-replies/speakable-reply'
import { SpokenReplyCues, type SpokenReplyCue } from './spoken-reply-cues'
import { pickSpokenReplyVoice, type SpokenReplyVoice } from './spoken-reply-speech'
import { setSpokenReplyMode, spokenRepliesOffered, useSpokenReplyMode } from './spoken-reply-mode'
import {
  systemSpokenReplySpeech,
  systemSpokenReplyVoices,
  useSpokenReplyLine
} from './spoken-reply-system-voice'

export type NativeChatSpokenReplies = {
  on: boolean
  sessionId: string
  /** The sentence this chat is speaking now. */
  line: string | null
  agentLabel: string
  toggle: () => void
  /** Stops the voice; the agent's work is untouched. */
  silence: () => void
}

export const NativeChatSpokenRepliesContext = createContext<NativeChatSpokenReplies | null>(null)

export function useNativeChatSpokenRepliesControl(): NativeChatSpokenReplies | null {
  return useContext(NativeChatSpokenRepliesContext)
}

// Outlives a remount, so a chat shown again does not repeat what it already said.
const cuesBySession = new Map<string, SpokenReplyCues>()

export function spokenReplyVoiceFor(
  voice: Pick<VoiceSettings, 'spokenReplyVoice' | 'dictationLanguage'> | undefined
): SpokenReplyVoice | null {
  const dictation = voice?.dictationLanguage
  return pickSpokenReplyVoice(systemSpokenReplyVoices(), voice?.spokenReplyVoice, [
    ...(dictation && dictation !== 'auto' ? [dictation] : []),
    i18n.language,
    navigator.language
  ])
}

function spokenLines(cue: SpokenReplyCue, agent: string): string[] {
  if (cue.kind === 'approval') {
    return [
      translate(
        'components.native-chat.spokenReplies.approval',
        '{{agent}} needs your approval: {{title}}',
        { agent, title: speakablePhrase(cue.title) }
      )
    ]
  }
  if (cue.kind === 'question') {
    return [
      translate('components.native-chat.spokenReplies.question', '{{agent}} asks: {{question}}', {
        agent,
        question: speakablePhrase(cue.question)
      })
    ]
  }
  const reply = speakableReply(cue.markdown)
  return reply.cut && reply.sentences.length > 0
    ? [
        ...reply.sentences,
        translate('components.native-chat.spokenReplies.restOnScreen', 'The rest is on screen.')
      ]
    : reply.sentences
}

/** This chat's spoken-reply controls. Null where the mode is not offered: a Codex chat, the
 *  setting off, or a platform without speech synthesis. */
export function useNativeChatSpokenReplies(args: {
  sessionId: string
  agent: AgentType
}): NativeChatSpokenReplies | null {
  const { sessionId, agent } = args
  const agentLabel = structuredAgentLabel(agent)
  const enabled = useAppStore((store) => store.settings?.voice?.spokenReplies)
  const offered = spokenRepliesOffered(agent, enabled) && systemSpokenReplySpeech() !== null
  const on = useSpokenReplyMode((state) => state.on[sessionId] === true) && offered
  const line = useSpokenReplyLine((state) =>
    state.line?.owner === sessionId ? state.line.text : null
  )
  const silence = useCallback(() => systemSpokenReplySpeech()?.silence(sessionId), [sessionId])
  // A chat that leaves the screen takes its strip with it, so its voice must not outlive it.
  useEffect(() => silence, [silence])
  useEffect(() => {
    if (!on) {
      cuesBySession.delete(sessionId)
      silence()
    }
  }, [on, sessionId, silence])

  const toggle = useCallback(() => setSpokenReplyMode(sessionId, !on), [sessionId, on])
  const control = useMemo(
    () => ({ on, sessionId, line, agentLabel, toggle, silence }),
    [on, sessionId, line, agentLabel, toggle, silence]
  )
  return offered ? control : null
}

/** Speaks what the chat's journal brings while its mode is on: the reply of each turn that ends
 *  and each prompt that opens. */
export function useSpokenReplyJournal(journalItems: readonly AgentJournalRenderItem[]): void {
  const spoken = useNativeChatSpokenRepliesControl()
  const sessionId = spoken?.on ? spoken.sessionId : null
  const agentLabel = spoken?.agentLabel ?? ''
  // An open microphone would take the voice in as dictated text.
  const dictating = useAppStore(
    (store) => store.dictationState === 'starting' || store.dictationState === 'listening'
  )
  useEffect(() => {
    if (sessionId === null) {
      return
    }
    let cues = cuesBySession.get(sessionId)
    if (!cues) {
      cues = new SpokenReplyCues(journalItems)
      cuesBySession.set(sessionId, cues)
    }
    const taken = cues.take(journalItems)
    const speech = systemSpokenReplySpeech()
    if (dictating) {
      speech?.silence(sessionId)
      return
    }
    for (const cue of taken) {
      speech?.say(
        sessionId,
        spokenLines(cue, agentLabel),
        spokenReplyVoiceFor(useAppStore.getState().settings?.voice)
      )
    }
  }, [sessionId, agentLabel, journalItems, dictating])
}
