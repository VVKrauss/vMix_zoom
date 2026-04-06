import { useCallback, useEffect, useState } from 'react'
import {
  readPreferredCameraId,
  readPreferredMicId,
  writePreferredCameraId,
  writePreferredMicId,
} from '../config/roomUiStorage'

export interface DeviceList {
  cameras: MediaDeviceInfo[]
  microphones: MediaDeviceInfo[]
}

export function useDevices() {
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState<string>(() => readPreferredCameraId())
  const [selectedMicId, setSelectedMicId] = useState<string>(() => readPreferredMicId())

  const enumerate = useCallback(async () => {
    // Permissions must already be granted for labels to appear
    const devices = await navigator.mediaDevices.enumerateDevices()
    const cams = devices.filter(d => d.kind === 'videoinput')
    const mics = devices.filter(d => d.kind === 'audioinput')
    setCameras(cams)
    setMicrophones(mics)

    setSelectedCameraId((prev) => {
      const pick = (id: string) => (id && cams.some((d) => d.deviceId === id) ? id : '')
      return pick(prev) || cams[0]?.deviceId || ''
    })
    setSelectedMicId((prev) => {
      const pick = (id: string) => (id && mics.some((d) => d.deviceId === id) ? id : '')
      return pick(prev) || mics[0]?.deviceId || ''
    })
  }, [])

  // Re-enumerate when devices change (plug/unplug)
  useEffect(() => {
    navigator.mediaDevices.addEventListener('devicechange', enumerate)
    return () => navigator.mediaDevices.removeEventListener('devicechange', enumerate)
  }, [enumerate])

  useEffect(() => {
    writePreferredCameraId(selectedCameraId)
  }, [selectedCameraId])

  useEffect(() => {
    writePreferredMicId(selectedMicId)
  }, [selectedMicId])

  return {
    cameras,
    microphones,
    selectedCameraId,
    selectedMicId,
    setSelectedCameraId,
    setSelectedMicId,
    enumerate,
  }
}
