// Utilitaires de formatage et de normalisation de texte.

// Retire accents, casse et ponctuation superflue pour la comparaison de libellés.
export function normalizeStr(s) {
  return (s || '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritiques
    .toLowerCase()
    .replace(/[^a-z0-9+ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Parse un montant "25,60" ou "-51.20" ou "1 234,56 €" -> Number (ou null).
export function parseAmount(s) {
  if (s == null) return null
  let t = s.toString().trim().replace(/[€\s]/g, '')
  if (!t) return null
  const neg = /^-/.test(t) || /-$/.test(t)
  t = t.replace(/-/g, '')
  // Si virgule et point présents, le dernier est le séparateur décimal.
  if (t.includes(',') && t.includes('.')) {
    if (t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g, '').replace(',', '.')
    else t = t.replace(/,/g, '')
  } else {
    t = t.replace(',', '.')
  }
  const n = parseFloat(t)
  if (Number.isNaN(n)) return null
  return neg ? -n : n
}

export function formatEUR(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' }).format(n)
}

export function formatPct(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('fr-BE', { style: 'percent', maximumFractionDigits: 0 }).format(n)
}

export function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat('fr-BE', { dateStyle: 'medium' }).format(d)
}

export function monthKey(iso) {
  if (!iso) return 'Inconnu'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Inconnu'
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`
}

// Transforme un libellé brut de ticket en nom lisible : retire les tailles /
// quantités (« 145G », « 26 », « 750ML »…) et met en forme (Majuscule initiale).
// Sert de point de départ quand on applique une suggestion à un produit inconnu.
export function titleFromRaw(raw) {
  return (raw || '')
    .replace(/\b\d+([.,]\d+)?\s?(g|gr|kg|ml|cl|l|x|pc|pcs)\b/gi, ' ')
    .replace(/^\s*\d+\s+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/(^|\s)(\S)/g, (m, sp, ch) => sp + ch.toUpperCase())
}
