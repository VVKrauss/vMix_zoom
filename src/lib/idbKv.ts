type StoreName = 'channelFeedV1' | 'messengerSidebarAvatarsV1' | 'messengerThreadTailV1'

const DB_NAME = 'vmix-cache'
const DB_VERSION = 3

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('channelFeedV1')) {
        db.createObjectStore('channelFeedV1')
      }
      if (!db.objectStoreNames.contains('messengerSidebarAvatarsV1')) {
        db.createObjectStore('messengerSidebarAvatarsV1')
      }
      if (!db.objectStoreNames.contains('messengerThreadTailV1')) {
        db.createObjectStore('messengerThreadTailV1')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('idb_open_failed'))
  })
}

export async function idbGet<T>(store: StoreName, key: string): Promise<T | null> {
  try {
    const db = await openDb()
    return await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(store, 'readonly')
      const os = tx.objectStore(store)
      const req = os.get(key)
      req.onsuccess = () => resolve((req.result as T) ?? null)
      req.onerror = () => reject(req.error ?? new Error('idb_get_failed'))
    })
  } catch {
    return null
  }
}

export async function idbSet<T>(store: StoreName, key: string, value: T): Promise<boolean> {
  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite')
      const os = tx.objectStore(store)
      const req = os.put(value as unknown, key)
      req.onsuccess = () => resolve()
      req.onerror = () => reject(req.error ?? new Error('idb_put_failed'))
    })
    return true
  } catch {
    return false
  }
}
