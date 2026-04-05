const ALPH = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** Короткий id комнаты без внешних зависимостей. */
export function newRoomId(length = 10): string {
  const buf = new Uint8Array(length)
  crypto.getRandomValues(buf)
  let s = ''
  for (let i = 0; i < length; i++) s += ALPH[buf[i]! % ALPH.length]
  return s
}
