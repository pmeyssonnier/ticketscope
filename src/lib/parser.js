// Parseur de ticket : transforme le texte brut (OCR ou copier-coller) en une
// structure exploitable — enseigne, date, lignes produits (quantité × prix,
// promotions regroupées) et totaux déclarés.

import { normalizeStr, parseAmount } from './format.js'
import { LINE_KEYWORDS } from '../data/dictionary.js'

const RETAILERS = [
  'Delhaize', 'Carrefour', 'Colruyt', 'Aldi', 'Lidl', 'Intermarché',
  'Match', 'Cora', 'Proxy', 'Okay', 'Spar', 'Albert Heijn', 'Jumbo',
]

// Extrait un montant en fin de ligne et retourne { label, amount } ou null.
function splitAmount(line) {
  const m = line.match(/^(.*?)([-]?\s?\d{1,3}(?:[.\s]\d{3})*(?:[.,]\d{2}))\s*(?:€|EUR)?\s*[-]?$/)
  if (!m) return null
  const label = m[1].replace(/[.\s]+$/, '').trim()
  let raw = m[2]
  // signe négatif éventuellement en fin de ligne
  if (/-\s*$/.test(line) && !raw.includes('-')) raw = '-' + raw
  const amount = parseAmount(raw)
  if (amount == null) return null
  return { label, amount }
}

function matchesAny(norm, keywords) {
  return keywords.some((k) => norm.includes(normalizeStr(k)))
}

// Comparaison par mot entier (évite les faux positifs de sous-chaîne : « tel »
// ne doit pas matcher « pastel »). Les mots-clés composés sont cherchés tels quels.
function matchesWord(norm, keywords) {
  const tokens = norm.split(' ')
  return keywords.some((k) => {
    const kk = normalizeStr(k)
    if (!kk) return false
    if (kk.includes(' ')) return norm.includes(kk)
    return tokens.some((t) => t === kk)
  })
}

// Date ISO valide (rejette 31/02, mois 13…) ou null.
function validIso(y, mo, d) {
  const Y = +y
  const M = +mo
  const D = +d
  const dt = new Date(Date.UTC(Y, M - 1, D))
  if (dt.getUTCFullYear() !== Y || dt.getUTCMonth() !== M - 1 || dt.getUTCDate() !== D) return null
  return `${String(Y).padStart(4, '0')}-${String(M).padStart(2, '0')}-${String(D).padStart(2, '0')}`
}

function detectDate(text) {
  // dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy (format belge) — on essaie chaque occurrence.
  for (const m of text.matchAll(/(\b\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/g)) {
    let [, d, mo, y] = m
    if (y.length === 3) continue
    if (y.length === 2) y = '20' + y
    const iso = validIso(y, mo, d)
    if (iso) return iso
  }
  // yyyy-mm-dd
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    const iso = validIso(m[1], m[2], m[3])
    if (iso) return iso
  }
  return null
}

function detectStore(lines) {
  // Enseigne connue : mots entiers, dans l'en-tête uniquement (évite que
  // « SPARKLING » devienne « Spar » ou qu'un produit désigne le magasin).
  const head = normalizeStr(lines.slice(0, 6).join(' ')).split(' ')
  for (const r of RETAILERS) {
    const words = normalizeStr(r).split(' ')
    if (words.every((w) => head.includes(w))) return r
  }
  // Sinon : première ligne "titre" (lettres, pas de prix, pas une date pure)
  for (const l of lines) {
    const t = l.trim()
    if (!t) continue
    if (splitAmount(t)) continue
    if (/^[\d/\-.\s:]+$/.test(t)) continue
    if (/^tva|^ticket|^caisse/i.test(t)) continue
    return t.replace(/\s{2,}/g, ' ')
  }
  return 'Magasin inconnu'
}

export function parseTicket(text) {
  const rawLines = text.split(/\r?\n/)
  const lines = rawLines.map((l) => l.trim()).filter(Boolean)

  const store = detectStore(lines)
  const date = detectDate(text)

  const items = []
  let subtotalDeclared = null
  let totalDeclared = null
  let discountDeclared = null
  const globalDiscounts = []
  // Une fois la zone "récapitulatif" atteinte (sous-total / total), les lignes
  // de réduction qui suivent sont des récapitulatifs — on ne les rattache pas
  // aux produits pour éviter de compter deux fois la même promotion.
  let recap = false

  for (const line of lines) {
    const parsed = splitAmount(line)
    if (!parsed) continue
    const norm = normalizeStr(parsed.label)
    if (!norm) continue

    // « total », « totaal » (NL) et déformations OCR type « TOTA(A)L » -> « tota a l ».
    const isTotal =
      matchesAny(norm, LINE_KEYWORDS.total) || /^tot(a|aa|al)/.test(norm)
    const isSubtotal = matchesAny(norm, LINE_KEYWORDS.subtotal)
    const isDiscount =
      parsed.amount < 0 || matchesAny(norm, LINE_KEYWORDS.discount)
    // Lignes d'en-tête / paiement (téléphone, TVA, moyen de paiement…).
    const isNoise = matchesWord(norm, LINE_KEYWORDS.noise)

    if (isSubtotal) {
      subtotalDeclared = Math.abs(parsed.amount)
      recap = true
      continue
    }
    if (isTotal) {
      totalDeclared = Math.abs(parsed.amount)
      recap = true
      continue
    }
    if (recap) {
      // Dans le récapitulatif : on ne retient que la remise globale déclarée.
      if (isDiscount) discountDeclared = -Math.abs(parsed.amount)
      continue
    }
    // Ligne non-produit (numéro de téléphone, TVA, paiement…) : on l'ignore.
    if (isNoise) continue
    if (isDiscount) {
      const disc = -Math.abs(parsed.amount)
      const last = items[items.length - 1]
      if (last) {
        last.discount += disc
      } else {
        globalDiscounts.push(disc)
      }
      continue
    }

    // Ligne « 2 x 1,50   3,00 » : quantité × prix unitaire, total en fin de ligne.
    const mult = parsed.label.match(/^(\d{1,3})\s?[x×]\s?(\d+(?:[.,]\d{1,2})?)$/i)
    if (mult) {
      const qty = parseInt(mult[1], 10)
      const unit = parseAmount(mult[2])
      if (qty > 1 && unit != null && Math.abs(qty * unit - parsed.amount) < 0.02) {
        items.push({
          raw: parsed.label,
          rawNorm: norm,
          quantity: qty,
          unitPrice: unit,
          gross: parsed.amount,
          discount: 0,
        })
        continue
      }
    }

    // Ligne produit — regroupe les lignes identiques consécutives.
    const last = items[items.length - 1]
    if (
      last &&
      last.rawNorm === norm &&
      Math.abs(last.unitPrice - parsed.amount) < 0.001 &&
      last.discount === 0
    ) {
      last.quantity += 1
      last.gross = +(last.unitPrice * last.quantity).toFixed(2)
    } else {
      items.push({
        raw: parsed.label,
        rawNorm: norm,
        quantity: 1,
        unitPrice: parsed.amount,
        gross: parsed.amount,
        discount: 0,
      })
    }
  }

  // Nettoyage + net.
  const cleanItems = items.map((it) => ({
    raw: it.raw,
    quantity: it.quantity,
    unitPrice: +it.unitPrice.toFixed(2),
    gross: +it.gross.toFixed(2),
    discount: +it.discount.toFixed(2),
    net: +(it.gross + it.discount).toFixed(2),
  }))

  const globalDiscountTotal = +globalDiscounts.reduce((a, b) => a + b, 0).toFixed(2)
  const computedGross = +cleanItems.reduce((a, b) => a + b.gross, 0).toFixed(2)
  const computedDiscount = +(
    cleanItems.reduce((a, b) => a + b.discount, 0) + globalDiscountTotal
  ).toFixed(2)
  const computedTotal = +(computedGross + computedDiscount).toFixed(2)

  return {
    store,
    date,
    items: cleanItems,
    globalDiscountTotal,
    subtotalDeclared,
    totalDeclared,
    discountDeclared,
    computedGross,
    computedDiscount,
    computedTotal,
  }
}
