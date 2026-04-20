/** Один активный голосовой плеер в мессенджере: остальные ставятся на паузу. */
export const MESSENGER_AUDIO_EXCLUSIVE_EVENT = 'messenger-audio-exclusive-v1'

export function subscribeMessengerAudioExclusive(ownId: string, pauseOther: () => void): () => void {
  const handler = (e: Event) => {
    const id = (e as CustomEvent<string>).detail
    if (typeof id !== 'string' || id === ownId) return
    pauseOther()
  }
  window.addEventListener(MESSENGER_AUDIO_EXCLUSIVE_EVENT, handler)
  return () => window.removeEventListener(MESSENGER_AUDIO_EXCLUSIVE_EVENT, handler)
}

export function announceMessengerAudioExclusive(ownId: string) {
  window.dispatchEvent(new CustomEvent(MESSENGER_AUDIO_EXCLUSIVE_EVENT, { detail: ownId }))
}
