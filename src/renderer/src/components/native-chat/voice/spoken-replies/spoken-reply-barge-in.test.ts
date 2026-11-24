import { describe, expect, it } from 'vitest'
import { SpokenReplyBargeIn, type BargeInDecision } from './spoken-reply-barge-in'

type Levels = { microphone: number; output: number }

/** Feeds one 50 ms window at a time and keeps each decision with its time. */
function run(
  detector: SpokenReplyBargeIn,
  from: number,
  to: number,
  levels: (now: number) => Levels
): [number, BargeInDecision][] {
  const decisions: [number, BargeInDecision][] = []
  for (let now = from; now < to; now += 50) {
    const decision = detector.hear({ now, ...levels(now) })
    if (decision) {
      decisions.push([now, decision])
    }
  }
  return decisions
}

const ROOM = 0.003
// The reply as the microphone hears it after echo cancellation: 0.4 of what it plays.
const reading = (): Levels => ({ microphone: 0.04, output: 0.1 })
const held = (microphone: number): Levels => ({ microphone, output: 0 })

describe('SpokenReplyBargeIn', () => {
  it('plays on through its own echo, and an echo louder than usual only holds it for a moment', () => {
    const detector = new SpokenReplyBargeIn()
    expect(run(detector, 0, 2000, reading)).toEqual([])
    // A burst five times the usual echo: held, nothing goes on while it is, so it plays again.
    const burst = (): Levels => ({ microphone: 0.2, output: 0.1 })
    expect(run(detector, 2000, 2100, burst)).toEqual([[2050, 'pause']])
    expect(run(detector, 2100, 2600, () => held(ROOM))).toEqual([[2550, 'resume']])
    // The same burst again plays through: it was learned as the voice.
    expect(run(detector, 2600, 6000, burst)).toEqual([])
  })

  it('holds the voice as the person talks over it, and quiets it when they keep talking', () => {
    const detector = new SpokenReplyBargeIn()
    run(detector, 0, 1000, reading)
    expect(run(detector, 1000, 1100, () => ({ microphone: 0.3, output: 0.1 }))).toEqual([
      [1050, 'pause']
    ])
    expect(run(detector, 1100, 1600, () => held(0.25))).toEqual([[1200, 'stop']])
  })

  it('quiets the voice for a single short word said over it', () => {
    const detector = new SpokenReplyBargeIn()
    run(detector, 0, 1000, reading)
    // "Para": 350 ms of speech, then the room.
    const para = (now: number): Levels =>
      now < 1350 ? { microphone: 0.3, output: now < 1050 ? 0.1 : 0 } : held(ROOM)
    expect(run(detector, 1000, 2000, para)).toEqual([
      [1050, 'pause'],
      [1200, 'stop']
    ])
  })

  it('hears the person in a pause between sentences, and not a steady hum in the room', () => {
    const hum = new SpokenReplyBargeIn()
    run(hum, 0, 1000, reading)
    expect(run(hum, 1000, 4000, () => ({ microphone: 0.01, output: 0 }))).toEqual([])

    const person = new SpokenReplyBargeIn()
    run(person, 0, 1000, reading)
    run(person, 1000, 1400, () => held(ROOM))
    expect(run(person, 1400, 1800, () => held(0.05))).toEqual([
      [1450, 'pause'],
      [1600, 'stop']
    ])
  })
})
