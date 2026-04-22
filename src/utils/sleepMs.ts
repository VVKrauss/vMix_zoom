/** Ожидание с Promise-интерфейсом (таймеры join/retry и т.д.). */
export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
