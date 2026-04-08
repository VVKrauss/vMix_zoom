import type { RemoteParticipant } from '../../types'
import type { StudioSourceOption } from '../../types/studio'
import { studioSourceCameraKey, studioSourceScreenKey } from '../../types/studio'

export function buildStudioSources(
  participants: Map<string, RemoteParticipant>,
  localPeerId: string | null,
  localStream: MediaStream | null,
  localScreenStream: MediaStream | null,
  localDisplayName: string,
): StudioSourceOption[] {
  const out: StudioSourceOption[] = []
  const localLabel = localDisplayName.trim() || 'Вы'

  if (localPeerId && localStream) {
    const vt = localStream.getVideoTracks()[0]
    if (vt && vt.readyState !== 'ended') {
      out.push({
        key: studioSourceCameraKey(localPeerId),
        label: `${localLabel} — камера`,
        stream: localStream,
        meterStream: localStream,
      })
    }
  }
  if (localPeerId && localScreenStream) {
    const vt = localScreenStream.getVideoTracks()[0]
    if (vt && vt.readyState !== 'ended') {
      out.push({
        key: studioSourceScreenKey(localPeerId),
        label: `${localLabel} — экран`,
        stream: localScreenStream,
        meterStream: localScreenStream.getAudioTracks().length ? localScreenStream : undefined,
      })
    }
  }

  for (const p of participants.values()) {
    if (localPeerId && p.peerId === localPeerId) continue
    const cam = p.videoStream
    if (cam) {
      const vt = cam.getVideoTracks()[0]
      if (vt && vt.readyState !== 'ended') {
        const mic = p.audioStream
        out.push({
          key: studioSourceCameraKey(p.peerId),
          label: `${p.name || p.peerId} — камера`,
          stream: cam,
          meterStream: mic && mic.getAudioTracks().length ? mic : undefined,
        })
      }
    }
    const scr = p.screenStream
    if (scr) {
      const vt = scr.getVideoTracks()[0]
      if (vt && vt.readyState !== 'ended') {
        out.push({
          key: studioSourceScreenKey(p.peerId),
          label: `${p.name || p.peerId} — экран`,
          stream: scr,
          meterStream: scr.getAudioTracks().length ? scr : undefined,
        })
      }
    }
  }

  return out
}
