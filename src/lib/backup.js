// Sauvegarde complète : tickets enregistrés + dictionnaire appris dans un seul
// fichier JSON, pour changer d'appareil ou se prémunir d'une perte de données.
// Ne contient JAMAIS la clé API Anthropic ni les réglages.
//
// L'import accepte :
//   - une sauvegarde complète (`type: 'backup'`) ;
//   - l'ancien export JSON des tickets (tableau de tickets) ;
//   - l'export du dictionnaire appris (`learned-dictionary` ou tableau d'entrées).
// Les tickets déjà présents (même id) ne sont jamais écrasés.
//
// Import en deux temps : `planImport` valide STRICTEMENT le fichier sans rien
// écrire (anomalies listées, valeurs impossibles rejetées plutôt que corrigées
// en silence), puis `applyImport` n'écrit qu'après confirmation de l'utilisateur.

import { loadTickets, saveTicket } from './ticketStore.js'
import { loadLearned, mergeLearned } from './storage.js'
import { isKnownCoicop, migrateLegacyCoicop } from '../data/coicop.js'

export const BACKUP_VERSION = 1
export const REMINDER_DAYS = 30

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

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v)
const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
const isStr = (v) => typeof v === 'string'

export const LIMITS = { tickets: 5000, itemsPerTicket: 1000 }

function isIsoDate(s) {
  if (!isStr(s) || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

// Champs conservés (liste blanche) : tout le reste est ignoré.
const TICKET_FIELDS = ['engine', 'rawText', 'globalDiscountTotal', 'subtotalDeclared', 'totalDeclared', 'totalNet']
const ITEM_TEXT = ['raw', 'normalized', 'brand', 'format', 'category', 'coicopLabel', 'source', 'coicopLegacy']
const ITEM_FLAGS = ['needsReview', 'corrected', 'manual']
const AMOUNT_TOLERANCE = 0.02

// Valide un ticket importé. Renvoie { ticket, warnings } ou { errors }.
//  - erreurs  : valeur impossible ou format inattendu -> le ticket est REJETÉ ;
//  - warnings : ticket accepté mais à relire (ex. calcul de ligne incohérent).
export function validateTicket(raw) {
  const errors = []
  const warnings = []
  if (!isObj(raw)) return { errors: ['ce n’est pas un ticket (objet attendu)'] }
  if (!isStr(raw.id) || !raw.id) errors.push('identifiant manquant')
  if (!Array.isArray(raw.items)) errors.push('liste de lignes manquante')
  if (raw.store !== undefined && !isStr(raw.store)) errors.push('enseigne invalide')
  if (raw.date != null && raw.date !== '' && !isIsoDate(raw.date)) errors.push(`date invalide (${JSON.stringify(raw.date)})`)
  if (raw.createdAt !== undefined && (!isStr(raw.createdAt) || Number.isNaN(Date.parse(raw.createdAt)))) {
    errors.push('date de création invalide')
  }
  if (Array.isArray(raw.items) && raw.items.length > LIMITS.itemsPerTicket) {
    errors.push(`trop de lignes (${raw.items.length} > ${LIMITS.itemsPerTicket})`)
  }
  for (const f of ['globalDiscountTotal', 'subtotalDeclared', 'totalDeclared', 'totalNet']) {
    if (raw[f] != null && !isNum(raw[f])) errors.push(`${f} non numérique`)
  }
  if (errors.length) return { errors }

  const items = []
  raw.items.forEach((it, i) => {
    const n = i + 1
    if (!isObj(it)) {
      errors.push(`ligne ${n} : objet attendu`)
      return
    }
    for (const f of ['quantity', 'unitPrice', 'gross', 'discount', 'net']) {
      if (!isNum(it[f])) errors.push(`ligne ${n} : ${f} ${it[f] === undefined ? 'manquant' : `invalide (${JSON.stringify(it[f])})`}`)
    }
    if (isNum(it.quantity) && it.quantity < 0) errors.push(`ligne ${n} : quantité négative`)
    for (const f of ITEM_TEXT) if (it[f] != null && !isStr(it[f])) errors.push(`ligne ${n} : ${f} invalide`)
    if (it.coicop != null && !isStr(it.coicop)) errors.push(`ligne ${n} : code COICOP invalide`)
    if (isStr(it.coicop) && it.coicop && !isKnownCoicop(it.coicop)) {
      warnings.push(`ligne ${n} : code COICOP « ${it.coicop} » inconnu du référentiel (conservé tel quel)`)
    }
    if (it.confidence != null && !(isNum(it.confidence) && it.confidence >= 0 && it.confidence <= 1)) {
      errors.push(`ligne ${n} : confiance hors de [0 ; 1]`)
    }
    if (it.readConfidence != null && !(isNum(it.readConfidence) && it.readConfidence >= 0 && it.readConfidence <= 1)) {
      errors.push(`ligne ${n} : confiance de lecture hors de [0 ; 1]`)
    }
    if (errors.length) return
    if (Math.abs(it.gross - it.quantity * it.unitPrice) > AMOUNT_TOLERANCE) {
      warnings.push(`ligne ${n} : brut ≠ quantité × prix unitaire`)
    }
    if (Math.abs(it.net - (it.gross + it.discount)) > AMOUNT_TOLERANCE) {
      warnings.push(`ligne ${n} : net ≠ brut + remise`)
    }
    const clean = { id: isStr(it.id) && it.id ? it.id : `${raw.id}_l${n}` }
    for (const f of ITEM_TEXT) if (isStr(it[f])) clean[f] = it[f]
    for (const f of ['quantity', 'unitPrice', 'gross', 'discount', 'net']) clean[f] = it[f]
    clean.coicop = isStr(it.coicop) && it.coicop ? it.coicop : null
    if (isNum(it.confidence)) clean.confidence = it.confidence
    if (it.readConfidence === null || isNum(it.readConfidence)) clean.readConfidence = it.readConfidence
    for (const f of ITEM_FLAGS) if (typeof it[f] === 'boolean') clean[f] = it[f]
    const migrated = migrateLegacyCoicop(clean)
    if (migrated !== clean) {
      warnings.push(`ligne ${n} : code COICOP ${clean.coicop} (ancien sens « ${clean.coicopLabel} ») remplacé par ${migrated.coicop}, à confirmer`)
    }
    items.push(migrated)
  })
  if (errors.length) return { errors: errors.slice(0, 5).concat(errors.length > 5 ? [`… et ${errors.length - 5} autre(s)`] : []) }

  const ticket = { id: raw.id, store: raw.store || '', date: raw.date || null, items }
  if (raw.createdAt) ticket.createdAt = raw.createdAt
  else {
    ticket.createdAt = new Date().toISOString()
    warnings.push('date de création absente (remplacée par la date d’import)')
  }
  for (const f of TICKET_FIELDS) if (raw[f] !== undefined) ticket[f] = raw[f]
  return { ticket, warnings }
}

// Entrée du dictionnaire appris : code COICOP et mots-clés texte obligatoires.
export function isValidLearnedEntry(e) {
  return (
    isObj(e) &&
    isStr(e.coicop) &&
    !!e.coicop &&
    Array.isArray(e.keywords) &&
    e.keywords.length > 0 &&
    e.keywords.every((k) => isStr(k))
  )
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

const labelOf = (raw, index) => {
  const store = isObj(raw) && isStr(raw.store) && raw.store ? raw.store : 'sans enseigne'
  const date = isObj(raw) && isStr(raw.date) && raw.date ? ` du ${raw.date}` : ''
  return `#${index + 1} (${store}${date})`
}

// ÉTAPE 1 — analyse sans écriture. Renvoie le plan à présenter à l'utilisateur.
export async function planImport(data) {
  const parsed = parseBackup(data)
  if (parsed.invalid) return { invalid: true }

  const plan = {
    kind: parsed.kind,
    toAdd: [], // tickets valides et absents
    present: [], // déjà dans l'appareil (même id) : ignorés
    rejected: [], // { label, reasons }
    warnings: [], // { label, notes }
    learned: [], // entrées de dictionnaire valides
    learnedRejected: 0,
  }

  if (parsed.tickets) {
    if (parsed.tickets.length > LIMITS.tickets) {
      return { invalid: true, reason: `trop de tickets (${parsed.tickets.length} > ${LIMITS.tickets})` }
    }
    const existing = new Set((await loadTickets()).map((t) => t.id))
    const seen = new Set()
    parsed.tickets.forEach((raw, index) => {
      const label = labelOf(raw, index)
      const res = validateTicket(raw)
      if (res.errors) {
        plan.rejected.push({ label, reasons: res.errors })
        return
      }
      if (existing.has(res.ticket.id) || seen.has(res.ticket.id)) {
        plan.present.push({ label })
        return
      }
      seen.add(res.ticket.id)
      plan.toAdd.push(res.ticket)
      if (res.warnings.length) plan.warnings.push({ label, notes: res.warnings })
    })
  }
  for (const e of parsed.learned || []) {
    if (isValidLearnedEntry(e)) plan.learned.push(e)
    else plan.learnedRejected += 1
  }
  return plan
}

// ÉTAPE 2 — écriture, après confirmation. N'importe que ce que le plan a validé.
export async function applyImport(plan) {
  const result = { kind: plan.kind, ticketsAdded: 0, ticketsPresent: plan.present.length, ticketsInvalid: plan.rejected.length, learned: null }
  for (const ticket of plan.toAdd) {
    await saveTicket(ticket)
    result.ticketsAdded += 1
  }
  if (plan.learned.length) result.learned = mergeLearned(plan.learned)
  return result
}

// Raccourci sans confirmation (tests, scripts) : analyse puis applique.
export async function importBackup(data) {
  const plan = await planImport(data)
  if (plan.invalid) return { invalid: true }
  return applyImport(plan)
}

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`

// Texte de synthèse d'un plan (aperçu avant confirmation).
export function describePlan(plan) {
  if (plan.invalid) return plan.reason ? `❌ Fichier refusé : ${plan.reason}.` : '❌ Fichier non reconnu (ce n’est pas une sauvegarde ou un export TicketScope).'
  const parts = []
  if (plan.kind !== 'learned') {
    parts.push(`${plural(plan.toAdd.length, 'ticket')} à ajouter`)
    if (plan.present.length) parts.push(`${plan.present.length} déjà présent(s), ignoré(s)`)
    if (plan.rejected.length) parts.push(`${plan.rejected.length} rejeté(s)`)
  }
  if (plan.learned.length || plan.learnedRejected) {
    parts.push(`dictionnaire : ${plan.learned.length} entrée(s)` + (plan.learnedRejected ? `, ${plan.learnedRejected} rejetée(s)` : ''))
  }
  return parts.join(' · ')
}

export function describeImport(r) {
  if (r.invalid) return '❌ Fichier non reconnu (ce n’est pas une sauvegarde ou un export TicketScope).'
  const parts = []
  if (r.kind !== 'learned') {
    parts.push(`${r.ticketsAdded} ticket(s) ajouté(s)`)
    if (r.ticketsPresent) parts.push(`${r.ticketsPresent} déjà présent(s)`)
    if (r.ticketsInvalid) parts.push(`${r.ticketsInvalid} rejeté(s)`)
  }
  if (r.learned) parts.push(`dictionnaire : ${r.learned.added} ajout(s), ${r.learned.updated} mise(s) à jour`)
  return `✓ Import terminé : ${parts.join(', ')}.`
}

// Rappel de sauvegarde (les sauvegardes sont manuelles : les données vivent dans
// le navigateur et peuvent disparaître). Renvoie null s'il n'y a rien à protéger,
// sinon { level: 'ok' | 'warn', text }.
export function backupReminder(lastIso, ticketCount, now = new Date()) {
  if (!ticketCount) return null
  const last = lastIso ? Date.parse(lastIso) : NaN
  if (Number.isNaN(last)) {
    return { level: 'warn', text: `Aucune sauvegarde exportée depuis cet appareil : vos ${ticketCount} ticket(s) n'existent que dans ce navigateur. Pensez à sauvegarder.` }
  }
  const days = Math.max(0, Math.floor((now.getTime() - last) / 86400000))
  if (days >= REMINDER_DAYS) {
    return { level: 'warn', text: `Dernière sauvegarde il y a ${days} jours : pensez à en refaire une.` }
  }
  return { level: 'ok', text: days === 0 ? "Dernière sauvegarde : aujourd'hui." : `Dernière sauvegarde : il y a ${days} jour${days > 1 ? 's' : ''}.` }
}
