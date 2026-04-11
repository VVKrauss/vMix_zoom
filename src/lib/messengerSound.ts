const LS_KEY = 'vmix.messenger.soundEnabled'

export function isMessengerSoundEnabled(): boolean {
  try {
    return localStorage.getItem(LS_KEY) !== 'false'
  } catch {
    return true
  }
}

export function setMessengerSoundEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(LS_KEY, enabled ? 'true' : 'false')
  } catch { /* noop */ }
}

let audioCtx: AudioContext | null = null

function getAudioCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

/**
 * Разблокировать AudioContext после первого пользовательского жеста.
 * Вызывается при первом click/touch в мессенджере.
 */
export function unlockAudioContext(): void {
  try {
    const ctx = getAudioCtx()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch { /* noop */ }
}

/**
 * Воспроизводит мягкий звук «новое сообщение» через WebAudio API.
 * Не требует внешних аудиофайлов.
 */
export function playMessageSound(): void {
  if (!isMessengerSoundEnabled()) return
  try {
    const ctx = getAudioCtx()
    const play = () => {
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      // Мягкий нисходящий тон: 880 Hz → 660 Hz
      osc.frequency.setValueAtTime(880, now)
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.06)
      gain.gain.setValueAtTime(0.12, now)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22)
      osc.start(now)
      osc.stop(now + 0.22)
    }
    if (ctx.state === 'suspended') {
      void ctx.resume().then(play)
    } else {
      play()
    }
  } catch { /* noop */ }
}
