// Correspondance COICOP 1999 ↔ COICOP 2018 (tableau officiel de l'ONU, voir coicop1999.js).
//
// Utile pour relire des données (tickets, sauvegardes, enquêtes) codées dans l'ancienne
// nomenclature, ou pour comparer avec des statistiques qui ne l'ont pas encore quittée.
// Une classe 1999 peut se répartir sur plusieurs classes 2018 (et inversement) : on
// renvoie toujours TOUTES les cibles, triées par poids décroissant, jamais un choix
// silencieux. `unique` vaut vrai quand il n'y a qu'une cible.
import data from './coicop1999.js'

const TITLES_1999 = new Map(data.codes1999)

function build(keyIndex, valueIndex) {
  const m = new Map()
  for (const row of data.pairs) {
    const key = row[keyIndex]
    if (!m.has(key)) m.set(key, new Map())
    const targets = m.get(key)
    targets.set(row[valueIndex], (targets.get(row[valueIndex]) || 0) + row[2])
  }
  return m
}
const FROM_1999 = build(0, 1)
const TO_1999 = build(1, 0)

function describe(code, table) {
  const targets = table.get(code)
  if (!targets) return null
  const total = [...targets.values()].reduce((a, b) => a + b, 0)
  const list = [...targets.entries()]
    .map(([c, n]) => ({ code: c, n, share: +(n / total).toFixed(2) }))
    .sort((a, b) => b.n - a.n || (a.code < b.code ? -1 : 1))
  return { code, targets: list, primary: list[0].code, unique: list.length === 1 }
}

// Titre anglais officiel d'un code COICOP 1999 (ou null).
export function coicop1999Title(code) {
  return TITLES_1999.get(code) || null
}

// Un code COICOP 1999 → ses équivalents 2018 { code, targets:[{code, n, share}], primary, unique } ou null.
export function from1999(code) {
  return describe(code, FROM_1999)
}

// Une classe COICOP 2018 → ses équivalents 1999, même forme, ou null.
export function to1999(code) {
  return describe(code, TO_1999)
}
