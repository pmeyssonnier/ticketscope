// Assemblage de plusieurs photos d'un même (long) ticket.
//
// L'utilisateur photographie le ticket par tranches, du haut vers le bas, en
// laissant un léger recouvrement entre deux photos. On recolle les textes OCR
// en détectant les lignes communes à la jonction, pour ne pas dupliquer les
// lignes du recouvrement.

import { normalizeStr } from './format.js'

// Similarité de Dice sur bigrammes de caractères (robuste au bruit OCR).
function similarity(a, b) {
  const x = normalizeStr(a).replace(/\s+/g, '')
  const y = normalizeStr(b).replace(/\s+/g, '')
  if (!x && !y) return 1
  if (!x || !y) return 0
  if (x === y) return 1
  if (x.length < 2 || y.length < 2) return x === y ? 1 : 0
  const bigrams = new Map()
  for (let i = 0; i < x.length - 1; i += 1) {
    const g = x.slice(i, i + 2)
    bigrams.set(g, (bigrams.get(g) || 0) + 1)
  }
  let hits = 0
  for (let i = 0; i < y.length - 1; i += 1) {
    const g = y.slice(i, i + 2)
    const c = bigrams.get(g) || 0
    if (c > 0) {
      hits += 1
      bigrams.set(g, c - 1)
    }
  }
  return (2 * hits) / (x.length - 1 + (y.length - 1))
}

const MAX_OVERLAP = 8
const LINE_SIM = 0.6

// Recolle deux blocs de lignes en retirant le recouvrement détecté.
function joinLines(prev, next) {
  const maxK = Math.min(MAX_OVERLAP, prev.length, next.length)
  // On exige au moins 2 lignes concordantes pour valider un recouvrement.
  for (let k = maxK; k >= 2; k -= 1) {
    let ok = true
    for (let i = 0; i < k; i += 1) {
      if (similarity(prev[prev.length - k + i], next[i]) < LINE_SIM) {
        ok = false
        break
      }
    }
    if (ok) return prev.concat(next.slice(k))
  }
  return prev.concat(next)
}

const toLines = (t) =>
  (t || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)

// Recolle une liste de textes OCR (dans l'ordre des photos) en un seul texte.
export function stitchOcrTexts(texts) {
  const lists = texts.map(toLines).filter((l) => l.length)
  if (!lists.length) return ''
  let acc = lists[0]
  for (let i = 1; i < lists.length; i += 1) acc = joinLines(acc, lists[i])
  return acc.join('\n')
}

export const _internal = { similarity, joinLines }
