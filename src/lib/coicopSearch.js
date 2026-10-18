// Recherche d'une classe COICOP : par code (« 04.3 »), par titre officiel, par division
// ou par mot-clé de produit (« bonde », « lait »). Fonctions pures.

import { COICOP_LABELS, COICOP_DIVISIONS, coicopDivision } from '../data/coicop.js'
import { normalizeStr } from './format.js'
import { FAMILY_LABELS } from '../data/familyLabels.js'
import { ruleKeywordsByCoicop } from './suggest.js'

let keywordIndex = null
function keywords(code) {
  keywordIndex ||= ruleKeywordsByCoicop()
  return keywordIndex[code] || []
}

function haystack(code) {
  const div = COICOP_DIVISIONS[coicopDivision(code)] || ''
  return normalizeStr(`${code} ${COICOP_LABELS[code]} ${div} ${(FAMILY_LABELS[code] || [])[1] || ''} ${keywords(code).join(' ')}`)
}

// Rang d'une classe pour la requête (0 = pas de correspondance, plus haut = mieux).
function score(code, tokens) {
  const label = normalizeStr(COICOP_LABELS[code])
  const hay = haystack(code)
  let total = 0
  for (const t of tokens) {
    if (!hay.includes(t)) return 0
    if (code.startsWith(t)) total += 4
    else if (label.split(' ').some((w) => w.startsWith(t))) total += 3
    else if (keywords(code).some((k) => normalizeStr(k).startsWith(t))) total += 2
    else total += 1
  }
  return total
}

// Classes correspondant à `query`, les plus pertinentes d'abord (ordre des codes à égalité).
export function searchCoicop(query, codes = Object.keys(COICOP_LABELS)) {
  const asCode = query.trim().replace(/\.+$/, '')
  if (/^\d[\d.]*$/.test(asCode)) return codes.filter((c) => c.startsWith(asCode)).sort()
  const tokens = normalizeStr(query).split(' ').filter(Boolean)
  if (!tokens.length) return [...codes]
  return codes
    .map((code) => ({ code, s: score(code, tokens) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.code.localeCompare(b.code))
    .map((x) => x.code)
}

// Sans requête : classes groupées par division, dans l'ordre des codes.
export function groupByDivision(codes = Object.keys(COICOP_LABELS)) {
  const groups = []
  for (const code of [...codes].sort()) {
    const d = coicopDivision(code)
    let g = groups[groups.length - 1]
    if (!g || g.division !== d) {
      g = { division: d, title: `${d} — ${COICOP_DIVISIONS[d] || d}`, codes: [] }
      groups.push(g)
    }
    g.codes.push(code)
  }
  return groups
}
