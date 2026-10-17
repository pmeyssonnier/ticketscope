import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'

function fakeLocalStorage() {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
}

// Modules neufs sur des stockages vierges (un « appareil »).
async function device() {
  fakeLocalStorage()
  globalThis.indexedDB = new IDBFactory()
  vi.resetModules()
  const [backup, tickets, storage] = await Promise.all([import('./backup.js'), import('./ticketStore.js'), import('./storage.js')])
  return { backup, tickets, storage }
}

const item = (extra = {}) => ({ id: 'i1', raw: 'LAIT', quantity: 1, unitPrice: 1.15, gross: 1.15, discount: 0, net: 1.15, coicop: '01.1.4', ...extra })
const ticket = (id, createdAt, extra = {}) => ({ id, createdAt, store: 'Colruyt', date: '2024-03-12', items: [item()], ...extra })

describe('sauvegarde complète : aller-retour entre deux appareils', () => {
  it('exporte puis restaure tickets et dictionnaire sur un appareil vierge', async () => {
    const a = await device()
    await a.tickets.saveTicket(ticket('t1', '2024-03-12T10:00:00Z'))
    await a.tickets.saveTicket(ticket('t2', '2024-03-13T10:00:00Z', { store: 'Delhaize' }))
    a.storage.mergeLearned([{ normalized: 'Gaufre', coicop: '01.1.8', category: 'Confiserie', keywords: ['gaufre'] }])
    const file = JSON.parse(JSON.stringify(await a.backup.currentBackup('2.6')))
    expect(file).toMatchObject({ type: 'backup', version: 1, appVersion: '2.6' })
    expect(JSON.stringify(file)).not.toMatch(/sk-ant|apiKey/)

    const b = await device()
    const r = await b.backup.importBackup(file)
    expect(r).toMatchObject({ kind: 'backup', ticketsAdded: 2, ticketsPresent: 0, ticketsInvalid: 0 })
    expect(r.learned).toMatchObject({ added: 1 })
    expect((await b.tickets.loadTickets()).map((t) => t.id)).toEqual(['t2', 't1'])
    expect(b.storage.loadLearned()).toHaveLength(1)
  })

  it('ne réécrit pas un ticket déjà présent (modifications locales conservées)', async () => {
    const d = await device()
    await d.tickets.saveTicket(ticket('t1', '2024-03-12T10:00:00Z', { store: 'Modifié ici' }))
    const r = await d.backup.importBackup({ type: 'backup', version: 1, tickets: [ticket('t1', '2024-03-12T10:00:00Z', { store: 'Ancien' })], learned: [] })
    expect(r).toMatchObject({ ticketsAdded: 0, ticketsPresent: 1 })
    expect((await d.tickets.loadTickets())[0].store).toBe('Modifié ici')
  })

  it('importer deux fois la même sauvegarde n\'ajoute rien', async () => {
    const d = await device()
    const file = { type: 'backup', version: 1, tickets: [ticket('t1', '2024-03-12T10:00:00Z')], learned: [] }
    await d.backup.importBackup(file)
    const r = await d.backup.importBackup(file)
    expect(r.ticketsAdded).toBe(0)
    expect(await d.tickets.loadTickets()).toHaveLength(1)
  })
})

describe('formats acceptés', () => {
  it('ancien export JSON des tickets (tableau)', async () => {
    const d = await device()
    const r = await d.backup.importBackup([ticket('t1', '2024-03-12T10:00:00Z')])
    expect(r).toMatchObject({ kind: 'tickets', ticketsAdded: 1 })
  })

  it('export du dictionnaire seul (objet ou tableau)', async () => {
    const d = await device()
    const entry = { normalized: 'Gaufre', coicop: '01.1.8', keywords: ['gaufre'] }
    expect(await d.backup.importBackup({ type: 'learned-dictionary', entries: [entry] })).toMatchObject({ kind: 'learned', learned: { added: 1 } })
    expect(d.backup.parseBackup([entry])).toMatchObject({ kind: 'learned' })
    expect(await d.tickets.loadTickets()).toHaveLength(0)
  })

  it('rejette un fichier étranger', async () => {
    const d = await device()
    expect(await d.backup.importBackup({ foo: 1 })).toEqual({ invalid: true })
    expect(await d.backup.importBackup('texte')).toEqual({ invalid: true })
    expect(d.backup.describeImport({ invalid: true })).toMatch(/non reconnu/)
  })
})

describe('validation des tickets importés', () => {
  it('ignore les éléments invalides et force les nombres', async () => {
    const d = await device()
    const bad = [null, 'x', { id: 'a' }, { id: 'b', items: 'pas un tableau' }]
    const messy = ticket('t9', '2024-03-12T10:00:00Z', { items: [item({ quantity: '2', unitPrice: '1,5', net: 'abc' })] })
    const r = await d.backup.importBackup({ type: 'backup', tickets: [...bad, messy] })
    expect(r).toMatchObject({ ticketsAdded: 1, ticketsInvalid: 4 })
    const [saved] = await d.tickets.loadTickets()
    expect(saved.items[0]).toMatchObject({ quantity: 2, unitPrice: 0, net: 0 })
    expect(typeof saved.items[0].unitPrice).toBe('number')
  })

  it('attribue un id, une date de création et des valeurs par défaut', async () => {
    const d = await device()
    await d.backup.importBackup([{ items: [] }])
    const [t] = await d.tickets.loadTickets()
    expect(t.id).toMatch(/^tk_/)
    expect(t.createdAt).toBeTruthy()
    expect(t).toMatchObject({ store: '', date: null })
  })

  it('décrit le résultat', async () => {
    const d = await device()
    const r = await d.backup.importBackup({ type: 'backup', tickets: [ticket('t1', '2024-03-12T10:00:00Z'), { x: 1 }], learned: [] })
    expect(d.backup.describeImport(r)).toBe('✓ Import terminé : 1 ticket(s) ajouté(s), 1 ignoré(s) (format invalide).')
  })
})

describe('nom de fichier', () => {
  it('contient la date', async () => {
    const d = await device()
    expect(d.backup.backupFilename(new Date('2026-10-17T12:00:00Z'))).toBe('ticketscope-sauvegarde-2026-10-17.json')
  })
})
