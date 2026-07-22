// Persistance locale (localStorage) — tickets enregistrés et base apprise.
// Aucune donnée ne quitte l'appareil : conforme à l'usage hors-ligne de la PWA.

import { normalizeStr, uid } from './format.js'

const TICKETS_KEY = 'ticketscope.tickets.v1'
const LEARNED_KEY = 'ticketscope.learned.v1'

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    console.error('TicketScope: échec de sauvegarde locale', e)
  }
}

// --- Tickets ---
export function loadTickets() {
  const list = read(TICKETS_KEY, [])
  return Array.isArray(list) ? list : []
}

export function saveTicket(ticket) {
  const list = loadTickets()
  const withId = ticket.id ? ticket : { ...ticket, id: uid('tk') }
  const idx = list.findIndex((t) => t.id === withId.id)
  if (idx >= 0) list[idx] = withId
  else list.unshift(withId)
  write(TICKETS_KEY, list)
  return withId
}

export function deleteTicket(id) {
  write(TICKETS_KEY, loadTickets().filter((t) => t.id !== id))
}

export function clearTickets() {
  write(TICKETS_KEY, [])
}

// --- Base apprise (corrections) ---
export function loadLearned() {
  const list = read(LEARNED_KEY, [])
  return Array.isArray(list) ? list : []
}

// Enregistre une correction : le libellé brut -> produit/COICOP corrigés.
// Enrichit la base pour les prochains tickets (auto-apprentissage).
export function learnFromCorrection(rawLabel, correction) {
  if (!rawLabel || !correction || !correction.coicop) return
  const key = normalizeStr(rawLabel)
  if (!key) return
  const list = loadLearned()
  const entry = {
    id: uid('learn'),
    normalized: correction.normalized || rawLabel,
    brand: correction.brand || '',
    coicop: correction.coicop,
    category: correction.category || 'Divers',
    keywords: [key],
  }
  const idx = list.findIndex((e) => (e.keywords || []).includes(key))
  if (idx >= 0) list[idx] = { ...list[idx], ...entry, id: list[idx].id }
  else list.push(entry)
  write(LEARNED_KEY, list)
}

export function clearLearned() {
  write(LEARNED_KEY, [])
}
