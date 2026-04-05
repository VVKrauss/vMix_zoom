import { useCallback, useEffect, useState } from 'react'

/** Устройства вывода звука (audiooutput), где поддерживает браузер. */
export function useAudioOutputs() {
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([])

  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return
    try {
      const list = await navigator.mediaDevices.enumerateDevices()
      setOutputs(list.filter((d) => d.kind === 'audiooutput'))
    } catch {
      setOutputs([])
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    navigator.mediaDevices?.addEventListener('devicechange', refresh)
    return () => navigator.mediaDevices?.removeEventListener('devicechange', refresh)
  }, [refresh])

  return { audioOutputs: outputs, refreshAudioOutputs: refresh }
}
