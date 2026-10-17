// Référentiel COICOP 2018 (Classification of Individual Consumption by Purpose).
//
// Structure officielle : `coicop2018.js` (divisions, groupes, classes ; titres en
// anglais), extraite du fichier COICOP_2018_English_structure.xlsx — empreinte
// SHA-256 dans le JSON. Les libellés FRANÇAIS ci-dessous sont une traduction du
// projet (la source est en anglais), pas un texte officiel. Seules les classes
// de `ACTIVE` sont proposées dans l'interface et au mode IA ; les autres codes
// officiels restent reconnus (import, export). Étendre `ACTIVE` = ajouter ici le
// code et son libellé français, sans changer les anciens codes.
//
// Changement d'édition : remplacer le JSON, mettre à jour `ACTIVE` et migrer les
// anciens codes explicitement (`COICOP_LEGACY_MIGRATIONS`) — jamais en silence.
import official from './coicop2018.js'

export const COICOP_REFERENCE = {
  id: 'coicop-2018', // identifiant écrit dans les exports
  edition: official.source.edition,
  source: `${official.source.file} (feuille ${official.source.sheet})`,
  sha256: official.source.sha256,
  language: 'fr (traduction du projet) ; titres officiels en anglais',
  verified: true, // codes et titres anglais confrontés au fichier source
  levels: ['division (01)', 'groupe (01.1)', 'classe (01.1.1)'],
}

// Titres officiels anglais : code → titre.
const OFFICIAL = new Map(official.codes)

// Classes proposées par l'application (libellé français : traduction du projet).
const ACTIVE = {
  '01.1.1': 'Céréales et produits céréaliers',
  '01.1.2': 'Viandes et autres parties d\'animaux terrestres abattus',
  '01.1.3': 'Poissons et autres fruits de mer',
  '01.1.4': 'Lait, autres produits laitiers et œufs',
  '01.1.5': 'Huiles et graisses',
  '01.1.6': 'Fruits et fruits à coque',
  '01.1.7': 'Légumes, tubercules, plantains, bananes à cuire et légumineuses',
  '01.1.8': 'Sucre, confiserie et desserts',
  '01.1.9': 'Plats préparés et autres produits alimentaires',
  '01.2.1': 'Jus de fruits et de légumes',
  '01.2.2': 'Café et succédanés du café',
  '01.2.3': 'Thé, maté et autres plantes pour infusion',
  '01.2.4': 'Boissons au cacao',
  '01.2.5': 'Eau',
  '01.2.6': 'Boissons rafraîchissantes (sodas)',
  '01.2.9': 'Autres boissons non alcoolisées',
  '02.1.1': 'Spiritueux et liqueurs',
  '02.1.2': 'Vin',
  '02.1.3': 'Bière',
  '02.1.9': 'Autres boissons alcoolisées',
  '02.3.0': 'Tabac',
  '03.1.1': 'Tissus pour vêtements',
  '03.1.2': 'Vêtements',
  '03.1.3': 'Autres articles d\'habillement et accessoires',
  '03.1.4': 'Nettoyage, réparation, retouche et location de vêtements',
  '03.2.1': 'Chaussures et autres articles chaussants',
  '03.2.2': 'Nettoyage, réparation et location de chaussures',
  '05.6.1': 'Biens ménagers non durables',
}

// Libellé français par code proposé (interface, prompt du mode IA).
export const COICOP_LABELS = ACTIVE

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

// Division COICOP (1er niveau) pour agrégation macro (traduction du projet).
export const COICOP_DIVISIONS = {
  '01': 'Produits alimentaires et boissons non alcoolisées',
  '02': 'Boissons alcoolisées, tabac et stupéfiants',
  '03': 'Articles d\'habillement et chaussures',
  '05': 'Ameublement, équipement ménager et entretien courant du logement',
}

const CODE_FORMAT = /^\d{2}(\.\d{1,2}){0,2}$/

// Le texte est-il un code COICOP bien formé (division, groupe ou classe) ?
export function isCoicopFormat(code) {
  return typeof code === 'string' && CODE_FORMAT.test(code)
}

// Le code figure-t-il dans la structure officielle COICOP 2018 (divisions, groupes, classes) ?
export function isKnownCoicop(code) {
  return typeof code === 'string' && OFFICIAL.has(code)
}

// { label (fr, sinon titre officiel), titleEn, level, official: true } ou null.
export function coicopInfo(code) {
  if (!isKnownCoicop(code)) return null
  return { label: ACTIVE[code] || OFFICIAL.get(code), titleEn: OFFICIAL.get(code), level: coicopLevel(code), official: true }
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
  return ACTIVE[code] || OFFICIAL.get(code) || code
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
