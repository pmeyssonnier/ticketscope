// Logique pure de l'écran de correction (partagée par le tableau et les fiches).

import { REVIEW_THRESHOLD } from './classifier.js'

// Une ligne est « à confirmer » si elle n'est pas classée, si la confiance de
// classement est faible, ou si la confiance de LECTURE (OCR / IA) est faible.
// Les lignes de remise (promotions) n'ont pas de produit à classer.
export function computeNeedsReview(it) {
  if (it.category === 'Remise') return false
  if (!it.coicop) return true
  if ((Number(it.confidence) || 0) < REVIEW_THRESHOLD) return true
  if (it.readConfidence != null && Number(it.readConfidence) < REVIEW_THRESHOLD) return true
  return false
}

// Recalcule brut et net d'une ligne après une saisie (les champs peuvent être des chaînes).
export function recomputeAmounts(it) {
  const q = Number(it.quantity) || 0
  const up = Number(it.unitPrice) || 0
  const gross = +(q * up).toFixed(2)
  return { ...it, gross, net: +(gross + (Number(it.discount) || 0)).toFixed(2) }
}

// Synthèse affichée en permanence : total recalculé, écart avec le total du ticket.
export function reviewSummary(items, globalDiscountTotal, declared) {
  const gross = +items.reduce((a, b) => a + (Number(b.gross) || 0), 0).toFixed(2)
  const discount = +items.reduce((a, b) => a + (Number(b.discount) || 0), 0).toFixed(2)
  const net = +(gross + discount + (Number(globalDiscountTotal) || 0)).toFixed(2)
  const hasDeclared = declared != null
  const diff = hasDeclared ? +(net - declared).toFixed(2) : null
  return {
    gross,
    discount,
    net,
    declared: hasDeclared ? declared : null,
    diff,
    reconciled: hasDeclared && Math.abs(diff) < 0.02,
    reviewCount: items.filter((it) => it.needsReview).length,
  }
}

// « +71,97 € » / « −0,50 € » / « 0,00 € » (signe explicite, vrai moins typographique).
export function formatGap(diff, formatEUR) {
  if (diff == null) return '—'
  if (Math.abs(diff) < 0.005) return formatEUR(0)
  return `${diff > 0 ? '+' : '−'}${formatEUR(Math.abs(diff))}`
}
