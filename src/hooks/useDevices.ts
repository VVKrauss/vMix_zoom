import { useCallback, useEffect, useState } from 'react'

export interface DeviceList {
  cameras: MediaDeviceInfo[]
  microphones: MediaDeviceInfo[]
}

export function useDevices() {
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState<string>('')
  const [selectedMicId, setSelectedMicId] = useState<string>('')

  const enumerate = useCallback(async () => {
    // Permissions must already be granted for labels to appear
    const devices = await navigator.mediaDevices.enumerateDevices()
    const cams = devices.filter(d => d.kind === 'videoinput')
    const mics = devices.filter(d => d.kind === 'audioinput')
    setCameras(cams)
    setMicrophones(mics)

    // Set defaults if not yet chosen
    setSelectedCameraId(prev => prev || cams[0]?.deviceId || '')
    setSelectedMicId(prev => prev || mics[0]?.deviceId || '')
  }, [])

  // Re-enumerate when devices change (plug/unplug)
  useEffect(() => {
    navigator.mediaDevices.addEventListener('devicechange', enumerate)
    return () => navigator.mediaDevices.removeEventListener('devicechange', enumerate)
  }, [enumerate])

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
