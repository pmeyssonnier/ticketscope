// Produits de tous les tickets enregistrés, regroupés par catégorie COICOP, pour repérer et
// corriger les lignes non classées. Les remises n'ont pas de produit à classer : elles sont écartées.

import { coicopLabel } from '../data/coicop.js'
import { normalizeStr } from './format.js'
import { groupItemsByCoicop } from './codeGroups.js'

export const lineKey = (ticketId, itemId) => `${ticketId}:${itemId}`

// Lignes à plat (id = clé ticket:ligne), filtrées par produit, libellé brut ou magasin.
export function productLines(tickets, query = '') {
  const q = normalizeStr(query)
  const out = []
  for (const t of tickets) {
    for (const it of t.items || []) {
      if (it.category === 'Remise') continue
      const name = it.normalized || it.raw || ''
      if (q && !normalizeStr(`${name} ${it.raw || ''} ${t.store || ''}`).includes(q)) continue
      out.push({ ...it, id: lineKey(t.id, it.id), ticketId: t.id, itemId: it.id, store: t.store, date: t.date })
    }
  }
  return out
}

// [{ code, label, items, total, toReview }] : « Non classé » d'abord.
export const groupProductLines = (lines) => groupItemsByCoicop(lines)

const BLANK_CATEGORIES = ['', 'Inconnu', 'Non classé']

// Applique `code` aux lignes `keys`. Renvoie les seuls tickets modifiés (prêts à être enregistrés) et
// ce qu'il faut apprendre (lignes lues sur le ticket, pas ajoutées à la main).
export function applyLineCorrection(tickets, keys, code) {
  const wanted = new Set(keys)
  const changed = []
  const learn = []
  for (const t of tickets) {
    let touched = false
    const items = (t.items || []).map((it) => {
      if (!wanted.has(lineKey(t.id, it.id))) return it
      touched = true
      const category = BLANK_CATEGORIES.includes(it.category || '') ? coicopLabel(code) : it.category
      const next = { ...it, coicop: code, coicopLabel: coicopLabel(code), category, confidence: 1, source: 'manuel', needsReview: false, corrected: true }
      if (it.raw && !it.manual) learn.push({ raw: it.raw, correction: { normalized: next.normalized, brand: next.brand, coicop: code, category } })
      return next
    })
    if (touched) changed.push({ ...t, items })
  }
  return { tickets: changed, learn }
}
