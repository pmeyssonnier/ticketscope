// Calculs monétaires en centimes entiers.
//
// Les montants restent stockés en euros (nombres à 2 décimales : tickets, sauvegardes
// et exports existants inchangés), mais tout calcul passe par des centimes entiers :
// pas de bruit de virgule flottante (0,1 + 0,2), arrondi commercial correct au demi-
// centime (0,5 kg × 0,99 €/kg = 0,495 € → 0,50 €, alors que (0.495).toFixed(2) donne
// « 0.49 »), sommes exactes, et comparaisons d'écarts sur des entiers.

// Euros (nombre ou texte) → centimes entiers ; demi-centime arrondi « loin de zéro ».
// Le toPrecision écarte le bruit binaire (100.49999999999999 → 100.5) avant d'arrondir.
export function toCents(euros) {
  const n = Number(euros)
  if (!Number.isFinite(n)) return 0
  const scaled = Number((Math.abs(n) * 100).toPrecision(12))
  return Math.sign(n) * Math.round(scaled)
}

export function fromCents(cents) {
  return cents / 100
}

// Arrondit un montant en euros au centime.
export function roundMoney(euros) {
  return fromCents(toCents(euros))
}

// Somme de montants en euros, exacte au centime.
export function sumMoney(values) {
  let c = 0
  for (const v of values) c += toCents(v)
  return fromCents(c)
}

// quantité × prix unitaire (la quantité peut être décimale : poids), au centime.
export function mulMoney(quantity, unitPrice) {
  const q = Number(quantity)
  const p = Number(unitPrice)
  if (!Number.isFinite(q) || !Number.isFinite(p)) return 0
  return fromCents(Math.sign(q * p) * Math.round(Number((Math.abs(q * p) * 100).toPrecision(12))))
}

// a − b au centime.
export function diffMoney(a, b) {
  return fromCents(toCents(a) - toCents(b))
}

// Deux montants valent-ils le même nombre de centimes (à `tolCents` près) ?
export function sameMoney(a, b, tolCents = 0) {
  return Math.abs(toCents(a) - toCents(b)) <= tolCents
}
