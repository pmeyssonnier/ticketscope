// Classification : associe chaque produit extrait à un produit normalisé,
// un code COICOP et un niveau de confiance, à partir de la base de connaissances
// (dictionnaire intégré + entrées apprises via les corrections utilisateur).

import { normalizeStr } from './format.js'
import { PRODUCT_DICTIONARY } from '../data/dictionary.js'
import { coicopLabel } from '../data/coicop.js'

export const REVIEW_THRESHOLD = 0.75

function scoreEntry(norm, entry) {
  const keywords = entry.keywords || []
  let best = 0
  for (const kw of keywords) {
    const k = normalizeStr(kw)
    if (k && norm.includes(k)) {
      // Plus le fragment reconnu couvre le libellé, plus la confiance est forte.
      const coverage = k.length / Math.max(norm.length, 1)
      const specificity = Math.min(k.length / 12, 1) // les fragments longs sont plus sûrs
      best = Math.max(best, 0.55 + 0.25 * coverage + 0.2 * specificity)
    }
  }
  if (best === 0) return 0
  if (entry.mustAll) {
    const ok = entry.mustAll.every((m) => norm.includes(normalizeStr(m)))
    if (!ok) return 0
  }
  return Math.min(best, 0.98)
}

// dict : liste optionnelle d'entrées apprises (prioritaires).
export function classifyItem(item, learned = []) {
  const norm = normalizeStr(item.raw)

  // 1) Correspondance apprise (correction utilisateur) -> confiance maximale.
  for (const entry of learned) {
    if (scoreEntry(norm, entry) > 0) {
      return decorate(item, entry, 0.99, 'appris')
    }
  }

  // 2) Dictionnaire intégré : meilleure entrée par score.
  let bestEntry = null
  let bestScore = 0
  for (const entry of PRODUCT_DICTIONARY) {
    const s = scoreEntry(norm, entry)
    if (s > bestScore) {
      bestScore = s
      bestEntry = entry
    }
  }

  if (bestEntry) {
    return decorate(item, bestEntry, bestScore, 'dictionnaire')
  }

  // 3) Inconnu -> à corriger.
  return {
    ...item,
    normalized: '',
    brand: '',
    coicop: null,
    coicopLabel: 'Non classé',
    category: 'Inconnu',
    confidence: 0.25,
    source: 'inconnu',
    needsReview: true,
  }
}

function decorate(item, entry, confidence, source) {
  const conf = +confidence.toFixed(2)
  return {
    ...item,
    normalized: entry.normalized,
    brand: entry.brand || '',
    coicop: entry.coicop,
    coicopLabel: coicopLabel(entry.coicop),
    category: entry.category,
    confidence: conf,
    source,
    needsReview: conf < REVIEW_THRESHOLD,
  }
}

export function classifyItems(items, learned = []) {
  return items.map((it) => classifyItem(it, learned))
}
