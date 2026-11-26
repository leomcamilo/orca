import * as z from 'zod'
import { MOBILE_CODEX_VOICE_STATUSES } from '../../../session/native-chat/voice/mobile-codex-voice-view'

// Codex Voice mode lives in the shell: a page in a WebView cannot keep a WebRTC call and the
// microphone through a locked screen, while the app holds both with its audio background mode.
// The shell also opens the host stream on its own connection, so the call outlives the document.
// One verb with an action keeps the session route within the grant ceiling; the page waits on read
// because the bridge has no push lane.
export const BRIDGE_VOICE_VERB = 'native.voice.call'

// Long enough that an idle wait costs a request every few seconds at most, short of any frame timeout.
export const BRIDGE_VOICE_READ_WAIT_MS = 10_000
// Bounds a caption so a long spoken answer cannot grow a reply; the panel shows three lines.
export const BRIDGE_VOICE_CAPTION_MAX_CHARS = 600
const BRIDGE_VOICE_MAX_CAPTIONS = 4

const sessionIdSchema = z.string().min(1).max(256)

const startParamsSchema = z.strictObject({
  action: z.literal('start'),
  sessionId: sessionIdSchema,
  // The chat's server when the workspace runs on another runtime, as native.pdf.view takes it.
  executionHost: z.templateLiteral(['runtime:', z.string().min(1).max(256)]).optional(),
  muted: z.boolean(),
  speaker: z.boolean()
})
const stopParamsSchema = z.strictObject({ action: z.literal('stop') })
const muteParamsSchema = z.strictObject({ action: z.literal('mute'), muted: z.boolean() })
const speakerParamsSchema = z.strictObject({ action: z.literal('speaker'), speaker: z.boolean() })
const dismissParamsSchema = z.strictObject({ action: z.literal('dismiss') })
// Without after the shell answers at once; with it, at the next change or when the wait runs out.
const readParamsSchema = z.strictObject({
  action: z.literal('read'),
  after: z.number().int().nonnegative().optional()
})

export const voiceParamsSchema = z.discriminatedUnion('action', [
  startParamsSchema,
  stopParamsSchema,
  muteParamsSchema,
  speakerParamsSchema,
  dismissParamsSchema,
  readParamsSchema
])

export type BridgeVoiceParams = z.infer<typeof voiceParamsSchema>

// Failure kinds stay open strings: a newer shell may name one this page does not know, and the
// page shows its generic line for it instead of refusing the whole reply.
const viewSchema = z.strictObject({
  status: z.enum(MOBILE_CODEX_VOICE_STATUSES),
  muted: z.boolean(),
  speaker: z.boolean(),
  outputPort: z.string().max(64),
  speaking: z.enum(['user', 'assistant']).nullable(),
  captions: z
    .array(
      z.strictObject({
        id: z.string().max(256),
        role: z.enum(['user', 'assistant']),
        text: z.string().max(BRIDGE_VOICE_CAPTION_MAX_CHARS)
      })
    )
    .max(BRIDGE_VOICE_MAX_CAPTIONS),
  failure: z
    .strictObject({ kind: z.string().min(1).max(64), message: z.string().max(500).optional() })
    .nullable(),
  attempt: z.number().int().nonnegative(),
  maxAttempts: z.number().int().nonnegative()
})

// Every action answers with the call as it stands after it.
export const voiceResultSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  sessionId: sessionIdSchema.nullable(),
  view: viewSchema
})

export type BridgeVoiceResult = z.infer<typeof voiceResultSchema>
