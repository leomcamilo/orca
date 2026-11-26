import type {
  AgentSessionVoiceEndReason,
  AgentSessionVoiceEvent,
  AgentSessionVoiceRefusal
} from '../../../../../src/shared/agent-session/agent-session-voice-conversation'

// The phone's side of desktop's CodexVoiceCall: the phone owns microphone, peer and playback; the
// host only relays the offer, the answer and Codex's captions.

// Codex's realtime call carries its events on this ordered channel, as its own voice helper offers.
const EVENTS_CHANNEL = 'oai-events'
// A brief network blip may recover; a longer one must not keep capturing with no way back.
const DISCONNECTED_GRACE_MS = 8_000
// Past Codex's own answer wait plus ICE: a call that never connects must not keep the microphone.
const CONNECT_DEADLINE_MS = 45_000
const MAX_CAPTIONS = 4

export type MobileCodexVoiceFailure =
  | 'microphone-denied'
  | 'microphone-unavailable'
  | 'connect-timeout'
  | 'connection-lost'
  | 'provider-error'
  | Exclude<AgentSessionVoiceEndReason, 'requested' | 'error'>
  | AgentSessionVoiceRefusal

export type MobileCodexVoiceCaption = { id: string; role: 'user' | 'assistant'; text: string }

export type MobileCodexVoiceCallState = {
  phase: 'starting' | 'connecting' | 'live' | 'ended'
  muted: boolean
  speaking: 'user' | 'assistant' | null
  captions: readonly MobileCodexVoiceCaption[]
  unavailableVoice: string | null
  failure: { kind: MobileCodexVoiceFailure; message?: string } | null
}

/** Microphone and peer together, so the call never touches a platform type. */
export type VoiceMedia = {
  setMuted: (muted: boolean) => void
  openChannel: (label: string, onMessage: (data: unknown) => void) => { close: () => void }
  onConnectionState: (listener: (state: string) => void) => void
  /** Resolves once ICE gathering completes or its wait runs out, with candidates in the SDP. */
  createOffer: () => Promise<string>
  applyAnswer: (sdp: string) => Promise<void>
  /** Stops the microphone and closes the peer. */
  close: () => void
}

export type MobileCodexVoiceSubscribe = (
  offerSdp: string,
  onEvent: (event: AgentSessionVoiceEvent) => void,
  onFailure: (failure: { kind: MobileCodexVoiceFailure; message?: string }) => void
) => { unsubscribe: () => void }

export type MobileCodexVoiceCallDeps = {
  /** Rejects when the microphone cannot open; `microphoneFailure` names why. */
  openMedia: () => Promise<VoiceMedia>
  subscribe: MobileCodexVoiceSubscribe
  microphoneFailure: (error: unknown) => MobileCodexVoiceFailure
}

/** One attempt, from microphone to hang-up. Every exit runs `end` once, which releases the
 *  microphone, the peer and the host stream; the host stream's close stops Codex's side. */
export class MobileCodexVoiceCall {
  private state: MobileCodexVoiceCallState = {
    phase: 'starting',
    muted: false,
    speaking: null,
    captions: [],
    unavailableVoice: null,
    failure: null
  }
  private ended = false
  private media: VoiceMedia | null = null
  private channel: { close: () => void } | null = null
  private subscription: { unsubscribe: () => void } | null = null
  private disconnectedTimer: ReturnType<typeof setTimeout> | null = null
  private connectTimer: ReturnType<typeof setTimeout> | null = null
  private providerMessage: string | undefined

  constructor(
    private readonly deps: MobileCodexVoiceCallDeps,
    private readonly onChange: (state: MobileCodexVoiceCallState) => void,
    muted = false
  ) {
    this.state = { ...this.state, muted }
  }

  get current(): MobileCodexVoiceCallState {
    return this.state
  }

  async start(): Promise<void> {
    let media: VoiceMedia
    try {
      media = await this.deps.openMedia()
    } catch (error) {
      this.end({ kind: this.deps.microphoneFailure(error) })
      return
    }
    if (this.ended) {
      media.close()
      return
    }
    this.media = media
    media.setMuted(this.state.muted)
    this.connectTimer = setTimeout(() => this.end({ kind: 'connect-timeout' }), CONNECT_DEADLINE_MS)
    try {
      this.channel = media.openChannel(EVENTS_CHANNEL, (data) => this.observeChannel(data))
      media.onConnectionState((state) => this.observeConnection(state))
      const sdp = await media.createOffer()
      if (this.ended) {
        return
      }
      this.update({ phase: 'connecting' })
      const subscription = this.deps.subscribe(
        sdp,
        (event) => this.receive(event),
        (failure) => this.end(failure)
      )
      if (this.ended) {
        subscription.unsubscribe()
        return
      }
      this.subscription = subscription
    } catch {
      this.end({ kind: 'connection-lost' })
    }
  }

  stop(): void {
    this.end(null)
  }

  setMuted(muted: boolean): void {
    if (this.ended) {
      return
    }
    // A muted microphone sends silence frames: the call and its usage continue.
    this.media?.setMuted(muted)
    this.update({ muted })
  }

  private receive(event: AgentSessionVoiceEvent): void {
    if (this.ended) {
      return
    }
    switch (event.type) {
      case 'answer':
        this.media?.applyAnswer(event.sdp).catch(() => this.end({ kind: 'provider-error' }))
        return
      case 'transcript':
        this.caption({ id: event.itemId, role: event.role, text: event.text })
        return
      case 'error':
        this.providerMessage = event.message
        return
      case 'voice-unavailable':
        this.update({ unavailableVoice: event.voice })
        return
      case 'ended':
        this.end(
          event.reason === 'requested'
            ? null
            : event.reason === 'error'
              ? { kind: 'provider-error', ...this.message() }
              : { kind: event.reason, ...this.message() }
        )
        return
      case 'refused':
        this.end({ kind: event.reason })
    }
  }

  private observeConnection(state: string): void {
    if (this.ended) {
      return
    }
    if (state === 'connected') {
      this.clearTimer('disconnectedTimer')
      this.clearTimer('connectTimer')
      this.update({ phase: 'live' })
    } else if (state === 'disconnected') {
      this.disconnectedTimer ??= setTimeout(
        () => this.end({ kind: 'connection-lost' }),
        DISCONNECTED_GRACE_MS
      )
    } else if (state === 'failed' || state === 'closed') {
      this.end({ kind: 'connection-lost' })
    }
  }

  /** Activity only; captions come from Codex's own items on the host stream. */
  private observeChannel(data: unknown): void {
    if (this.ended || typeof data !== 'string') {
      return
    }
    const speaking = speakingFromChannelEvent(data, this.state.speaking)
    if (speaking !== undefined && speaking !== this.state.speaking) {
      this.update({ speaking })
    }
  }

  private caption(next: MobileCodexVoiceCaption): void {
    const rest = this.state.captions.filter((caption) => caption.id !== next.id)
    this.update({ captions: [...rest, next].slice(-MAX_CAPTIONS) })
  }

  private message(): { message?: string } {
    return this.providerMessage ? { message: this.providerMessage } : {}
  }

  /** Local resources go first: a failing transport must not leave the microphone open. */
  private end(failure: MobileCodexVoiceCallState['failure']): void {
    if (this.ended) {
      return
    }
    this.ended = true
    this.clearTimer('disconnectedTimer')
    this.clearTimer('connectTimer')
    this.channel?.close()
    this.channel = null
    this.media?.close()
    this.media = null
    const subscription = this.subscription
    this.subscription = null
    try {
      subscription?.unsubscribe()
    } catch {
      // The host stream is gone either way; its close stops Codex's side when it can.
    }
    this.update({ phase: 'ended', speaking: null, failure })
  }

  private clearTimer(name: 'connectTimer' | 'disconnectedTimer'): void {
    const timer = this[name]
    if (timer !== null) {
      clearTimeout(timer)
      this[name] = null
    }
  }

  private update(patch: Partial<MobileCodexVoiceCallState>): void {
    this.state = { ...this.state, ...patch }
    this.onChange(this.state)
  }
}

/** Realtime v3 reports turns by role; earlier versions report audio buffer edges. Undefined: no change. */
export function speakingFromChannelEvent(
  data: string,
  current: 'user' | 'assistant' | null
): 'user' | 'assistant' | null | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return undefined
  }
  if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) {
    return undefined
  }
  const role =
    'turn' in parsed &&
    typeof parsed.turn === 'object' &&
    parsed.turn !== null &&
    'role' in parsed.turn
      ? parsed.turn.role
      : undefined
  switch (parsed.type) {
    case 'turn.created':
      return role === 'user' || role === 'assistant' ? role : undefined
    case 'turn.done':
      return role === current ? null : undefined
    case 'input_audio_buffer.speech_started':
      return 'user'
    case 'output_audio_buffer.started':
      return 'assistant'
    case 'input_audio_buffer.speech_stopped':
    case 'output_audio_buffer.stopped':
    case 'output_audio_buffer.cleared':
      return null
    default:
      return undefined
  }
}
