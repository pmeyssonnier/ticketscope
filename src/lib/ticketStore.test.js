import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'

const LEGACY_KEY = 'ticketscope.tickets.v1'

function fakeLocalStorage() {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
}

// Module neuf (moteur de stockage re-choisi) sur une base IndexedDB vierge.
async function freshStore() {
  globalThis.indexedDB = new IDBFactory()
  vi.resetModules()
  return import('./ticketStore.js')
}

const ticket = (id, createdAt, extra = {}) => ({ id, createdAt, store: 'S', items: [], ...extra })

beforeEach(() => {
  fakeLocalStorage()
})

describe('ticketStore (IndexedDB)', () => {
  it('enregistre, relit (plus récent d’abord), met à jour et supprime', async () => {
    const s = await freshStore()
    expect(await s.storageKind()).toBe('indexedDB')
    await s.saveTicket(ticket('a', '2024-01-01T10:00:00Z'))
    await s.saveTicket(ticket('b', '2024-02-01T10:00:00Z'))
    expect((await s.loadTickets()).map((t) => t.id)).toEqual(['b', 'a'])

    await s.saveTicket(ticket('a', '2024-01-01T10:00:00Z', { store: 'Modifié' }))
    const list = await s.loadTickets()
    expect(list).toHaveLength(2)
    expect(list.find((t) => t.id === 'a').store).toBe('Modifié')

    await s.deleteTicket('b')
    expect((await s.loadTickets()).map((t) => t.id)).toEqual(['a'])
    await s.clearTickets()
    expect(await s.loadTickets()).toEqual([])
  })

  it('attribue un id à un ticket sans id', async () => {
    const s = await freshStore()
    const saved = await s.saveTicket({ store: 'X', items: [] })
    expect(saved.id).toMatch(/^tk_/)
    expect(await s.loadTickets()).toHaveLength(1)
  })

  it('persiste entre deux ouvertures de la base', async () => {
    const s1 = await freshStore()
    await s1.saveTicket(ticket('a', '2024-01-01T10:00:00Z'))
    vi.resetModules() // même base, nouveau moteur
    const s2 = await import('./ticketStore.js')
    expect((await s2.loadTickets()).map((t) => t.id)).toEqual(['a'])
  })
})

describe('migration depuis localStorage', () => {
  it('copie les tickets, garde leur ordre et supprime l’ancienne clé', async () => {
    // Ancien format : le plus récent en tête, parfois sans createdAt.
    localStorage.setItem(LEGACY_KEY, JSON.stringify([{ id: 'new', store: 'N', items: [] }, { id: 'old', store: 'O', items: [] }]))
    const s = await freshStore()
    const list = await s.loadTickets()
    expect(list.map((t) => t.id)).toEqual(['new', 'old'])
    expect(list.every((t) => t.createdAt)).toBe(true)
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
  })

  it('ne migre rien (et ne plante pas) sans données historiques', async () => {
    const s = await freshStore()
    expect(await s.loadTickets()).toEqual([])
  })
})

describe('repli sans IndexedDB', () => {
  it('utilise localStorage', async () => {
    vi.resetModules()
    globalThis.indexedDB = undefined
    const s = await import('./ticketStore.js')
    expect(await s.storageKind()).toBe('localStorage')
    await s.saveTicket(ticket('a', '2024-01-01T10:00:00Z'))
    await s.saveTicket(ticket('b', '2024-02-01T10:00:00Z'))
    expect((await s.loadTickets()).map((t) => t.id)).toEqual(['b', 'a'])
    await s.deleteTicket('a')
    expect((await s.loadTickets()).map((t) => t.id)).toEqual(['b'])
  })
})

describe('migration idempotente (audit P1)', () => {
  const legacyList = () => [
    { id: 't1', createdAt: '2024-01-01T00:00:00Z', store: 'ANCIEN', items: [] },
    { id: 't2', createdAt: '2024-01-02T00:00:00Z', store: 'DEUX', items: [] },
  ]

  // localStorage dont removeItem(clé historique) échoue sans bruit.
  function lsWithFailingRemoval() {
    const store = new Map()
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: () => {},
    }
    store.set(LEGACY_KEY, JSON.stringify(legacyList()))
  }

  async function relaunch() {
    vi.resetModules() // même IndexedDB et même localStorage, nouveau moteur
    return import('./ticketStore.js')
  }

  it('une relance après échec de suppression ne recopie rien', async () => {
    lsWithFailingRemoval()
    let s = await freshStore()
    expect((await s.loadTickets()).map((t) => t.id)).toEqual(['t2', 't1'])

    await s.saveTicket({ id: 't1', createdAt: '2024-01-01T00:00:00Z', store: 'MODIFIÉ', items: [] }) // modifié
    await s.deleteTicket('t2') // supprimé

    s = await relaunch()
    const list = await s.loadTickets()
    expect(list.map((t) => `${t.id}:${t.store}`)).toEqual(['t1:MODIFIÉ'])
  })

  it('sans marqueur, un ticket déjà présent n\'est jamais écrasé', async () => {
    const s0 = await freshStore()
    await s0.saveTicket({ id: 't1', createdAt: '2024-01-01T00:00:00Z', store: 'LOCAL', items: [] })
    localStorage.setItem(LEGACY_KEY, JSON.stringify(legacyList()))
    const s = await relaunch()
    const list = await s.loadTickets()
    expect(list.find((t) => t.id === 't1').store).toBe('LOCAL')
    expect(list.map((t) => t.id).sort()).toEqual(['t1', 't2']) // t2 est bien ajouté
  })

  it('nettoie la clé historique à la relance quand le marqueur est posé', async () => {
    const s0 = await freshStore()
    localStorage.setItem(LEGACY_KEY, JSON.stringify(legacyList()))
    await relaunch().then((s) => s.loadTickets())
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
    localStorage.setItem(LEGACY_KEY, JSON.stringify(legacyList())) // résidu
    expect(s0).toBeTruthy()
    const s = await relaunch()
    expect((await s.loadTickets()).map((t) => t.id).sort()).toEqual(['t1', 't2']) // pas de doublon
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull()
  })
})

describe('ancien code COICOP 02.1.2 « Boissons sans alcool » (ticketStore)', () => {
  it('migré à la lecture vers 01.2.9, à confirmer, avec l\'ancien code conservé', async () => {
    const s = await freshStore()
    const items = [
      { id: 'i1', raw: 'COCA', coicop: '02.1.2', coicopLabel: 'Boissons sans alcool', needsReview: false },
      { id: 'i2', raw: 'VIN', coicop: '02.1.2', coicopLabel: 'Vin', needsReview: false },
    ]
    await s.saveTicket(ticket('a', '2024-01-01T10:00:00Z', { items }))
    const [t] = await s.loadTickets()
    expect(t.items[0]).toMatchObject({ coicop: '01.2.9', coicopLegacy: '02.1.2', needsReview: true })
    expect(t.items[1]).toMatchObject({ coicop: '02.1.2', needsReview: false })
  })
})

