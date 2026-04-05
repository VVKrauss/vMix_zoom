import { useState, useEffect } from 'react'

export function useLocalStorage<T>(
  key: string,
  defaultValue: T,
  serialize: (v: T) => string = String as never,
  deserialize?: (raw: string) => T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw == null || !deserialize) return defaultValue
      return deserialize(raw)
    } catch {
      return defaultValue
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, serialize(value))
    } catch { /* noop */ }
  }, [key, value, serialize])

  return [value, setValue]
}

export function useLocalStorageNumber(key: string, defaultValue: number, min = 0, max = 1) {
  return useLocalStorage<number>(
    key,
    defaultValue,
    String,
    (raw) => {
      const n = Number(raw)
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : defaultValue
    },
  )
}

export function useLocalStorageBool(key: string, defaultValue: boolean) {
  return useLocalStorage<boolean>(
    key,
    defaultValue,
    (v) => v ? '1' : '0',
    (raw) => raw === '1' || raw === 'true',
  )
}

export function useLocalStorageString(key: string, defaultValue: string) {
  return useLocalStorage<string>(key, defaultValue, String, (raw) => raw)
}
