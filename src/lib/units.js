// Extraction du format (poids / volume / nombre de pièces) et calcul du prix
// unitaire normalisé (€/kg, €/L, €/pièce) — utile pour l'analyse type Enquête
// sur le Budget des Ménages (Statbel) et le comparateur de prix.

// Unités reconnues, du token le plus long au plus court (l'ordre compte dans
// l'alternance regex : « ml » avant « l », « kg » avant « g »).
const UNIT_RE =
  /(\d+(?:[.,]\d+)?)\s?(kg|kilogrammes?|litres?|dl|cl|ml|grammes?|gr|g|l)\b/

function unitToBase(u) {
  switch (u) {
    case 'kg':
    case 'kilogramme':
    case 'kilogrammes':
      return { base: 'kg', factor: 1 }
    case 'g':
    case 'gr':
    case 'gramme':
    case 'grammes':
      return { base: 'kg', factor: 0.001 }
    case 'l':
    case 'litre':
    case 'litres':
      return { base: 'L', factor: 1 }
    case 'dl':
      return { base: 'L', factor: 0.1 }
    case 'cl':
      return { base: 'L', factor: 0.01 }
    case 'ml':
      return { base: 'L', factor: 0.001 }
    default:
      return null
  }
}

// Extrait le format d'un libellé (brut ou saisi). Renvoie
// { text, base, baseQty, saleType } ou null. `baseQty` est la contenance d'UN
// exemplaire exprimée en unité de base (kg, L, ou pièce) ; null si « au poids ».
export function parseFormat(label) {
  // Minuscules sans retirer la ponctuation (on garde la virgule décimale).
  const s = (label || '').toString().toLowerCase()
  if (!s.trim()) return null

  // Vendu au poids / au litre (contenance de l'exemplaire inconnue).
  if (/\bvrac\b|au poids|\/\s?kg|\/\s?l\b/.test(s)) {
    return { text: 'vrac', base: 'kg', baseQty: null, saleType: 'weight' }
  }

  // Poids / volume : nombre + unité.
  const m = s.match(UNIT_RE)
  if (m) {
    const value = parseFloat(m[1].replace(',', '.'))
    const conv = unitToBase(m[2])
    if (conv && value > 0) {
      const unitLabel = m[2] === 'gr' ? 'g' : m[2]
      return {
        text: `${m[1]} ${unitLabel}`,
        base: conv.base,
        baseQty: +(value * conv.factor).toFixed(4),
        saleType: conv.base === 'kg' ? 'weight' : 'volume',
      }
    }
  }

  // Nombre de pièces : « x12 », « 12x », « 12 pièces ».
  const c = s.match(/x\s?(\d+)\b/) || s.match(/(\d+)\s?(?:x\b|pi[eè]ces?\b)/)
  if (c) {
    const n = parseInt(c[1], 10)
    if (n > 1) return { text: `×${n}`, base: 'pièce', baseQty: n, saleType: 'count' }
  }

  return null
}

// Prix unitaire normalisé à partir du net, de la quantité (nb d'exemplaires) et
// du format. Renvoie { value, label } (ex. { 2.63, '€/kg' }) ou null.
export function unitPrice(net, quantity, format) {
  const f = typeof format === 'string' ? parseFormat(format) : format
  if (!f || f.baseQty == null || net == null) return null
  const totalBase = f.baseQty * (Number(quantity) || 1)
  if (!totalBase) return null
  return { value: +(net / totalBase).toFixed(2), label: `€/${f.base}` }
}

// Raccourci pour un article {net, quantity, format}.
export function unitPriceFor(item) {
  if (!item) return null
  return unitPrice(item.net, item.quantity, item.format || parseFormat(item.raw))
}
