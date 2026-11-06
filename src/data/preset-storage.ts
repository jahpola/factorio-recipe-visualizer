import { z } from 'zod'
import { parsePreset } from './preset.ts'
import type { Preset } from './preset.ts'

export const PRESET_DATABASE = 'factorio-recipe-visualizer'
const store = 'presets'
const key = 'last-import'
const recordSchema = z.object({ filename: z.string().min(1), preset: z.unknown() })

export interface SavedPreset {
  filename: string
  preset: Preset
}

let queue: Promise<unknown> = Promise.resolve()

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const pending = queue.then(operation, operation)
  queue = pending
  return pending
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('Browser storage is unavailable.'))
      return
    }
    const request = indexedDB.open(PRESET_DATABASE, 1)
    let blocked = false
    request.onupgradeneeded = () => request.result.createObjectStore(store)
    request.onerror = () => reject(request.error ?? new Error('Cannot open browser storage.'))
    request.onblocked = () => {
      blocked = true
      reject(new Error('Browser storage is blocked by another tab. Close other viewer tabs and try again.'))
    }
    request.onsuccess = () => {
      const database = request.result
      database.onversionchange = () => database.close()
      if (blocked) database.close()
      else resolve(database)
    }
  })
}

async function transact(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest): Promise<unknown> {
  const database = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(store, mode)
      const request = operation(transaction.objectStore(store))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onabort = () => reject(transaction.error ?? request.error ?? new Error('Browser storage transaction was aborted.'))
      transaction.onerror = () => reject(transaction.error ?? request.error ?? new Error('Browser storage transaction failed.'))
    })
  } finally {
    database.close()
  }
}

export function readSavedPreset(): Promise<SavedPreset | undefined> {
  return enqueue(async () => {
    const value = await transact('readonly', objectStore => objectStore.get(key))
    if (value === undefined) return undefined
    const record = recordSchema.parse(value)
    return { filename: record.filename, preset: parsePreset(record.preset) }
  })
}

export function savePreset(record: SavedPreset): Promise<void> {
  return enqueue(async () => {
    await transact('readwrite', objectStore => objectStore.put(record, key))
  })
}

export function forgetSavedPreset(): Promise<void> {
  return enqueue(async () => {
    await transact('readwrite', objectStore => objectStore.delete(key))
  })
}
