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
// Montant « 12,50 », « -3.98 », « 3,98- », « 1 234,56 € » → nombre. Toute valeur
// malformée (« 12,5abc », « 12-34 », « 1,2,3 ») donne null plutôt qu'un chiffre
// approximatif.
// Le mot-clé `k` (déjà normalisé) figure-t-il dans `norm` (idem) comme mot entier ?
// Début de mot obligatoire, fin de mot tolérant le pluriel (« pomme » ~ « pommes »),
// mais pas une sous-chaîne interne (« lait » n'est pas dans « laitue », « pain » pas
// dans « epinards »). Fonctionne aussi pour les mots-clés de plusieurs mots.
export function hasWord(norm, k) {
  if (!norm || !k) return false
  const esc = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^| )${esc}(s|x|es)?( |$)`).test(norm)
}

export function parseAmount(s) {
  if (s == null) return null
  const t0 = s.toString().trim().replace(/[€\s]/g, '')
  if (!t0) return null
  const m = /^(-)?([^-]*?)(-)?$/.exec(t0)
  if (!m || (m[1] && m[3])) return null
  const neg = Boolean(m[1] || m[3])
  let t = m[2]
  // Si virgule et point présents, le dernier est le séparateur décimal.
  if (t.includes(',') && t.includes('.')) {
    if (t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g, '').replace(',', '.')
    else t = t.replace(/,/g, '')
  } else {
    t = t.replace(',', '.')
  }
  if (!/^(\d+(\.\d+)?|\.\d+)$/.test(t)) return null
  const n = Number(t)
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
  // Date ISO « AAAA-MM-JJ » : lue telle quelle (évite le décalage de fuseau).
  const m = /^(\d{4})-(\d{2})-\d{2}/.exec(String(iso))
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}-${m[2]}`
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
