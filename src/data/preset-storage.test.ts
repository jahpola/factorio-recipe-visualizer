import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { parsePreset } from './preset'
import { forgetSavedPreset, PRESET_DATABASE, readSavedPreset, savePreset } from './preset-storage'

const preset = parsePreset({
  schemaVersion: 1, gameVersion: '2.1.23', language: 'en',
  mods: [{ name: 'base', version: '2.1.23' }], materials: [], recipes: [], sources: [], warnings: [],
})
beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()))
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('reads an empty store, replaces the saved preset, and forgets it', async () => {
  expect(await readSavedPreset()).toBeUndefined()
  await savePreset({ filename: 'first.json', preset })
  expect(await readSavedPreset()).toEqual({ filename: 'first.json', preset })
  await savePreset({ filename: 'second.json', preset: { ...preset, language: 'fi' } })
  expect(await readSavedPreset()).toEqual({ filename: 'second.json', preset: { ...preset, language: 'fi' } })
  await forgetSavedPreset()
  expect(await readSavedPreset()).toBeUndefined()
})

test('serializes writes and deletion in invocation order', async () => {
  await Promise.all([
    savePreset({ filename: 'first.json', preset }),
    savePreset({ filename: 'second.json', preset }),
    forgetSavedPreset(),
  ])
  expect(await readSavedPreset()).toBeUndefined()
})

test('revalidates stored data and permits forgetting a corrupt record', async () => {
  await savePreset({ filename: 'valid.json', preset })
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(PRESET_DATABASE, 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      const transaction = database.transaction('presets', 'readwrite')
      transaction.objectStore('presets').put({ filename: 'broken.json', preset: {} }, 'last-import')
      transaction.oncomplete = () => { database.close(); resolve() }
      transaction.onabort = () => { database.close(); reject(transaction.error) }
    }
  })
  await expect(readSavedPreset()).rejects.toThrow()
  await forgetSavedPreset()
  expect(await readSavedPreset()).toBeUndefined()
})

test('reports unavailable storage and recovers on the next operation', async () => {
  vi.stubGlobal('indexedDB', undefined)
  await expect(readSavedPreset()).rejects.toThrow('Browser storage is unavailable')
  await expect(savePreset({ filename: 'preset.json', preset })).rejects.toThrow('Browser storage is unavailable')
  await expect(forgetSavedPreset()).rejects.toThrow('Browser storage is unavailable')
  vi.stubGlobal('indexedDB', new IDBFactory())
  await savePreset({ filename: 'preset.json', preset })
  expect(await readSavedPreset()).toEqual({ filename: 'preset.json', preset })
})

test('waits for transaction completion and reports aborted writes without replacing saved data', async () => {
  await savePreset({ filename: 'original.json', preset })
  const put = IDBObjectStore.prototype.put
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args) {
    const request = put.apply(this, args)
    this.transaction.abort()
    return request
  })
  await expect(savePreset({ filename: 'replacement.json', preset })).rejects.toThrow()
  vi.restoreAllMocks()
  expect((await readSavedPreset())?.filename).toBe('original.json')
})
