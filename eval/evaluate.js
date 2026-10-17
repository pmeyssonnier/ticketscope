// Suivi de précision du pipeline local (texte du ticket -> lignes -> COICOP).
//
// Pour chaque ticket annoté de `dataset.json`, on reconstruit le texte tel que
// l'OCR le donnerait, on y injecte éventuellement du bruit OCR (déterministe), on
// passe le tout dans `parseTicket` + `classifyItems`, puis on compare aux lignes
// attendues : lignes retrouvées, montants, code COICOP, et calibration de la
// confiance (une ligne « sûre » est-elle plus souvent juste qu'une ligne douteuse ?).
//
// Ce n'est pas un test de l'OCR lui-même (pas d'image) : il mesure ce que le code
// de TicketScope fait d'un texte plus ou moins bruité.

import { parseTicket } from '../src/lib/parser.js'
import { classifyItems, REVIEW_THRESHOLD } from '../src/lib/classifier.js'
import { alignItems } from '../src/lib/compare.js'

// --- bruit OCR déterministe -------------------------------------------------
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Confusions typiques d'un OCR sur ticket thermique.
const CONFUSIONS = { I: 'l', l: 'I', O: '0', E: 'F', C: 'G', A: 'H', N: 'M', R: 'P', S: '5', B: '8', U: 'V' }

// Applique le bruit aux libellés seulement (les montants restent exacts : les
// erreurs de chiffres sont un autre sujet, mesuré à part par la confiance de lecture).
export function noisify(label, rate, rand) {
  if (!rate) return label
  let out = ''
  for (const ch of label) {
    if (!/[A-Za-z]/.test(ch) || rand() >= rate) {
      out += ch
      continue
    }
    const kind = rand()
    if (kind < 0.6 && CONFUSIONS[ch.toUpperCase()]) out += CONFUSIONS[ch.toUpperCase()]
    else if (kind < 0.8) out += '' // lettre perdue
    else out += ch + ch // lettre doublée
  }
  return out
}

const fmt = (n) => n.toFixed(2).replace('.', ',')

export function buildText(ticket, rate = 0, rand = () => 1) {
  const lines = [ticket.store, `${ticket.date} 18:42`, '']
  for (const it of ticket.items) {
    const label = noisify(it.raw, rate, rand)
    for (let i = 0; i < it.quantity; i += 1) lines.push(`${label}   ${fmt(it.unitPrice)}`)
    if (it.discount < 0) lines.push(`Réduction sur article   ${fmt(it.discount)}`)
  }
  lines.push('', `TOTAL PAYE   ${fmt(ticket.declaredTotal)}`)
  return lines.join('\n')
}

// --- une exécution ----------------------------------------------------------
const BINS = [
  { key: 'haute', label: '≥ 85 %', test: (c) => c >= 0.85 },
  { key: 'moyenne', label: '75–85 %', test: (c) => c >= REVIEW_THRESHOLD && c < 0.85 },
  { key: 'basse', label: '< 75 %', test: (c) => c < REVIEW_THRESHOLD },
]

export function evaluateTicket(ticket, rate, rand) {
  const text = buildText(ticket, rate, rand)
  const parsed = parseTicket(text)
  const predicted = classifyItems(parsed.items, [])
  const pairs = alignItems({ items: ticket.items }, { items: predicted })
  const matched = pairs.filter((p) => p.a && p.b)

  const m = {
    goldLines: ticket.items.length,
    parsedLines: predicted.length,
    matched: matched.length,
    netOk: 0,
    withGoldCoicop: 0,
    classified: 0,
    coicopOk: 0,
    wrong: 0,
    wrongFlagged: 0,
    flagged: 0,
    bins: Object.fromEntries(BINS.map((b) => [b.key, { n: 0, ok: 0 }])),
    totalOk: parsed.totalDeclared != null && Math.abs(+predicted.reduce((a, b) => a + b.net, 0).toFixed(2) + (parsed.globalDiscountTotal || 0) - parsed.totalDeclared) < 0.05 ? 1 : 0,
  }
  for (const { a: gold, b: pred } of matched) {
    if (Math.abs(gold.net - pred.net) < 0.01) m.netOk += 1
    if (pred.needsReview) m.flagged += 1
    if (!gold.coicop) continue
    m.withGoldCoicop += 1
    if (pred.coicop) m.classified += 1
    const ok = pred.coicop === gold.coicop
    if (ok) m.coicopOk += 1
    else {
      m.wrong += 1
      if (pred.needsReview) m.wrongFlagged += 1
    }
    const bin = BINS.find((b) => b.test(pred.confidence))
    m.bins[bin.key].n += 1
    if (ok) m.bins[bin.key].ok += 1
  }
  return m
}

const sumInto = (acc, m) => {
  for (const k of ['goldLines', 'parsedLines', 'matched', 'netOk', 'withGoldCoicop', 'classified', 'coicopOk', 'wrong', 'wrongFlagged', 'flagged', 'totalOk']) {
    acc[k] = (acc[k] || 0) + m[k]
  }
  acc.tickets = (acc.tickets || 0) + 1
  acc.bins = acc.bins || Object.fromEntries(BINS.map((b) => [b.key, { n: 0, ok: 0 }]))
  for (const b of BINS) {
    acc.bins[b.key].n += m.bins[b.key].n
    acc.bins[b.key].ok += m.bins[b.key].ok
  }
  return acc
}

const ratio = (a, b) => (b ? +(a / b).toFixed(4) : null)

// Indicateurs dérivés d'un cumul.
export function summarize(acc) {
  return {
    ...acc,
    recall: ratio(acc.matched, acc.goldLines), // lignes attendues retrouvées
    precision: ratio(acc.matched, acc.parsedLines), // lignes produites qui correspondent
    netAccuracy: ratio(acc.netOk, acc.matched), // montant net exact
    coicopAccuracy: ratio(acc.coicopOk, acc.withGoldCoicop), // bon code, sur les lignes attendues classées
    coverage: ratio(acc.classified, acc.withGoldCoicop), // part des lignes qui reçoivent un code
    errorDetection: ratio(acc.wrongFlagged, acc.wrong), // erreurs signalées « à confirmer »
    totalReconciled: ratio(acc.totalOk, acc.tickets), // tickets dont le total recalculé est cohérent
    calibration: Object.fromEntries(
      BINS.map((b) => [b.key, { label: b.label, n: acc.bins[b.key].n, accuracy: ratio(acc.bins[b.key].ok, acc.bins[b.key].n) }]),
    ),
  }
}

// Évalue tous les tickets pour chaque niveau de bruit.
export function evaluate(dataset, { noise = [0, 0.03, 0.06], seed = 42 } = {}) {
  const out = {}
  for (const rate of noise) {
    const rand = mulberry32(seed + Math.round(rate * 1000))
    const acc = {}
    const perTicket = {}
    for (const ticket of dataset.tickets) {
      const m = evaluateTicket(ticket, rate, rand)
      sumInto(acc, m)
      perTicket[ticket.id] = summarize(sumInto({}, m))
    }
    out[rate] = { ...summarize(acc), perTicket }
  }
  return out
}
