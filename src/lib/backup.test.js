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

describe('validation stricte (audit P1)', () => {
  const entry = (extra = {}) => item({ id: 'i1', ...extra })

  it('planImport n\'écrit rien', async () => {
    const d = await device()
    const plan = await d.backup.planImport({ type: 'backup', tickets: [ticket('t1', '2024-03-12T10:00:00Z')], learned: [{ normalized: 'G', coicop: '01.1.8', keywords: ['gaufre'] }] })
    expect(plan.toAdd).toHaveLength(1)
    expect(await d.tickets.loadTickets()).toEqual([])
    expect(d.storage.loadLearned()).toEqual([])
    await d.backup.applyImport(plan)
    expect(await d.tickets.loadTickets()).toHaveLength(1)
  })

  it('rejette les valeurs impossibles au lieu de les remplacer par 0', async () => {
    const d = await device()
    const bad = [
      ticket('a', '2024-03-12T10:00:00Z', { items: [entry({ quantity: '2' })] }), // nombre en texte
      ticket('b', '2024-03-12T10:00:00Z', { items: [entry({ net: null })] }),
      ticket('c', '2024-03-12T10:00:00Z', { items: [entry({ unitPrice: Number.NaN })] }),
      ticket('d', '2024-03-12T10:00:00Z', { items: [entry({ quantity: -1 })] }),
      ticket('e', '2024-03-12T10:00:00Z', { items: [entry({ confidence: 3 })] }),
      ticket('f', '2024-03-12T10:00:00Z', { date: '2024-02-31' }),
      ticket('g', 'pas une date'),
      ticket('h', '2024-03-12T10:00:00Z', { items: 'pas un tableau' }),
      ticket('', '2024-03-12T10:00:00Z'),
      { items: [] }, // sans id
      null,
      'texte',
    ]
    const plan = await d.backup.planImport({ type: 'backup', tickets: bad })
    expect(plan.toAdd).toHaveLength(0)
    expect(plan.rejected).toHaveLength(bad.length)
    const reasons = plan.rejected.map((r) => r.reasons.join(' '))
    expect(reasons[0]).toMatch(/quantity invalide/)
    expect(reasons[1]).toMatch(/net invalide/)
    expect(reasons[3]).toMatch(/quantité négative/)
    expect(reasons[4]).toMatch(/confiance/)
    expect(reasons[5]).toMatch(/date invalide/)
    expect(reasons[6]).toMatch(/création invalide/)
    expect(reasons[8]).toMatch(/identifiant manquant/)
    const res = await d.backup.importBackup({ type: 'backup', tickets: bad })
    expect(res).toMatchObject({ ticketsAdded: 0, ticketsInvalid: bad.length })
    expect(await d.tickets.loadTickets()).toEqual([])
  })

  it('accepte un ticket à relire (calcul incohérent) avec un avertissement', async () => {
    const d = await device()
    const t = ticket('t1', '2024-03-12T10:00:00Z', { items: [entry({ gross: 9, net: 1 })] })
    const plan = await d.backup.planImport([t])
    expect(plan.toAdd).toHaveLength(1)
    expect(plan.warnings[0].notes.join(' ')).toMatch(/brut ≠ quantité × prix unitaire/)
    expect(plan.warnings[0].notes.join(' ')).toMatch(/net ≠ brut \+ remise/)
  })

  it('signale une date de création absente et la remplace par l\'import', async () => {
    const d = await device()
    const { createdAt, ...noDate } = ticket('t1', 'x') // eslint-disable-line no-unused-vars
    const plan = await d.backup.planImport([noDate])
    expect(plan.toAdd[0].createdAt).toBeTruthy()
    expect(plan.warnings[0].notes.join(' ')).toMatch(/date de création absente/)
  })

  it('ne conserve que les champs connus (liste blanche)', async () => {
    const d = await device()
    const t = JSON.parse('{"id":"t1","createdAt":"2024-03-12T10:00:00Z","store":"S","items":[{"id":"i","quantity":1,"unitPrice":1,"gross":1,"discount":0,"net":1,"evil":"x","__proto__":{"polluted":true}}],"__proto__":{"polluted":true},"extra":{"a":1}}')
    const plan = await d.backup.planImport([t])
    const out = plan.toAdd[0]
    expect(Object.keys(out).sort()).toEqual(['createdAt', 'date', 'id', 'items', 'store'])
    expect(Object.keys(out.items[0]).sort()).toEqual(['coicop', 'discount', 'gross', 'id', 'net', 'quantity', 'unitPrice'])
    expect({}.polluted).toBeUndefined()
  })

  it('un identifiant en double dans le fichier n\'est importé qu\'une fois', async () => {
    const d = await device()
    const plan = await d.backup.planImport([ticket('t1', '2024-03-12T10:00:00Z'), ticket('t1', '2024-03-12T10:00:00Z')])
    expect(plan.toAdd).toHaveLength(1)
    expect(plan.present).toHaveLength(1)
  })

  it('refuse un fichier trop volumineux', async () => {
    const d = await device()
    const many = Array.from({ length: d.backup.LIMITS.tickets + 1 }, (_, i) => ticket(`t${i}`, '2024-03-12T10:00:00Z'))
    const plan = await d.backup.planImport(many)
    expect(plan.invalid).toBe(true)
    expect(d.backup.describePlan(plan)).toMatch(/trop de tickets/)
    const tooManyItems = ticket('big', '2024-03-12T10:00:00Z', { items: Array.from({ length: d.backup.LIMITS.itemsPerTicket + 1 }, () => entry()) })
    expect((await d.backup.planImport([tooManyItems])).rejected[0].reasons.join(' ')).toMatch(/trop de lignes/)
  })

  it('valide les entrées du dictionnaire', async () => {
    const d = await device()
    const plan = await d.backup.planImport({ type: 'learned-dictionary', entries: [
      { normalized: 'ok', coicop: '01.1.8', keywords: ['gaufre'] },
      { normalized: 'sans coicop', keywords: ['x'] },
      { normalized: 'mots-clés invalides', coicop: '01.1.8', keywords: [1, 2] },
      { normalized: 'vide', coicop: '01.1.8', keywords: [] },
    ] })
    expect(plan.learned).toHaveLength(1)
    expect(plan.learnedRejected).toBe(3)
  })

  it('décrit le plan et le résultat', async () => {
    const d = await device()
    const plan = await d.backup.planImport({ type: 'backup', tickets: [ticket('t1', '2024-03-12T10:00:00Z'), { x: 1 }], learned: [] })
    expect(d.backup.describePlan(plan)).toBe('1 ticket à ajouter · 1 rejeté(s)')
    const r = await d.backup.applyImport(plan)
    expect(d.backup.describeImport(r)).toBe('✓ Import terminé : 1 ticket(s) ajouté(s), 1 rejeté(s).')
  })

  it('les tickets réellement enregistrés par l\'application sont acceptés tels quels', async () => {
    const d = await device()
    const real = {
      id: 'tk_abc', createdAt: '2026-10-17T13:00:00.000Z', engine: 'ia', store: 'Celio', date: '2026-10-17',
      items: [{ id: 'it_1', raw: 'NIWOBIBOUP', normalized: 'Boxer', brand: '', format: '', quantity: 1, unitPrice: 7.99, gross: 7.99, discount: 0, net: 7.99, coicop: '03.1.2', coicopLabel: 'Vêtements', category: 'Vêtements', confidence: 0.9, source: 'ia', needsReview: false }],
      globalDiscountTotal: 0, subtotalDeclared: null, totalDeclared: 7.99, totalNet: 7.99,
    }
    const plan = await d.backup.planImport([real])
    expect(plan.rejected).toEqual([])
    expect(plan.warnings).toEqual([])
    expect(plan.toAdd[0]).toEqual(real)
  })
})

describe('nom de fichier', () => {
  it('contient la date', async () => {
    const d = await device()
    expect(d.backup.backupFilename(new Date('2026-10-17T12:00:00Z'))).toBe('ticketscope-sauvegarde-2026-10-17.json')
  })
})
