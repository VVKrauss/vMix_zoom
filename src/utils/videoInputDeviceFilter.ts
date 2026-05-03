/**
 * Виртуальные / программные «камеры» (NDI, OBS Virtual Cam и т.п.) не используем
 * для обычного захвата в комнате — только реальные videoinput.
 */
const VIRTUAL_VIDEO_INPUT_LABEL_RE =
  /ndi|obs\s*virtual|virtual\s*camera|manycam|droidcam|epoccam|scrcpy|irmobile|camo|webcamoid|snap\s*camera|camerahub|zoom\s*receiver/i

export function isVirtualVideoInputLabel(label: string): boolean {
  return VIRTUAL_VIDEO_INPUT_LABEL_RE.test(label.trim().toLowerCase())
}

export function filterRealVideoInputDevices(devices: MediaDeviceInfo[]): MediaDeviceInfo[] {
  return devices.filter((d) => d.kind === 'videoinput' && !isVirtualVideoInputLabel(d.label || ''))
}
