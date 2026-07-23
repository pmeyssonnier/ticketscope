// Comparaison de deux tickets — typiquement le même ticket lu par l'IA (Claude)
// et par l'OCR local, pour mesurer la différence de lecture et de classement.

import { normalizeStr } from './format.js'

// Moteur d'import d'un ticket : 'ia' (Claude Vision) ou 'local' (OCR / texte).
// Les anciens tickets n'ont pas le champ `engine` : on le déduit de la source
// des lignes (les lignes lues par l'IA portent source === 'ia').
export function ticketEngine(t) {
  if (t && (t.engine === 'ia' || t.engine === 'local')) return t.engine
  const items = (t && t.items) || []
  const iaCount = items.filter((it) => it.source === 'ia').length
  return iaCount > 0 && iaCount >= items.length / 2 ? 'ia' : 'local'
}

export function engineLabel(engine) {
  return engine === 'ia' ? '✨ IA Claude' : '⚡ OCR local'
}

// Statistiques agrégées d'un ticket, pour la colonne de comparaison.
export function ticketStats(t) {
  const items = (t && t.items) || []
  const lines = items.length
  const units = items.reduce((a, b) => a + (Number(b.quantity) || 0), 0)
  const net = +items.reduce((a, b) => a + (Number(b.net) || 0), 0).toFixed(2)
  const declared = t && t.totalDeclared != null ? +Number(t.totalDeclared).toFixed(2) : null
  const diff = declared != null ? +(net - declared).toFixed(2) : null
  const classified = items.filter((it) => it.coicop).length
  const review = items.filter((it) => it.needsReview || (Number(it.confidence) || 0) < 0.75).length
  const avgConf = lines
    ? +(items.reduce((a, b) => a + (Number(b.confidence) || 0), 0) / lines).toFixed(2)
    : null
  return { engine: ticketEngine(t), lines, units, net, declared, diff, classified, review, avgConf }
}

// Bigrammes de caractères (avec bords) pour le coefficient de Dice.
function bigrams(s) {
  const t = ` ${s} `
  const out = []
  for (let i = 0; i < t.length - 1; i += 1) out.push(t.slice(i, i + 2))
  return out
}

// Similarité de Dice entre deux chaînes (0 → 1). Tolérante au bruit OCR.
export function diceCoefficient(s1, s2) {
  const a = (s1 || '').trim()
  const b = (s2 || '').trim()
  if (!a && !b) return 1
  if (!a || !b) return 0
  if (a === b) return 1
  const A = bigrams(a)
  const B = bigrams(b)
  const counts = new Map()
  for (const g of A) counts.set(g, (counts.get(g) || 0) + 1)
  let inter = 0
  for (const g of B) {
    const c = counts.get(g)
    if (c > 0) {
      inter += 1
      counts.set(g, c - 1)
    }
  }
  return (2 * inter) / (A.length + B.length)
}

// Ancre d'appariement : le libellé BRUT imprimé (lu par les deux moteurs sur le
// même ticket), sinon le nom normalisé. C'est le signal le plus fiable.
function anchor(it) {
  return normalizeStr(it.raw) || normalizeStr(it.normalized)
}

const MATCH_THRESHOLD = 0.5

// Similarité entre deux lignes : dominée par le libellé brut, soutenue par le
// nom normalisé, avec un léger bonus si le montant net est identique.
export function lineSimilarity(a, b) {
  const rawSim = diceCoefficient(anchor(a), anchor(b))
  const nameSim = diceCoefficient(normalizeStr(a.normalized), normalizeStr(b.normalized))
  const netEq = a.net != null && b.net != null && Math.abs(Number(a.net) - Number(b.net)) < 0.01
  return Math.max(rawSim, nameSim * 0.9) + (netEq ? 0.03 : 0)
}

// Apparie les lignes des deux tickets par similarité de libellé (appariement
// flou, glouton : meilleures paires d'abord, chaque ligne au plus une fois).
// Renvoie [{ key, label, a, b }] : appariées d'abord, puis présentes d'un seul
// côté. `a`/`b` valent null si absent de ce ticket.
export function alignItems(ticketA, ticketB) {
  const as = ((ticketA && ticketA.items) || []).map((it, i) => ({ it, i }))
  const bs = ((ticketB && ticketB.items) || []).map((it, i) => ({ it, i }))

  const candidates = []
  for (const a of as) {
    for (const b of bs) {
      const s = lineSimilarity(a.it, b.it)
      if (s >= MATCH_THRESHOLD) candidates.push({ ai: a.i, bi: b.i, a: a.it, b: b.it, s })
    }
  }
  candidates.sort((x, y) => y.s - x.s)

  const usedA = new Set()
  const usedB = new Set()
  const paired = []
  for (const c of candidates) {
    if (usedA.has(c.ai) || usedB.has(c.bi)) continue
    usedA.add(c.ai)
    usedB.add(c.bi)
    paired.push({ a: c.a, b: c.b })
  }
  const rest = [
    ...as.filter((a) => !usedA.has(a.i)).map((a) => ({ a: a.it, b: null })),
    ...bs.filter((b) => !usedB.has(b.i)).map((b) => ({ a: null, b: b.it })),
  ]

  const nameOf = (p) => (p.a || p.b).normalized || (p.a || p.b).raw || ''
  const keyOf = (p) => normalizeStr(nameOf(p))
  const byName = (x, y) => nameOf(x).localeCompare(nameOf(y))
  paired.sort(byName)
  rest.sort(byName)

  return [...paired, ...rest].map((p) => ({ a: p.a, b: p.b, key: keyOf(p), label: nameOf(p) }))
}

// Statut d'une paire appariée, pour la mise en évidence.
export function pairStatus(pair) {
  const { a, b } = pair
  if (a && !b) return 'only-a'
  if (b && !a) return 'only-b'
  if ((a.coicop || null) !== (b.coicop || null)) return 'coicop-diff'
  if (Math.abs((Number(a.net) || 0) - (Number(b.net) || 0)) >= 0.01) return 'net-diff'
  return 'same'
}
