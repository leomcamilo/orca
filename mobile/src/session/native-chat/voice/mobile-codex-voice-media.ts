import { mediaDevices, RTCPeerConnection, RTCSessionDescription } from 'react-native-webrtc'
import type { MobileCodexVoiceFailure, VoiceMedia } from './mobile-codex-voice-call'

// Without trickle ICE the offer must already hold candidates; a slow gather still sends what it has.
const ICE_GATHER_WAIT_MS = 2_000

/** The phone's microphone on a WebRTC peer; native WebRTC plays the remote track by itself. */
export async function openMobileCodexVoiceMedia(): Promise<VoiceMedia> {
  const stream = await mediaDevices.getUserMedia({ audio: true, video: false })
  // Media servers are public, so host candidates plus the server's own checks are enough, as on desktop.
  const peer = new RTCPeerConnection({ iceServers: [] })
  for (const track of stream.getAudioTracks()) {
    peer.addTrack(track, stream)
  }
  return {
    setMuted: (muted) => {
      for (const track of stream.getAudioTracks()) {
        track.enabled = !muted
      }
    },
    openChannel: (label, onMessage) => {
      const channel = peer.createDataChannel(label, { ordered: true })
      channel.addEventListener('message', (event) => onMessage(event.data))
      return { close: () => channel.close() }
    },
    onConnectionState: (listener) => {
      peer.addEventListener('connectionstatechange', () => listener(peer.connectionState))
    },
    createOffer: async () => {
      const offer = await peer.createOffer({})
      await peer.setLocalDescription(offer)
      await new Promise<void>((resolve) => {
        if (peer.iceGatheringState === 'complete') {
          resolve()
          return
        }
        const timer = setTimeout(resolve, ICE_GATHER_WAIT_MS)
        peer.addEventListener('icegatheringstatechange', () => {
          if (peer.iceGatheringState === 'complete') {
            clearTimeout(timer)
            resolve()
          }
        })
      })
      const sdp = peer.localDescription?.sdp ?? offer.sdp
      if (!sdp) {
        throw new Error('voice offer has no session description')
      }
      return sdp
    },
    applyAnswer: (sdp) =>
      peer.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp })),
    close: () => {
      for (const track of stream.getTracks()) {
        track.stop()
      }
      peer.close()
    }
  }
}

export function mobileCodexVoiceMicrophoneFailure(error: unknown): MobileCodexVoiceFailure {
  const name = error instanceof Error ? error.name : ''
  const message = error instanceof Error ? error.message : String(error)
  return name === 'NotAllowedError' ||
    name === 'SecurityError' ||
    /denied|permission/i.test(message)
    ? 'microphone-denied'
    : 'microphone-unavailable'
}
