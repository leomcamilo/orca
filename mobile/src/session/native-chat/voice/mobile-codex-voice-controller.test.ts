import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createFakeRpcClient,
  type FakeRpcClient
} from '../../../mobile-web-shell/test-support/bridge-host-test-fakes'
import type { VoiceMedia } from './mobile-codex-voice-call'
import { MobileCodexVoiceController } from './mobile-codex-voice-controller'
import { mobileCodexVoiceHostStream } from './mobile-codex-voice-host-stream'

function fakeMedia() {
  const connection: ((state: string) => void)[] = []
  const media = {
    setMuted: vi.fn(),
    openChannel: vi.fn(() => ({ close: vi.fn() })),
    onConnectionState: (listener: (state: string) => void) => {
      connection.push(listener)
    },
    createOffer: vi.fn(async () => 'v=0 offer'),
    applyAnswer: vi.fn(async () => {}),
    close: vi.fn()
  } satisfies VoiceMedia
  return { media, connect: (state: string) => connection.forEach((listener) => listener(state)) }
}

function setup() {
  let client: FakeRpcClient = createFakeRpcClient()
  const opened: ReturnType<typeof fakeMedia>[] = []
  const routeOutput = vi.fn((speaker: boolean) => (speaker ? 'Speaker' : 'Receiver'))
  const controller = new MobileCodexVoiceController({
    readClient: () => client,
    hostStream: mobileCodexVoiceHostStream,
    openMedia: async () => {
      const next = fakeMedia()
      opened.push(next)
      return next.media
    },
    microphoneFailure: () => 'microphone-denied',
    routeOutput
  })
  return {
    controller,
    opened,
    routeOutput,
    client: () => client,
    replaceClient: () => {
      client = createFakeRpcClient()
      return client
    }
  }
}

async function goLive(rig: ReturnType<typeof setup>, sessionId: string) {
  rig.controller.start(sessionId, null, { muted: false, speaker: true })
  await vi.advanceTimersByTimeAsync(0)
  const stream = rig.client().streams.at(-1)
  stream?.emit({ type: 'answer', sdp: 'v=0 answer' })
  rig.opened.at(-1)?.connect('connected')
  return stream
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('MobileCodexVoiceController', () => {
  it('holds the call in the app and wakes a waiting page at each change', async () => {
    const rig = setup()
    const waiting = rig.controller.waitForChange(rig.controller.snapshot().revision, 10_000)
    const stream = await goLive(rig, 'chat-1')
    expect(stream?.method).toBe('agentSession.voiceConversation')
    expect(stream?.params).toEqual({ sessionId: 'chat-1', offerSdp: 'v=0 offer' })
    expect(rig.opened[0]?.media.applyAnswer).toHaveBeenCalledWith('v=0 answer')
    expect((await waiting).view.status).toBe('starting')
    expect(rig.controller.snapshot()).toMatchObject({
      sessionId: 'chat-1',
      view: { status: 'live', outputPort: 'Speaker' }
    })
  })

  it('answers a page whose wait runs out with the call as it stands', async () => {
    const rig = setup()
    const revision = rig.controller.snapshot().revision
    const waiting = rig.controller.waitForChange(revision, 10_000)
    await vi.advanceTimersByTimeAsync(10_000)
    expect((await waiting).revision).toBe(revision)
  })

  it('starts a new attempt in the same chat after a dropped connection', async () => {
    const rig = setup()
    const first = await goLive(rig, 'chat-1')
    first?.emit({ type: 'end' })
    expect(rig.controller.snapshot().view).toMatchObject({ status: 'reconnecting', attempt: 1 })
    expect(rig.opened[0]?.media.close).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(rig.client().streams).toHaveLength(2)
    expect(rig.client().streams[1]?.params).toMatchObject({ sessionId: 'chat-1' })
  })

  it('ends the call in one chat before starting another', async () => {
    const rig = setup()
    const first = await goLive(rig, 'chat-1')
    await goLive(rig, 'chat-2')
    expect(first?.unsubscribes).toBe(1)
    expect(rig.opened[0]?.media.close).toHaveBeenCalledTimes(1)
    expect(rig.controller.snapshot()).toMatchObject({
      sessionId: 'chat-2',
      view: { status: 'live' }
    })
  })

  it('moves a running call to a replaced connection', async () => {
    const rig = setup()
    const first = await goLive(rig, 'chat-1')
    const next = rig.replaceClient()
    rig.controller.clientChanged()
    expect(first?.unsubscribes).toBe(1)
    expect(rig.controller.snapshot().view.status).toBe('reconnecting')
    await vi.advanceTimersByTimeAsync(0)
    expect(next.streams).toHaveLength(1)
  })

  it('ends with the refusal when the computer has no phone voice', async () => {
    const rig = setup()
    rig.controller.start('chat-1', null, { muted: false, speaker: true })
    await vi.advanceTimersByTimeAsync(0)
    rig.client().streams[0]?.emit({ type: 'refused', reason: 'unsupported' })
    expect(rig.controller.snapshot().view).toMatchObject({
      status: 'ended',
      failure: { kind: 'unsupported' }
    })
  })

  it('stops the call and answers waiting pages when the shell screen goes', async () => {
    const rig = setup()
    const stream = await goLive(rig, 'chat-1')
    const waiting = rig.controller.waitForChange(rig.controller.snapshot().revision, 10_000)
    rig.controller.dispose()
    expect((await waiting).view.status).toBe('idle')
    expect(stream?.unsubscribes).toBe(1)
    expect(rig.opened[0]?.media.close).toHaveBeenCalledTimes(1)
  })
})
