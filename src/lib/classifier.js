// Classification : associe chaque produit extrait à un produit normalisé,
// un code COICOP et un niveau de confiance, à partir de la base de connaissances
// (dictionnaire intégré + entrées apprises via les corrections utilisateur).

import { normalizeStr } from './format.js'
import { PRODUCT_DICTIONARY } from '../data/dictionary.js'
import { coicopLabel } from '../data/coicop.js'

export const REVIEW_THRESHOLD = 0.75

// Distance d'édition (Levenshtein) bornée à `max` — pour tolérer les fautes OCR.
function editUpTo(a, b, max) {
  const la = a.length
  const lb = b.length
  if (Math.abs(la - lb) > max) return max + 1
  let prev = Array.from({ length: lb + 1 }, (_, i) => i)
  for (let i = 1; i <= la; i += 1) {
    const cur = [i]
    let best = i
    for (let j = 1; j <= lb; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      cur[j] = v
      if (v < best) best = v
    }
    if (best > max) return max + 1
    prev = cur
  }
  return prev[lb]
}

// Un mot du libellé correspond-il à `word` (exact, pluriel, ou à ~1 faute OCR) ?
// Les mots courts (<4 car.) exigent une correspondance exacte (trop risqué sinon).
function fuzzyWord(tokens, word) {
  if (word.length < 4) return tokens.includes(word)
  const tol = word.length >= 9 ? 2 : 1
  return tokens.some((t) => {
    if (t === word || t.startsWith(word)) return true
    if (editUpTo(t, word, tol) <= tol) return true
    // le libellé peut être plus long (« oltves » ~ « olive ») : compare aussi le préfixe
    if (t.length > word.length && editUpTo(t.slice(0, word.length), word, tol) <= tol) return true
    return false
  })
}

// Retourne 'exact', 'fuzzy' ou null pour un mot-clé (mono ou multi-mots).
function keywordMatch(norm, tokens, k) {
  if (norm.includes(k)) return 'exact'
  const words = k.split(' ').filter(Boolean)
  if (words.length && words.every((w) => fuzzyWord(tokens, w))) return 'fuzzy'
  return null
}

function scoreEntry(norm, entry) {
  const tokens = norm.split(' ')
  const keywords = entry.keywords || []
  let best = 0
  for (const kw of keywords) {
    const k = normalizeStr(kw)
    if (!k) continue
    const type = keywordMatch(norm, tokens, k)
    if (!type) continue
    const specificity = Math.min(k.length / 8, 1)
    if (type === 'exact') {
      // Appariement déterministe : confiance portée par la spécificité du mot-clé.
      const coverage = k.length / Math.max(norm.length, 1)
      best = Math.max(best, 0.6 + 0.38 * specificity + 0.05 * coverage)
    } else {
      // Appariement approximatif (faute OCR probable) : reconnu mais confiance
      // maintenue sous le seuil de révision -> proposé « à confirmer ».
      best = Math.max(best, Math.min(0.6 + 0.1 * specificity, 0.72))
    }
  }
  if (best === 0) return 0
  if (entry.mustAll) {
    const ok = entry.mustAll.every((m) => {
      const mm = normalizeStr(m)
      return norm.includes(mm) || fuzzyWord(tokens, mm)
    })
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
