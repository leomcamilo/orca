import {
  BRIDGE_VOICE_CAPTION_MAX_CHARS,
  BRIDGE_VOICE_READ_WAIT_MS,
  voiceParamsSchema,
  type BridgeVoiceResult
} from '../../mobile-web-shell/bridge/native-capabilities/bridge-voice-verb'
import type {
  MobileCodexVoiceController,
  MobileCodexVoiceSnapshot
} from '../../session/native-chat/voice/mobile-codex-voice-controller'

/** Serves native.voice.call from the app's controller; every action answers with the call as it stands. */
export async function serveNativeVoiceCall(
  controller: MobileCodexVoiceController,
  params: unknown,
  readWaitMs = BRIDGE_VOICE_READ_WAIT_MS
): Promise<BridgeVoiceResult> {
  const call = voiceParamsSchema.parse(params)
  switch (call.action) {
    case 'start':
      controller.start(call.sessionId, call.executionHost ?? null, {
        muted: call.muted,
        speaker: call.speaker
      })
      break
    case 'stop':
      controller.stop()
      break
    case 'mute':
      controller.setMuted(call.muted)
      break
    case 'speaker':
      controller.setSpeaker(call.speaker)
      break
    case 'dismiss':
      controller.dismiss()
      break
    case 'read':
      return wireSnapshot(
        call.after === undefined
          ? controller.snapshot()
          : await controller.waitForChange(call.after, readWaitMs)
      )
  }
  return wireSnapshot(controller.snapshot())
}

/** Clips what the reply schema bounds, so a long spoken answer never fails the reply. */
export function wireSnapshot(snapshot: MobileCodexVoiceSnapshot): BridgeVoiceResult {
  const { view } = snapshot
  return {
    revision: snapshot.revision,
    sessionId: snapshot.sessionId,
    view: {
      ...view,
      outputPort: view.outputPort.slice(0, 64),
      captions: view.captions.slice(-4).map((caption) => ({
        id: caption.id.slice(0, 256),
        role: caption.role,
        text: caption.text.slice(0, BRIDGE_VOICE_CAPTION_MAX_CHARS)
      })),
      failure: view.failure
        ? {
            kind: view.failure.kind,
            ...(view.failure.message ? { message: view.failure.message.slice(0, 500) } : {})
          }
        : null
    }
  }
}
