// Regroupement des lignes d'un ticket par code COICOP, pour l'écran de contrôle des codes.

import { coicopLabel } from '../data/coicop.js'
import { sumMoney } from './money.js'

// [{ code, label, items, total, toReview }] : « Non classé » d'abord, puis par code.
export function groupItemsByCoicop(items) {
  const map = new Map()
  for (const it of items) {
    const key = it.coicop || ''
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(it)
  }
  return [...map.entries()]
    .map(([code, list]) => ({
      code: code || null,
      label: code ? coicopLabel(code) : 'Non classé',
      items: list,
      total: sumMoney(list.map((it) => Number(it.net) || 0)),
      toReview: list.filter((it) => it.needsReview).length,
    }))
    .sort((a, b) => (b.code === null) - (a.code === null) || String(a.code).localeCompare(String(b.code)))
}

// Codes déjà présents dans le ticket, les plus fréquents d'abord.
export function codesInTicket(items) {
  const count = {}
  for (const it of items) if (it.coicop) count[it.coicop] = (count[it.coicop] || 0) + 1
  return Object.keys(count).sort((a, b) => count[b] - count[a] || a.localeCompare(b))
}

// Seuil au-delà duquel le mode simplifié est le mode d'ouverture par défaut.
export const SIMPLE_MODE_THRESHOLD = 10
