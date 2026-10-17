// Référentiel COICOP 2018 (Classification of Individual Consumption by Purpose).
//
// Structure officielle : `coicop2018.js` (divisions, groupes, classes) — codes et titres
// anglais du fichier de l'ONU, titres FRANÇAIS de la liste de codes Eurostat
// ESTAT:COICOP18 3.2 (les deux sources concordent sur les 264 codes). Pas encore de titres
// néerlandais. Seules les classes de `ACTIVE` sont proposées dans l'interface et au mode IA ;
// les autres codes officiels restent reconnus (import, export). Étendre `ACTIVE` = ajouter le
// code ici, sans changer les anciens codes.
//
// Changement d'édition : régénérer `coicop2018.js`, mettre à jour `ACTIVE` et migrer les
// anciens codes explicitement (`COICOP_LEGACY_MIGRATIONS`) — jamais en silence.
import official from './coicop2018.js'

export const COICOP_REFERENCE = {
  id: 'coicop-2018', // identifiant écrit dans les exports
  edition: official.sources[0].edition,
  sources: official.sources.map((x) => `${x.file}${x.sheet ? ` (feuille ${x.sheet})` : ''}`),
  sha256: official.sources.map((x) => x.sha256),
  language: 'en et fr officiels ; nl : à venir',
  verified: true, // codes et titres confrontés aux fichiers sources
  levels: ['division (01)', 'groupe (01.1)', 'classe (01.1.1)'],
}

// code → { en, fr } (titres officiels, suffixe de durabilité « (ND) » etc. inclus).
const OFFICIAL = new Map(official.codes.map(([code, en, fr]) => [code, { en, fr }]))

// Suffixe de durabilité de la nomenclature (ND non durable, SD semi-durable, D durable,
// S service) : retiré à l'affichage, conservé dans les données.
const plain = (title) => title.replace(/\s*\((?:ND|SD|D|S)\)\s*$/, '')

// Classes proposées par l'application.
const ACTIVE = [
  '01.1.1', '01.1.2', '01.1.3', '01.1.4', '01.1.5', '01.1.6', '01.1.7', '01.1.8', '01.1.9',
  '01.2.1', '01.2.2', '01.2.3', '01.2.4', '01.2.5', '01.2.6', '01.2.9',
  '02.1.1', '02.1.2', '02.1.3', '02.1.9', '02.3.0',
  '03.1.1', '03.1.2', '03.1.3', '03.1.4', '03.2.1', '03.2.2',
  '05.6.1',
]

// Libellé français officiel par code proposé (interface, prompt du mode IA).
export const COICOP_LABELS = Object.fromEntries(ACTIVE.map((c) => [c, plain(OFFICIAL.get(c).fr)]))

// Anciens codes de la version interne (avant COICOP 2018 officielle) dont le SENS a
// changé. Clé : ancien code ; `legacyLabel` : libellé qu'il portait (ce qui le
// distingue du code actuel de même numéro) ; `to` : code de repli officiel ;
// la ligne reste « à confirmer ».
export const COICOP_LEGACY_MIGRATIONS = {
  '02.1.2': {
    legacyLabel: 'Boissons sans alcool',
    to: '01.2.9',
    note: '02.1.2 est le vin en COICOP 2018 ; les boissons sans alcool sont en 01.2.x',
  },
}

// Applique la migration à toutes les lignes d'un ticket (renvoie le ticket tel quel s'il n'y a rien à migrer).
export function migrateTicketCoicop(ticket) {
  if (!ticket || !Array.isArray(ticket.items)) return ticket
  let changed = false
  const items = ticket.items.map((it) => {
    const next = migrateLegacyCoicop(it)
    if (next !== it) changed = true
    return next
  })
  return changed ? { ...ticket, items } : ticket
}

// Divisions COICOP des ménages (01 à 13), libellés français officiels, pour agrégation macro.
export const COICOP_DIVISIONS = Object.fromEntries(
  official.codes.filter(([c]) => /^(0[1-9]|1[0-3])$/.test(c)).map(([c, , fr]) => [c, plain(fr)]),
)

const CODE_FORMAT = /^\d{2}(\.\d{1,2}){0,2}$/

// Le texte est-il un code COICOP bien formé (division, groupe ou classe) ?
export function isCoicopFormat(code) {
  return typeof code === 'string' && CODE_FORMAT.test(code)
}

// Le code figure-t-il dans la structure officielle COICOP 2018 (divisions, groupes, classes) ?
export function isKnownCoicop(code) {
  return typeof code === 'string' && OFFICIAL.has(code)
}

// { label (fr, sans suffixe), titleFr, titleEn, level, official: true } ou null.
export function coicopInfo(code) {
  if (!isKnownCoicop(code)) return null
  const { en, fr } = OFFICIAL.get(code)
  return { label: plain(fr), titleFr: fr, titleEn: en, level: coicopLevel(code), official: true }
}

// Niveau : 1 division, 2 groupe, 3 classe ; null si le format est invalide.
export function coicopLevel(code) {
  if (!isCoicopFormat(code)) return null
  return code.split('.').length
}

// Parent hiérarchique (« 01.1.4 » → « 01.1 » → « 01 » → null).
export function coicopParent(code) {
  const level = coicopLevel(code)
  if (!level || level === 1) return null
  return code.split('.').slice(0, -1).join('.')
}

// Ancien code au sens périmé (voir COICOP_LEGACY_MIGRATIONS) : renvoie la ligne migrée,
// ou la ligne telle quelle. La ligne devient « à confirmer » et garde l'ancien code
// dans `coicopLegacy`. Idempotente.
export function migrateLegacyCoicop(item) {
  const m = item && COICOP_LEGACY_MIGRATIONS[item.coicop]
  if (!m || item.coicopLabel !== m.legacyLabel) return item
  return { ...item, coicop: m.to, coicopLabel: coicopLabel(m.to), coicopLegacy: item.coicop, needsReview: true }
}

export function coicopLabel(code) {
  if (!code) return 'Non classé'
  return OFFICIAL.has(code) ? plain(OFFICIAL.get(code).fr) : code
}

export function coicopDivision(code) {
  if (!code) return null
  return code.slice(0, 2)
}

export function coicopDivisionLabel(code) {
  const d = coicopDivision(code)
  if (!d) return 'Non classé'
  return COICOP_DIVISIONS[d] || d
}
