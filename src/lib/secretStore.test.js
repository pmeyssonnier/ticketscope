import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'

const SETTINGS_KEY = 'ticketscope.ai.v1'
const PLAIN_KEY = 'ticketscope.apikey.v1'
const SECRET = 'sk-ant-api03-SECRET-VALUE-1234567890'

function fakeLocalStorage() {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
    dump: () => JSON.stringify([...store.entries()]),
  }
}

async function freshStore() {
  vi.resetModules()
  return import('./secretStore.js')
}

// Contenu brut de la base des secrets (pour vérifier l'absence de texte en clair).
function rawRecords() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('ticketscope-secrets', 1)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const req = open.result.transaction('kv').objectStore('kv').getAll()
      req.onsuccess = () => resolve(req.result)
    }
  })
}

beforeEach(() => {
  fakeLocalStorage()
  globalThis.indexedDB = new IDBFactory()
})

describe('secretStore (chiffré)', () => {
  it('relit la clé enregistrée', async () => {
    const s = await freshStore()
    await s.saveApiKey(SECRET)
    expect(await s.loadApiKey()).toBe(SECRET)
    expect(s.secretStorageKind()).toBe('encrypted')
  })

  it('ne laisse la clé en clair ni dans localStorage ni dans IndexedDB', async () => {
    const s = await freshStore()
    await s.saveApiKey(SECRET)
    expect(localStorage.dump()).not.toContain('SECRET-VALUE')
    const records = await rawRecords()
    expect(records).toHaveLength(2) // clé d'appareil + texte chiffré
    const blob = records.find((r) => r && r.data)
    const bytes = new TextDecoder('latin1').decode(new Uint8Array(blob.data))
    expect(bytes).not.toContain('SECRET-VALUE')
    // la clé d'appareil est non exportable
    const key = records.find((r) => r && r.type === 'secret')
    expect(key.extractable).toBe(false)
  })

  it('survit à un redémarrage (nouveau module, même base)', async () => {
    const s1 = await freshStore()
    await s1.saveApiKey(SECRET)
    const s2 = await freshStore()
    expect(await s2.loadApiKey()).toBe(SECRET)
  })

  it('efface la clé quand le champ est vidé', async () => {
    const s = await freshStore()
    await s.saveApiKey(SECRET)
    await s.saveApiKey('  ')
    expect(await s.loadApiKey()).toBe('')
  })

  it('les écritures rapprochées gardent la dernière valeur', async () => {
    const s = await freshStore()
    s.saveApiKey('sk-a')
    s.saveApiKey('sk-ab')
    await s.saveApiKey('sk-abc')
    expect(await s.loadApiKey()).toBe('sk-abc')
  })

  it('oublie un texte chiffré dont la clé d\'appareil a disparu', async () => {
    const s = await freshStore()
    await s.saveApiKey(SECRET)
    await new Promise((resolve) => {
      const open = indexedDB.open('ticketscope-secrets', 1)
      open.onsuccess = () => {
        const t = open.result.transaction('kv', 'readwrite')
        t.objectStore('kv').delete('device-key')
        t.oncomplete = resolve
      }
    })
    const s2 = await freshStore()
    expect(await s2.loadApiKey()).toBe('')
  })
})

describe('migration depuis les réglages en clair', () => {
  it('chiffre l\'ancienne clé et la retire des réglages (autres champs conservés)', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ engine: 'claude', model: 'claude-haiku-4-5', apiKey: SECRET }))
    const s = await freshStore()
    expect(await s.loadApiKey()).toBe(SECRET)
    const settings = JSON.parse(localStorage.getItem(SETTINGS_KEY))
    expect(settings).toEqual({ engine: 'claude', model: 'claude-haiku-4-5' })
    expect(localStorage.dump()).not.toContain('SECRET-VALUE')
  })

  it('ne fait rien sans ancienne clé', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ engine: 'local' }))
    const s = await freshStore()
    expect(await s.loadApiKey()).toBe('')
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY))).toEqual({ engine: 'local' })
  })
})

describe('mode dégradé (audit P1) : jamais de clé en clair, erreurs propagées', () => {
  const stored = () => localStorage.dump()

  it('sans IndexedDB : saveApiKey échoue, la clé n\'est écrite nulle part', async () => {
    globalThis.indexedDB = undefined
    const s = await freshStore()
    await expect(s.saveApiKey(SECRET)).rejects.toThrow(/mémoire/)
    expect(s.secretStorageKind()).toBe('memory')
    expect(stored()).not.toContain('SECRET-VALUE')
    expect(localStorage.getItem(PLAIN_KEY)).toBeNull()
  })

  it('effacer la clé ne lève pas d\'erreur, même sans IndexedDB', async () => {
    globalThis.indexedDB = undefined
    const s = await freshStore()
    await expect(s.saveApiKey('')).resolves.toBeUndefined()
  })

  it('ancienne clé en clair + chiffrement impossible : conservée telle quelle (kind legacy)', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ engine: 'claude', apiKey: SECRET }))
    globalThis.indexedDB = undefined
    const s = await freshStore()
    expect(await s.loadApiKey()).toBe(SECRET)
    expect(s.secretStorageKind()).toBe('legacy')
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)).apiKey).toBe(SECRET) // pas supprimée
  })

  it('écriture chiffrée impossible (quota) : l\'ancienne clé n\'est pas supprimée', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ engine: 'claude', apiKey: 'sk-ancienne' }))
    const s = await freshStore()
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    await expect(s.saveApiKey(SECRET)).rejects.toThrow()
    expect(s.secretStorageKind()).toBe('memory')
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)).apiKey).toBe('sk-ancienne')
    expect(stored()).not.toContain('SECRET-VALUE')
    spy.mockRestore()
  })

  it('au chargement, une migration qui échoue garde l\'ancienne clé (kind legacy)', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ apiKey: SECRET }))
    const s = await freshStore()
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(await s.loadApiKey()).toBe(SECRET)
    expect(s.secretStorageKind()).toBe('legacy')
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY)).apiKey).toBe(SECRET)
    spy.mockRestore()
  })

  it('une écriture ratée ne bloque pas les suivantes', async () => {
    const s = await freshStore()
    const spy = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    await expect(s.saveApiKey('sk-a')).rejects.toThrow()
    spy.mockRestore()
    await s.saveApiKey(SECRET)
    expect(s.secretStorageKind()).toBe('encrypted')
    expect(await s.loadApiKey()).toBe(SECRET)
  })

  it('réécriture des réglages impossible : la clé est chiffrée, la copie en clair reste (rien n\'est perdu)', async () => {
    const real = globalThis.localStorage
    real.setItem(SETTINGS_KEY, JSON.stringify({ engine: 'claude', apiKey: SECRET }))
    globalThis.localStorage = { ...real, getItem: real.getItem, removeItem: real.removeItem, dump: real.dump, setItem: () => { throw new Error('quota') } }
    const s = await freshStore()
    expect(await s.loadApiKey()).toBe(SECRET)
    expect(JSON.parse(real.getItem(SETTINGS_KEY)).apiKey).toBe(SECRET) // non retirée : réécriture échouée
    expect(s.secretStorageKind()).toBe('encrypted')
  })

  it('migre le repli en clair des versions 2.6-2.7 vers le stockage chiffré', async () => {
    localStorage.setItem(PLAIN_KEY, SECRET)
    const s = await freshStore()
    expect(await s.loadApiKey()).toBe(SECRET)
    expect(localStorage.getItem(PLAIN_KEY)).toBeNull()
    expect(s.secretStorageKind()).toBe('encrypted')
    expect((await rawRecords()).some((r) => r && r.data)).toBe(true)
  })

  it('effacer la clé retire aussi les copies en clair héritées', async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ engine: 'claude', apiKey: SECRET }))
    const s = await freshStore()
    await s.saveApiKey('')
    expect(stored()).not.toContain('SECRET-VALUE')
    expect(JSON.parse(localStorage.getItem(SETTINGS_KEY))).toEqual({ engine: 'claude' })
  })
})
