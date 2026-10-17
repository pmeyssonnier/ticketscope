// Stockage des tickets enregistrés : IndexedDB (plusieurs centaines de Mo,
// écritures par ticket) avec repli sur localStorage si IndexedDB est
// indisponible (navigation privée, navigateur restreint…).
//
// Migration automatique : les tickets de l'ancien stockage localStorage
// (`ticketscope.tickets.v1`) sont copiés dans IndexedDB au premier lancement,
// puis la clé historique est supprimée — seulement une fois la copie réussie.

import { uid } from './format.js'

const DB_NAME = 'ticketscope'
const DB_VERSION = 1
const STORE = 'tickets'
const LEGACY_KEY = 'ticketscope.tickets.v1'

// --- localStorage (historique + repli) ---
function lsRead() {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function lsWrite(list) {
  try {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(list))
  } catch (e) {
    console.error('TicketScope: échec de sauvegarde locale', e)
    throw e
  }
}

const lsBackend = {
  kind: 'localStorage',
  async all() {
    return lsRead()
  },
  async put(ticket) {
    const list = lsRead()
    const i = list.findIndex((t) => t.id === ticket.id)
    if (i >= 0) list[i] = ticket
    else list.unshift(ticket)
    lsWrite(list)
  },
  async del(id) {
    lsWrite(lsRead().filter((t) => t.id !== id))
  },
  async clear() {
    lsWrite([])
  },
}

// --- IndexedDB ---
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('IndexedDB bloquée'))
  })
}

// Exécute `fn(store)` dans une transaction et résout avec son résultat une fois
// la transaction validée.
function run(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    let req
    try {
      req = fn(t.objectStore(STORE))
    } catch (e) {
      reject(e)
      return
    }
    t.oncomplete = () => resolve(req ? req.result : undefined)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error || new Error('Transaction annulée'))
  })
}

// Plus récent d'abord (ordre historique : dernier enregistré en tête).
const byNewest = (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))

function idbBackend(db) {
  return {
    kind: 'indexedDB',
    async all() {
      const list = await run(db, 'readonly', (s) => s.getAll())
      return list.sort(byNewest)
    },
    async put(ticket) {
      await run(db, 'readwrite', (s) => s.put(ticket))
    },
    async del(id) {
      await run(db, 'readwrite', (s) => s.delete(id))
    },
    async clear() {
      await run(db, 'readwrite', (s) => s.clear())
    },
  }
}

// Copie les tickets de l'ancien stockage vers IndexedDB. Les tickets sans date
// de création reçoivent des dates décroissantes pour garder l'ordre d'origine.
async function migrateLegacy(db) {
  const legacy = lsRead()
  if (!legacy.length) return
  const base = Date.now()
  const migrated = legacy.map((t, i) => ({
    ...t,
    id: t.id || uid('tk'),
    createdAt: t.createdAt || new Date(base - i * 1000).toISOString(),
  }))
  await run(db, 'readwrite', (s) => {
    migrated.forEach((t) => s.put(t))
  })
  try {
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    /* sans importance : la copie est faite */
  }
}

let backendPromise = null

function getBackend() {
  if (!backendPromise) {
    backendPromise = (async () => {
      if (typeof indexedDB === 'undefined') return lsBackend
      try {
        const db = await openDb()
        await migrateLegacy(db)
        // Demande un stockage durable (non purgé en cas de manque d'espace).
        navigator.storage?.persist?.().catch(() => {})
        return idbBackend(db)
      } catch (e) {
        console.warn('TicketScope: IndexedDB indisponible, repli sur localStorage', e)
        return lsBackend
      }
    })()
  }
  return backendPromise
}

// Pour les tests : oublie le moteur choisi.
export function _resetTicketStore() {
  backendPromise = null
}

export async function storageKind() {
  return (await getBackend()).kind
}

export async function loadTickets() {
  return (await getBackend()).all()
}

export async function saveTicket(ticket) {
  const withId = ticket.id ? ticket : { ...ticket, id: uid('tk') }
  await (await getBackend()).put(withId)
  return withId
}

export async function deleteTicket(id) {
  await (await getBackend()).del(id)
}

export async function clearTickets() {
  await (await getBackend()).clear()
}
