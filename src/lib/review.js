// Logique pure de l'écran de correction (partagée par le tableau et les fiches).

import { REVIEW_THRESHOLD } from './classifier.js'
import { mulMoney, sumMoney, diffMoney, sameMoney } from './money.js'

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
  const gross = mulMoney(q, up)
  return { ...it, gross, net: sumMoney([gross, Number(it.discount) || 0]) }
}

// Synthèse affichée en permanence : total recalculé, écart avec le total du ticket.
export function reviewSummary(items, globalDiscountTotal, declared) {
  const gross = sumMoney(items.map((b) => Number(b.gross) || 0))
  const discount = sumMoney(items.map((b) => Number(b.discount) || 0))
  const net = sumMoney([gross, discount, Number(globalDiscountTotal) || 0])
  const hasDeclared = declared != null
  const diff = hasDeclared ? diffMoney(net, declared) : null
  return {
    gross,
    discount,
    net,
    declared: hasDeclared ? declared : null,
    diff,
    reconciled: hasDeclared && sameMoney(net, declared, 1), // tolérance : 1 centime d'arrondi
    reviewCount: items.filter((it) => it.needsReview).length,
  }
}

// « +71,97 € » / « −0,50 € » / « 0,00 € » (signe explicite, vrai moins typographique).
export function formatGap(diff, formatEUR) {
  if (diff == null) return '—'
  if (Math.abs(diff) < 0.005) return formatEUR(0)
  return `${diff > 0 ? '+' : '−'}${formatEUR(Math.abs(diff))}`
}

// Corrections à mémoriser (dictionnaire appris) à l'enregistrement d'un ticket.
// On n'apprend qu'une classification CONFIRMÉE : choisie par l'utilisateur (la confiance passe
// alors à 1) ou déjà sûre. Corriger seulement le nom d'une ligne dont le code est douteux ne
// doit pas figer ce code douteux en « 99 % » pour les prochains tickets.
export function correctionsToLearn(items) {
  return items
    .filter((it) => it.corrected && it.coicop && !it.manual && it.raw && (Number(it.confidence) || 0) >= REVIEW_THRESHOLD)
    .map((it) => ({
      raw: it.raw,
      correction: { normalized: it.normalized, brand: it.brand, coicop: it.coicop, category: it.category },
    }))
}

// Faut-il proposer la suggestion de code (règles) pour cette ligne ? Oui si elle n'est pas
// classée, ou si son code est douteux (confiance faible) et que la suggestion en diffère.
export function shouldSuggest(it, suggestion) {
  if (!suggestion) return false
  if (!it.coicop) return true
  return (Number(it.confidence) || 0) < REVIEW_THRESHOLD && suggestion.coicop !== it.coicop
}

