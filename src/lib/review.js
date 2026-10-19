// Logique pure de l'écran de correction (partagée par le tableau et les fiches).

import { REVIEW_THRESHOLD, classifyItem } from './classifier.js'
import { mulMoney, sumMoney, diffMoney, sameMoney } from './money.js'

export const ROUNDING_TOLERANCE_CENTS = 2

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
    reconciled: hasDeclared && sameMoney(net, declared, ROUNDING_TOLERANCE_CENTS), // tolérance : arrondi de caisse belge (aux 5 centimes, ≤ 2 centimes)
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

// Reclassement des lignes DOUTEUSES (confiance < seuil, souvent lues par l'IA) avec ce que le classement
// local sait avec certitude : corrections apprises, ou dictionnaire à correspondance exacte. L'IA hésite
// souvent et tombe alors sur le premier code de la liste (« Pain et céréales ») ; le dictionnaire, lui,
// est exact. Une ligne que l'utilisateur a corrigée, une IA sûre, une remise ou un code identique ne
// changent pas. Renvoie les lignes et le nombre de lignes reclassées.
export function reconcileWithLocal(items, learned = []) {
  let changed = 0
  const out = items.map((it) => {
    if (!it.raw || it.corrected || it.manual || it.source === 'manuel' || it.category === 'Remise') return it
    if ((Number(it.confidence) || 0) >= REVIEW_THRESHOLD) return it
    const local = classifyItem({ raw: it.raw }, learned)
    if (local.source !== 'appris' && local.source !== 'dictionnaire') return it
    if (!local.coicop || local.confidence < REVIEW_THRESHOLD || local.coicop === it.coicop) return it
    changed += 1
    const next = { ...it, coicop: local.coicop, coicopLabel: local.coicopLabel, category: local.category, confidence: local.confidence, source: local.source }
    next.needsReview = computeNeedsReview(next)
    return next
  })
  return { items: out, changed }
}

