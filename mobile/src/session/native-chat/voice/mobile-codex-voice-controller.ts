import type { RpcClient } from '../../../transport/rpc/rpc-client-contract'
import {
  MobileCodexVoiceCall,
  type MobileCodexVoiceCallState,
  type MobileCodexVoiceFailure,
  type MobileCodexVoiceSubscribe,
  type VoiceMedia
} from './mobile-codex-voice-call'
import { nextMobileCodexVoiceRetry } from './mobile-codex-voice-retry'
import { MOBILE_CODEX_VOICE_IDLE, type MobileCodexVoiceView } from './mobile-codex-voice-view'

// A call that stayed up this long counts as recovered, so later drops get a fresh retry budget.
const STABLE_CALL_MS = 20_000
const CONNECTED_WAIT_MS = 30_000

export type MobileCodexVoiceSnapshot = {
  /** Grows on every change, so a page can wait for the next one. */
  revision: number
  /** The chat the call belongs to; null before any call. */
  sessionId: string | null
  view: MobileCodexVoiceView
}

/** A workspace on another runtime names it; a chat on the paired computer itself has none. */
export type MobileCodexVoiceExecutionHost = `runtime:${string}` | null

export type MobileCodexVoiceControllerDeps = {
  /** The paired computer's client for this execution host, or null while the phone has none. */
  readClient: (executionHost: MobileCodexVoiceExecutionHost) => RpcClient | null
  hostStream: (client: RpcClient, sessionId: string) => MobileCodexVoiceSubscribe
  /** Rejects when the microphone cannot open; `microphoneFailure` names why. */
  openMedia: () => Promise<VoiceMedia>
  microphoneFailure: (error: unknown) => MobileCodexVoiceFailure
  /** Routes playback and returns the output port now in use. */
  routeOutput: (speaker: boolean) => string
}

type Waiter = {
  after: number
  resolve: (snapshot: MobileCodexVoiceSnapshot) => void
  timer: ReturnType<typeof setTimeout>
}

/** Voice mode for one paired computer, owned by the app so it outlives the page and a locked
 *  screen. One call at a time; each attempt is a MobileCodexVoiceCall, retried on recoverable ends. */
export class MobileCodexVoiceController {
  private view: MobileCodexVoiceView = MOBILE_CODEX_VOICE_IDLE
  private revision = 0
  private sessionId: string | null = null
  private executionHost: MobileCodexVoiceExecutionHost = null
  private call: MobileCodexVoiceCall | null = null
  private wanted = false
  private retries = 0
  private liveSince: number | null = null
  private everLive = false
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private pendingRetry: object | null = null
  private waiters: Waiter[] = []

  constructor(private readonly deps: MobileCodexVoiceControllerDeps) {}

  snapshot(): MobileCodexVoiceSnapshot {
    return { revision: this.revision, sessionId: this.sessionId, view: this.view }
  }

  /** A call in another chat ends first, as leaving that chat would. */
  start(
    sessionId: string,
    executionHost: MobileCodexVoiceExecutionHost,
    prefs: { muted: boolean; speaker: boolean }
  ): void {
    if (this.wanted && this.sessionId === sessionId) {
      return
    }
    this.halt()
    this.sessionId = sessionId
    this.executionHost = executionHost
    this.wanted = true
    this.retries = 0
    this.everLive = false
    this.patch({ ...MOBILE_CODEX_VOICE_IDLE, ...prefs, status: 'starting' })
    this.launch()
  }

  stop(): void {
    this.halt()
    this.patch(this.idle())
  }

  setMuted(muted: boolean): void {
    this.call?.setMuted(muted)
    this.patch({ muted })
  }

  setSpeaker(speaker: boolean): void {
    const outputPort = this.view.status === 'live' ? this.deps.routeOutput(speaker) : ''
    this.patch({ speaker, outputPort })
  }

  /** Clears an ended call's notice; a running call stays. */
  dismiss(): void {
    if (!this.wanted) {
      this.patch(this.idle())
    }
  }

  /** A replaced connection to the computer: the running attempt moves to the new one. */
  clientChanged(): void {
    const current = this.call
    if (!this.wanted || !current) {
      return
    }
    this.call = null
    this.liveSince = null
    current.stop()
    this.clearRetry()
    this.patch({ status: 'reconnecting', speaking: null })
    this.launch()
  }

  /** Resolves at the first revision past `after`, or with the current one when the wait runs out. */
  waitForChange(after: number, timeoutMs: number): Promise<MobileCodexVoiceSnapshot> {
    if (after < this.revision) {
      return Promise.resolve(this.snapshot())
    }
    return new Promise((resolve) => {
      const waiter: Waiter = {
        after,
        resolve,
        timer: setTimeout(() => {
          this.waiters = this.waiters.filter((other) => other !== waiter)
          resolve(this.snapshot())
        }, timeoutMs)
      }
      this.waiters.push(waiter)
    })
  }

  /** Ends any call and answers every waiting page; the controller is not used again. */
  dispose(): void {
    this.stop()
    this.flush(() => true)
  }

  private launch(): void {
    const sessionId = this.sessionId
    if (!this.wanted || !sessionId) {
      return
    }
    const client = this.deps.readClient(this.executionHost)
    if (!client) {
      this.retryAfter({ kind: 'connection-lost' })
      return
    }
    const attempt = new MobileCodexVoiceCall(
      {
        openMedia: this.deps.openMedia,
        subscribe: this.deps.hostStream(client, sessionId),
        microphoneFailure: this.deps.microphoneFailure
      },
      (state) => this.observe(attempt, state),
      this.view.muted
    )
    this.call = attempt
    void attempt.start()
  }

  private observe(owner: MobileCodexVoiceCall, state: MobileCodexVoiceCallState): void {
    if (this.call !== owner) {
      return
    }
    if (state.phase === 'live' && this.liveSince === null) {
      this.liveSince = Date.now()
      this.everLive = true
      this.patch({ outputPort: this.deps.routeOutput(this.view.speaker) })
    }
    if (state.phase !== 'ended') {
      const status =
        state.phase === 'live'
          ? 'live'
          : this.view.status === 'reconnecting'
            ? 'reconnecting'
            : state.phase
      this.patch({ status, speaking: state.speaking, captions: state.captions, failure: null })
      return
    }
    this.call = null
    const stableFor = this.liveSince === null ? 0 : Date.now() - this.liveSince
    this.liveSince = null
    if (!this.wanted || state.failure === null) {
      this.wanted = false
      this.patch(this.idle())
      return
    }
    if (stableFor >= STABLE_CALL_MS) {
      this.retries = 0
    }
    this.retryAfter(state.failure)
  }

  private retryAfter(failure: NonNullable<MobileCodexVoiceView['failure']>): void {
    const delay = nextMobileCodexVoiceRetry(failure.kind, this.retries, this.everLive)
    if (delay === null) {
      this.wanted = false
      this.patch({ status: 'ended', speaking: null, failure })
      return
    }
    this.retries += 1
    this.patch({ status: 'reconnecting', speaking: null, attempt: this.retries })
    const token = {}
    this.pendingRetry = token
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null
      const client = this.deps.readClient(this.executionHost)
      void (client ? whenConnected(client, CONNECTED_WAIT_MS) : Promise.resolve()).then(() => {
        // A stop, a new chat or a moved connection while waiting owns what happens next.
        if (this.pendingRetry === token) {
          this.pendingRetry = null
          this.launch()
        }
      })
    }, delay)
  }

  private halt(): void {
    this.wanted = false
    this.clearRetry()
    const current = this.call
    this.call = null
    this.liveSince = null
    current?.stop()
  }

  private clearRetry(): void {
    this.pendingRetry = null
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
  }

  private idle(): MobileCodexVoiceView {
    return { ...MOBILE_CODEX_VOICE_IDLE, muted: this.view.muted, speaker: this.view.speaker }
  }

  private patch(next: Partial<MobileCodexVoiceView>): void {
    this.view = { ...this.view, ...next }
    this.revision += 1
    this.flush((waiter) => waiter.after < this.revision)
  }

  private flush(ready: (waiter: Waiter) => boolean): void {
    const due = this.waiters.filter(ready)
    if (due.length === 0) {
      return
    }
    this.waiters = this.waiters.filter((waiter) => !due.includes(waiter))
    const snapshot = this.snapshot()
    for (const waiter of due) {
      clearTimeout(waiter.timer)
      waiter.resolve(snapshot)
    }
  }
}

function whenConnected(client: RpcClient, timeoutMs: number): Promise<void> {
  if (client.getState() === 'connected') {
    return Promise.resolve()
  }
  return new Promise((resolve) => {
    const done = (): void => {
      clearTimeout(deadline)
      unsubscribe()
      resolve()
    }
    const deadline = setTimeout(done, timeoutMs)
    const unsubscribe = client.onStateChange((state) => {
      if (state === 'connected') {
        done()
      }
    })
  })
}
