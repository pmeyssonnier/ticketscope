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

// Clé d'appariement d'une ligne entre deux tickets : nom normalisé, sinon brut.
export function lineKey(it) {
  const n = normalizeStr(it.normalized)
  return n || normalizeStr(it.raw)
}

// Apparie les lignes des deux tickets par nom normalisé (appariement exact).
// Renvoie une liste de paires { key, label, a, b } triée : communes d'abord,
// puis présentes d'un seul côté. `a`/`b` valent null si absent de ce ticket.
export function alignItems(ticketA, ticketB) {
  const index = (items) => {
    const m = new Map()
    for (const it of items || []) {
      const k = lineKey(it)
      if (!k) continue
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(it)
    }
    return m
  }
  const ma = index(ticketA && ticketA.items)
  const mb = index(ticketB && ticketB.items)
  const keys = [...new Set([...ma.keys(), ...mb.keys()])]

  const rows = keys.map((k) => {
    const as = ma.get(k) || []
    const bs = mb.get(k) || []
    const n = Math.max(as.length, bs.length)
    return { key: k, aList: as, bList: bs, count: n }
  })
  // Communes (des deux côtés) en tête, puis alphabétique.
  rows.sort((r1, r2) => {
    const both1 = r1.aList.length && r1.bList.length ? 0 : 1
    const both2 = r2.aList.length && r2.bList.length ? 0 : 1
    if (both1 !== both2) return both1 - both2
    return r1.key.localeCompare(r2.key)
  })

  // Aplati en lignes appariées (une par exemplaire).
  const out = []
  for (const r of rows) {
    for (let i = 0; i < r.count; i += 1) {
      const a = r.aList[i] || null
      const b = r.bList[i] || null
      out.push({ key: r.key, label: (a || b).normalized || (a || b).raw || r.key, a, b })
    }
  }
  return out
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
