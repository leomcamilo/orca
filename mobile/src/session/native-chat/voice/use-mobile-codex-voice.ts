import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { parseExecutionHostId } from '../../../../../src/shared/execution-host/execution-host'
import { usePageBridgeClientIfPresent } from '../../../transport/connection/client-context.web'
import { useWorkspaceExecutionHost } from '../../../navigation/workspace-execution-host'
import {
  BRIDGE_VOICE_VERB,
  voiceResultSchema,
  type BridgeVoiceParams,
  type BridgeVoiceResult
} from '../../../mobile-web-shell/bridge/native-capabilities/bridge-voice-verb'
import { newerVoiceResult, voiceCallRunsFor, voicePageView } from './mobile-codex-voice-page'
import {
  MOBILE_CODEX_VOICE_IDLE,
  type MobileCodexVoice,
  type MobileCodexVoiceView
} from './mobile-codex-voice-view'

/** Voice mode for one Codex chat. The phone's session is the computer's page, and the app holds the
 *  call through native.voice.call; null where the chat is not Codex's or the app cannot hold a call,
 *  so no button shows. */
export function useMobileCodexVoice(args: {
  sessionId: string | null
  codexChat: boolean
  hostSupportsVoice: boolean
}): MobileCodexVoice | null {
  const { sessionId, codexChat, hostSupportsVoice } = args
  const bridge = usePageBridgeClientIfPresent()
  const granted = bridge?.getShellSession()?.grants.native.includes(BRIDGE_VOICE_VERB) === true
  const server = parseExecutionHostId(useWorkspaceExecutionHost())
  const executionHost = server?.kind === 'runtime' ? server.id : undefined
  const [remote, setRemote] = useState<BridgeVoiceResult | null>(null)
  // A notice only this page knows, such as a computer without phone voice.
  const [local, setLocal] = useState<MobileCodexVoiceView | null>(null)
  const remoteRef = useRef(remote)
  useLayoutEffect(() => {
    remoteRef.current = remote
  }, [remote])

  const call = useCallback(
    async (params: BridgeVoiceParams): Promise<BridgeVoiceResult | null> => {
      if (!bridge) {
        return null
      }
      try {
        const reply = await bridge.callNativeVerb(BRIDGE_VOICE_VERB, params)
        const result = voiceResultSchema.parse(reply.result)
        setRemote((current) => newerVoiceResult(current, result))
        return result
      } catch {
        setLocal({
          ...MOBILE_CODEX_VOICE_IDLE,
          status: 'ended',
          failure: { kind: 'connection-lost' }
        })
        return null
      }
    },
    [bridge]
  )
  const callRef = useRef(call)
  useLayoutEffect(() => {
    callRef.current = call
  }, [call])

  const enabled = granted && codexChat && sessionId !== null
  // A document reloaded under a locked screen picks up the call the app kept.
  useEffect(() => {
    if (enabled) {
      void callRef.current({ action: 'read' })
    }
  }, [enabled, sessionId])

  const running = enabled && voiceCallRunsFor(remote, sessionId)
  useEffect(() => {
    if (!running) {
      return
    }
    let cancelled = false
    void (async () => {
      let after = remoteRef.current?.revision ?? 0
      while (!cancelled) {
        const next = await callRef.current({ action: 'read', after })
        if (!next || !voiceCallRunsFor(next, sessionId)) {
          return
        }
        after = next.revision
      }
    })()
    return () => {
      cancelled = true
    }
  }, [running, sessionId])

  // Another chat, or leaving this one, ends its call, as on the computer. A document that opens on
  // another chat leaves a running call alone: only this page's own move away ends it.
  useEffect(() => {
    if (!sessionId) {
      return
    }
    return () => {
      if (voiceCallRunsFor(remoteRef.current, sessionId)) {
        void callRef.current({ action: 'stop' })
      }
    }
  }, [sessionId])

  const view = useMemo(() => voicePageView(remote, local, sessionId), [local, remote, sessionId])
  const start = useCallback(() => {
    if (!sessionId) {
      return
    }
    if (!hostSupportsVoice) {
      setLocal({ ...MOBILE_CODEX_VOICE_IDLE, status: 'ended', failure: { kind: 'unsupported' } })
      return
    }
    setLocal(null)
    const prefs = remoteRef.current?.view ?? MOBILE_CODEX_VOICE_IDLE
    void call({
      action: 'start',
      sessionId,
      ...(executionHost ? { executionHost } : {}),
      muted: prefs.muted,
      speaker: prefs.speaker
    })
  }, [call, executionHost, hostSupportsVoice, sessionId])
  const stop = useCallback(() => {
    setLocal(null)
    void call({ action: 'stop' })
  }, [call])
  const setMuted = useCallback((muted: boolean) => void call({ action: 'mute', muted }), [call])
  const setSpeaker = useCallback(
    (speaker: boolean) => void call({ action: 'speaker', speaker }),
    [call]
  )
  const dismiss = useCallback(() => {
    setLocal(null)
    void call({ action: 'dismiss' })
  }, [call])

  return useMemo(
    () => (enabled ? { view, start, stop, setMuted, setSpeaker, dismiss } : null),
    [dismiss, enabled, setMuted, setSpeaker, start, stop, view]
  )
}
