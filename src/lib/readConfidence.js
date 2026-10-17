// Confiance de LECTURE par ligne (OCR local), distincte de la confiance de
// CLASSEMENT COICOP : Tesseract donne un score par ligne de texte reconnue ; on
// le rattache à chaque ligne du ticket analysé en retrouvant la ligne OCR qui
// ressemble le plus à son libellé.

import { normalizeStr } from './format.js'
import { diceCoefficient } from './compare.js'

const MIN_SIMILARITY = 0.6

// Retire le montant final d'une ligne OCR (« LAIT 1L  1,15 € » -> « LAIT 1L »).
function labelOf(text) {
  return normalizeStr(String(text || '').replace(/[-]?\s?\d{1,3}(?:[.\s]\d{3})*[.,]\d{2}\s*(?:€|EUR)?\s*[-]?\s*$/i, ''))
}

// lines : [{ text, confidence }] avec confidence de 0 à 100 (échelle Tesseract).
// Renvoie les articles avec `readConfidence` (0-1, ou null si aucune ligne OCR
// ne correspond ou si le texte ne vient pas d'un OCR).
export function attachReadConfidence(items, lines) {
  const usable = (Array.isArray(lines) ? lines : [])
    .map((l) => ({ label: labelOf(l.text), confidence: Number(l.confidence) }))
    .filter((l) => l.label && Number.isFinite(l.confidence))
  if (!usable.length) return items.map((it) => ({ ...it, readConfidence: null }))

  return items.map((it) => {
    const target = normalizeStr(it.raw)
    let best = null
    let bestSim = 0
    for (const l of usable) {
      const sim = diceCoefficient(target, l.label)
      if (sim > bestSim) {
        bestSim = sim
        best = l
      }
    }
    const readConfidence = best && bestSim >= MIN_SIMILARITY ? +(Math.max(0, Math.min(100, best.confidence)) / 100).toFixed(2) : null
    return { ...it, readConfidence }
  })
}
