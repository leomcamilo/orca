import { useEffect, useMemo, useRef } from 'react'
import { routeVoiceOutput } from '@orca/expo-two-way-audio'
import { useHostClient } from '../../transport/connection/host-client-hooks'
import { scopeRpcClientToExecutionHost } from '../../worktree/execution-hosts/execution-host-scoped-rpc-client'
import { MobileCodexVoiceController } from '../../session/native-chat/voice/mobile-codex-voice-controller'
import { mobileCodexVoiceHostStream } from '../../session/native-chat/voice/mobile-codex-voice-host-stream'
import {
  mobileCodexVoiceMicrophoneFailure,
  openMobileCodexVoiceMedia
} from '../../session/native-chat/voice/mobile-codex-voice-media'
import { serveNativeVoiceCall } from './native-voice-call-server'

// Owned by the shell screen, not the page session: a document reloaded while the phone is locked
// finds its call still running. Leaving the screen ends it, as leaving a chat does on the computer.
export function useNativeVoiceCall(hostId: string): (params: unknown) => Promise<unknown> {
  const { client } = useHostClient(hostId)
  const clientRef = useRef(client)
  const controller = useMemo(
    () =>
      new MobileCodexVoiceController({
        readClient: (executionHost) => {
          const current = clientRef.current
          return current && executionHost
            ? scopeRpcClientToExecutionHost(current, executionHost)
            : current
        },
        hostStream: mobileCodexVoiceHostStream,
        openMedia: openMobileCodexVoiceMedia,
        microphoneFailure: mobileCodexVoiceMicrophoneFailure,
        routeOutput: routeVoiceOutput
      }),
    [hostId]
  )
  useEffect(() => () => controller.dispose(), [controller])
  useEffect(() => {
    if (clientRef.current === client) {
      return
    }
    clientRef.current = client
    controller.clientChanged()
  }, [client, controller])
  return useMemo(() => (params: unknown) => serveNativeVoiceCall(controller, params), [controller])
}
