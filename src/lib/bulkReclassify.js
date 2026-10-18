// Reclassement en masse des tickets déjà enregistrés, avec le dictionnaire, les corrections
// apprises et les règles d'aujourd'hui. Rien n'est appliqué sans aperçu : `planReclassification`
// propose, `applyReclassification` n'applique que les lignes acceptées.
//
// Deux sortes de propositions :
//  - « sûre » : le dictionnaire ou une correction apprise donne un code (confiance ≥ seuil) pour
//    une ligne dont le code actuel est douteux (voir reconcileWithLocal) ;
//  - « règle » : la ligne n'avait aucun code et une règle de mots-clés en propose un ; la ligne
//    reste « à confirmer ».
// Jamais touchées : lignes corrigées à la main, ajoutées à la main, remises, lignes déjà sûres.

import { REVIEW_THRESHOLD, classifyItem } from './classifier.js'
import { computeNeedsReview } from './review.js'

export const changeKey = (ticketId, itemId) => `${ticketId}:${itemId}`

function propose(it, learned) {
  if (!it.raw || it.corrected || it.manual || it.source === 'manuel' || it.category === 'Remise') return null
  if ((Number(it.confidence) || 0) >= REVIEW_THRESHOLD) return null
  const local = classifyItem({ raw: it.raw }, learned)
  if (!local.coicop || local.coicop === it.coicop) return null
  if ((local.source === 'appris' || local.source === 'dictionnaire') && local.confidence >= REVIEW_THRESHOLD) return { kind: 'sure', local }
  if (local.source === 'regle' && !it.coicop) return { kind: 'rule', local }
  return null
}

// { changes: [{ key, ticketId, store, date, itemId, raw, name, from, to, toLabel, kind, source }], tickets }
export function planReclassification(tickets, learned = []) {
  const changes = []
  for (const t of tickets) {
    for (const it of t.items || []) {
      const p = propose(it, learned)
      if (!p) continue
      changes.push({
        key: changeKey(t.id, it.id),
        ticketId: t.id,
        store: t.store,
        date: t.date,
        itemId: it.id,
        raw: it.raw,
        name: it.normalized || it.raw,
        from: it.coicop || null,
        to: p.local.coicop,
        toLabel: p.local.coicopLabel,
        kind: p.kind,
        source: p.local.source,
      })
    }
  }
  return { changes, ticketCount: new Set(changes.map((c) => c.ticketId)).size }
}

// Renvoie uniquement les tickets modifiés, prêts à être enregistrés.
export function applyReclassification(tickets, learned, acceptedKeys) {
  const accepted = new Set(acceptedKeys)
  const out = []
  for (const t of tickets) {
    let touched = false
    const items = (t.items || []).map((it) => {
      if (!accepted.has(changeKey(t.id, it.id))) return it
      const p = propose(it, learned)
      if (!p) return it
      touched = true
      const { coicop, coicopLabel, category, confidence, source } = p.local
      const next = { ...it, coicop, coicopLabel, category, confidence, source }
      next.needsReview = computeNeedsReview(next)
      return next
    })
    if (touched) out.push({ ...t, items })
  }
  return out
}
