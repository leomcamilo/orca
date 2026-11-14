import { createContext, useCallback, useContext, useEffect, useMemo } from 'react'
import { useAppStore } from '@/store'
import { i18n, translate } from '@/i18n/i18n'
import { structuredAgentLabel } from '@/lib/agent-session/launch/structured-agent-session-launch-label'
import type { AgentType } from '../../../../../../shared/agent-status/contracts/agent-status-types'
import type { AgentJournalRenderItem } from '../../../../../../shared/agent-session/journal/agent-session-journal-types'
import type { VoiceSettings } from '../../../../../../shared/speech-types'
import {
  DEFAULT_ELEVENLABS_SPEECH_MODEL,
  DEFAULT_OPENAI_SPEECH_VOICE,
  isElevenLabsSpeechModel,
  isOpenAiSpeechVoice
} from '../../../../../../shared/speech-synthesis'
import {
  speakablePhrase,
  speakableReply
} from '../../../../../../shared/native-chat/spoken-replies/speakable-reply'
import { SpokenReplyCues, type SpokenReplyCue } from './spoken-reply-cues'
import { pickSpokenReplyVoice, type SpokenReplyVoicePick } from './spoken-reply-speech'
import { useVoiceCallPresence } from '../voice-call-presence'
import {
  setHandsFreeMode,
  setSpokenReplyMode,
  spokenRepliesOffered,
  useSpokenReplyMode
} from './spoken-reply-mode'
import {
  systemSpokenReplySpeech,
  systemSpokenReplyVoices,
  useSpokenReplyLine
} from './spoken-reply-system-voice'

export type NativeChatSpokenReplies = {
  on: boolean
  sessionId: string
  /** The chat is on screen; a hidden chat stays quiet, since its Quiet control is hidden too. */
  visible: boolean
  /** The sentence this chat is speaking now. */
  line: string | null
  agentLabel: string
  /** The chat also opens the microphone for the person's turn and sends what they say. */
  handsFree: boolean
  /** Listening is on, but the microphone stays closed until the composer is empty. */
  waitsForEmptyComposer: boolean
  toggle: () => void
  setHandsFree: (handsFree: boolean) => void
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
  voice:
    | Pick<
        VoiceSettings,
        | 'spokenReplyVoice'
        | 'dictationLanguage'
        | 'spokenReplyProvider'
        | 'spokenReplyOpenAiVoice'
        | 'spokenReplyElevenLabsVoice'
        | 'spokenReplyElevenLabsModel'
      >
    | undefined
): SpokenReplyVoicePick {
  const dictation = voice?.dictationLanguage
  const pick = pickSpokenReplyVoice(systemSpokenReplyVoices(), voice?.spokenReplyVoice, [
    ...(dictation && dictation !== 'auto' ? [dictation] : []),
    i18n.language,
    navigator.language
  ])
  switch (voice?.spokenReplyProvider) {
    case 'openai': {
      const apiVoice = voice.spokenReplyOpenAiVoice
      return {
        ...pick,
        api: {
          provider: 'openai',
          voice: isOpenAiSpeechVoice(apiVoice) ? apiVoice : DEFAULT_OPENAI_SPEECH_VOICE
        }
      }
    }
    case 'openai-compatible':
      return { ...pick, api: { provider: 'openai-compatible', voice: '' } }
    case 'elevenlabs':
      return {
        ...pick,
        api: {
          provider: 'elevenlabs',
          voice: voice.spokenReplyElevenLabsVoice ?? '',
          model: isElevenLabsSpeechModel(voice.spokenReplyElevenLabsModel)
            ? voice.spokenReplyElevenLabsModel
            : DEFAULT_ELEVENLABS_SPEECH_MODEL
        }
      }
    case 'system':
    case undefined:
      return pick
  }
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
  isVisible: boolean
}): NativeChatSpokenReplies | null {
  const { sessionId, agent, isVisible } = args
  const agentLabel = structuredAgentLabel(agent)
  const enabled = useAppStore((store) => store.settings?.voice?.spokenReplies)
  const offered = spokenRepliesOffered(agent, enabled) && systemSpokenReplySpeech() !== null
  const on = useSpokenReplyMode((state) => state.on[sessionId] === true) && offered
  const handsFree = useSpokenReplyMode((state) => state.handsFree[sessionId] === true) && on
  const waitsForEmptyComposer =
    useSpokenReplyMode((state) => state.waitsForEmptyComposer === sessionId) && handsFree
  const line = useSpokenReplyLine((state) =>
    state.line?.owner === sessionId ? state.line.text : null
  )
  const silence = useCallback(() => systemSpokenReplySpeech()?.silence(sessionId), [sessionId])
  // A chat that leaves the screen takes its strip with it, so its voice must not outlive it.
  useEffect(() => silence, [silence])
  useEffect(() => {
    if (!isVisible) {
      silence()
    }
  }, [isVisible, silence])
  useEffect(() => {
    if (!on) {
      cuesBySession.delete(sessionId)
      silence()
    }
  }, [on, sessionId, silence])

  // A hidden chat must not hold the microphone open.
  useEffect(() => {
    if (!isVisible) {
      setHandsFreeMode(sessionId, false)
    }
  }, [isVisible, sessionId])

  const toggle = useCallback(() => setSpokenReplyMode(sessionId, !on), [sessionId, on])
  const setHandsFree = useCallback(
    (next: boolean) => setHandsFreeMode(sessionId, next),
    [sessionId]
  )
  const control = useMemo(
    () => ({
      on,
      sessionId,
      visible: isVisible,
      line,
      agentLabel,
      handsFree,
      waitsForEmptyComposer,
      toggle,
      setHandsFree,
      silence
    }),
    [
      on,
      sessionId,
      isVisible,
      line,
      agentLabel,
      handsFree,
      waitsForEmptyComposer,
      toggle,
      setHandsFree,
      silence
    ]
  )
  return offered ? control : null
}

/** Speaks what the chat's journal brings while its mode is on: the reply of each turn that ends
 *  and each prompt that opens. */
export function useSpokenReplyJournal(journalItems: readonly AgentJournalRenderItem[]): void {
  const spoken = useNativeChatSpokenRepliesControl()
  const sessionId = spoken?.on ? spoken.sessionId : null
  const agentLabel = spoken?.agentLabel ?? ''
  // An open microphone would take the voice in: as dictated text, or as the person's words in a
  // Voice mode call in any chat. The one this chat opens over its own reply drops what repeats
  // the reply, so the reply plays on.
  const dictating = useAppStore(
    (store) => store.dictationState === 'starting' || store.dictationState === 'listening'
  )
  const overhearing = useSpokenReplyMode(
    (state) => sessionId !== null && state.overhearing === sessionId
  )
  const inCall = useVoiceCallPresence((state) => state.calls > 0)
  const quiet = (dictating && !overhearing) || inCall || spoken?.visible !== true
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
    // What arrives meanwhile is not kept for later: read late, it would answer nothing.
    if (quiet) {
      speech?.silence(sessionId)
      return
    }
    for (const cue of taken) {
      speech?.say(sessionId, spokenLines(cue, agentLabel), () =>
        spokenReplyVoiceFor(useAppStore.getState().settings?.voice)
      )
    }
  }, [sessionId, agentLabel, journalItems, quiet])
}
