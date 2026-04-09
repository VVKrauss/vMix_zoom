import type { RemoteParticipant } from '../../types'
import type { StudioSourceOption } from '../../types/studio'
import { studioSourceCameraKey, studioSourceScreenKey } from '../../types/studio'

function liveVideoStream(stream: MediaStream | null | undefined): MediaStream | null {
  if (!stream) return null
  const vt = stream.getVideoTracks()[0]
  return vt && vt.readyState !== 'ended' ? stream : null
}

export function buildStudioSources(
  participants: Map<string, RemoteParticipant>,
  localPeerId: string | null,
  localStream: MediaStream | null,
  localScreenStream: MediaStream | null,
  localDisplayName: string,
): StudioSourceOption[] {
  const out: StudioSourceOption[] = []
  const localLabel = localDisplayName.trim() || 'Вы'

  if (localPeerId) {
    out.push({
      key: studioSourceCameraKey(localPeerId),
      label: `${localLabel} — камера`,
      kind: 'camera',
      peerId: localPeerId,
      displayName: localLabel,
      stream: liveVideoStream(localStream),
      meterStream: localStream?.getAudioTracks().length ? localStream : undefined,
    })
  }
  if (localPeerId && localScreenStream) {
    const liveScreen = liveVideoStream(localScreenStream)
    if (liveScreen) {
      out.push({
        key: studioSourceScreenKey(localPeerId),
        label: `${localLabel} — экран`,
        kind: 'screen',
        peerId: localPeerId,
        displayName: localLabel,
        stream: liveScreen,
        meterStream: localScreenStream.getAudioTracks().length ? localScreenStream : undefined,
      })
    }
  }

  for (const p of participants.values()) {
    if (localPeerId && p.peerId === localPeerId) continue
    if (p.virtualSourceType === 'studio_program') continue
    const name = p.name || p.peerId
    const cam = liveVideoStream(p.videoStream)
    const mic = p.audioStream
    out.push({
      key: studioSourceCameraKey(p.peerId),
      label: `${name} — камера`,
      kind: 'camera',
      peerId: p.peerId,
      displayName: name,
      avatarUrl: p.avatarUrl,
      stream: cam,
      meterStream: mic && mic.getAudioTracks().length ? mic : undefined,
    })
    const scr = p.screenStream
    const liveScreen = liveVideoStream(scr)
    if (liveScreen) {
      out.push({
        key: studioSourceScreenKey(p.peerId),
        label: `${name} — экран`,
        kind: 'screen',
        peerId: p.peerId,
        displayName: name,
        avatarUrl: p.avatarUrl,
        stream: liveScreen,
        meterStream: scr?.getAudioTracks().length ? scr : undefined,
      })
    }
  }

  return out
}
