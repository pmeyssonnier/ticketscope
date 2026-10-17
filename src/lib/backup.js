// Sauvegarde complète : tickets enregistrés + dictionnaire appris dans un seul
// fichier JSON, pour changer d'appareil ou se prémunir d'une perte de données.
// Ne contient JAMAIS la clé API Anthropic ni les réglages.
//
// L'import accepte :
//   - une sauvegarde complète (`type: 'backup'`) ;
//   - l'ancien export JSON des tickets (tableau de tickets) ;
//   - l'export du dictionnaire appris (`learned-dictionary` ou tableau d'entrées).
// Les tickets déjà présents (même id) ne sont jamais écrasés.

import { uid } from './format.js'
import { loadTickets, saveTicket } from './ticketStore.js'
import { loadLearned, mergeLearned } from './storage.js'

export const BACKUP_VERSION = 1

export function buildBackup({ tickets, learned, appVersion = '' }) {
  return {
    app: 'TicketScope BE',
    type: 'backup',
    version: BACKUP_VERSION,
    appVersion,
    exportedAt: new Date().toISOString(),
    tickets: tickets || [],
    learned: learned || [],
  }
}

export async function currentBackup(appVersion) {
  return buildBackup({ tickets: await loadTickets(), learned: loadLearned(), appVersion })
}

export function backupFilename(date = new Date()) {
  return `ticketscope-sauvegarde-${date.toISOString().slice(0, 10)}.json`
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)

// Ticket valide = objet avec un tableau `items`. Les champs numériques sont
// forcés en nombres (dashboard, exports et comparaison font de l'arithmétique).
export function sanitizeTicket(t) {
  if (!isObj(t) || !Array.isArray(t.items)) return null
  const items = t.items.filter(isObj).map((it) => ({
    ...it,
    id: typeof it.id === 'string' && it.id ? it.id : uid('it'),
    quantity: num(it.quantity),
    unitPrice: num(it.unitPrice),
    gross: num(it.gross),
    discount: num(it.discount),
    net: num(it.net),
  }))
  return {
    ...t,
    id: typeof t.id === 'string' && t.id ? t.id : uid('tk'),
    store: typeof t.store === 'string' ? t.store : '',
    date: typeof t.date === 'string' ? t.date : null,
    createdAt: typeof t.createdAt === 'string' ? t.createdAt : new Date().toISOString(),
    items,
  }
}

const looksLikeLearnedEntry = (e) => isObj(e) && Array.isArray(e.keywords) && !('items' in e)

// Reconnaît le contenu d'un fichier JSON : { kind, tickets?, learned? } ou { invalid: true }.
export function parseBackup(data) {
  if (Array.isArray(data)) {
    if (data.length && data.every(looksLikeLearnedEntry)) return { kind: 'learned', learned: data }
    return { kind: 'tickets', tickets: data, learned: [] }
  }
  if (isObj(data) && data.type === 'backup' && Array.isArray(data.tickets)) {
    return { kind: 'backup', tickets: data.tickets, learned: Array.isArray(data.learned) ? data.learned : [] }
  }
  if (isObj(data) && Array.isArray(data.entries)) {
    return { kind: 'learned', learned: data.entries }
  }
  return { invalid: true }
}

// Applique le contenu d'un fichier. Renvoie les compteurs pour l'affichage.
export async function importBackup(data) {
  const parsed = parseBackup(data)
  if (parsed.invalid) return { invalid: true }

  const result = { kind: parsed.kind, ticketsAdded: 0, ticketsPresent: 0, ticketsInvalid: 0, learned: null }

  if (parsed.tickets) {
    const existing = new Set((await loadTickets()).map((t) => t.id))
    for (const raw of parsed.tickets) {
      const ticket = sanitizeTicket(raw)
      if (!ticket) {
        result.ticketsInvalid += 1
      } else if (existing.has(ticket.id)) {
        result.ticketsPresent += 1
      } else {
        await saveTicket(ticket)
        existing.add(ticket.id)
        result.ticketsAdded += 1
      }
    }
  }
  if (parsed.learned && parsed.learned.length) {
    result.learned = mergeLearned(parsed.learned)
  }
  return result
}

export function describeImport(r) {
  if (r.invalid) return '❌ Fichier non reconnu (ce n’est pas une sauvegarde ou un export TicketScope).'
  const parts = []
  if (r.kind !== 'learned') {
    parts.push(`${r.ticketsAdded} ticket(s) ajouté(s)`)
    if (r.ticketsPresent) parts.push(`${r.ticketsPresent} déjà présent(s)`)
    if (r.ticketsInvalid) parts.push(`${r.ticketsInvalid} ignoré(s) (format invalide)`)
  }
  if (r.learned) parts.push(`dictionnaire : ${r.learned.added} ajout(s), ${r.learned.updated} mise(s) à jour`)
  return `✓ Import terminé : ${parts.join(', ')}.`
}
