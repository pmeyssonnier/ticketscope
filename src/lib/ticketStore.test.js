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
