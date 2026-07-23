// Persistance locale (localStorage) — tickets enregistrés et base apprise.
// Aucune donnée ne quitte l'appareil : conforme à l'usage hors-ligne de la PWA.

import { normalizeStr, uid } from './format.js'

const TICKETS_KEY = 'ticketscope.tickets.v1'
const LEARNED_KEY = 'ticketscope.learned.v1'
const AI_KEY = 'ticketscope.ai.v1'

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

// --- Réglages IA (moteur de lecture, modèle, clé API — locaux à l'appareil) ---
const AI_DEFAULTS = { engine: 'local', model: 'claude-haiku-4-5', apiKey: '' }

export function loadAiSettings() {
  const s = read(AI_KEY, {})
  return { ...AI_DEFAULTS, ...(s && typeof s === 'object' ? s : {}) }
}

export function saveAiSettings(patch) {
  const next = { ...loadAiSettings(), ...patch }
  write(AI_KEY, next)
  return next
}

// --- Export / import de la base apprise (sauvegarde & transfert d'appareil) ---
export function exportLearnedData() {
  return {
    app: 'TicketScope BE',
    type: 'learned-dictionary',
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: loadLearned(),
  }
}

// Fusionne des entrées importées dans la base locale (dédoublonnage par mot-clé).
// Accepte soit l'objet exporté ({ entries: [...] }), soit un tableau brut.
export function mergeLearned(data) {
  const entries = Array.isArray(data) ? data : data && Array.isArray(data.entries) ? data.entries : null
  if (!entries) return { added: 0, updated: 0, skipped: 0, invalid: true }

  const list = loadLearned()
  const byKey = new Map()
  list.forEach((e) => (e.keywords || []).forEach((k) => byKey.set(normalizeStr(k), e)))

  let added = 0
  let updated = 0
  let skipped = 0
  for (const raw of entries) {
    const keywords = Array.isArray(raw && raw.keywords)
      ? raw.keywords.map((k) => normalizeStr(k)).filter(Boolean)
      : []
    if (!raw || !raw.coicop || !keywords.length) {
      skipped += 1
      continue
    }
    const entry = {
      id: raw.id || uid('learn'),
      normalized: raw.normalized || keywords[0],
      brand: raw.brand || '',
      coicop: raw.coicop,
      category: raw.category || 'Divers',
      keywords,
    }
    const existing = byKey.get(keywords[0])
    if (existing) {
      Object.assign(existing, entry, { id: existing.id })
      updated += 1
    } else {
      list.push(entry)
      keywords.forEach((k) => byKey.set(k, entry))
      added += 1
    }
  }
  write(LEARNED_KEY, list)
  return { added, updated, skipped }
}
