// Référentiel COICOP (Classification of Individual Consumption by Purpose) du projet.
//
// ⚠️ Sous-ensemble INTERNE, pas une copie certifiée d'un texte officiel : les codes
// et libellés ci-dessous n'ont pas été confrontés à l'édition publiée par l'ONU /
// Eurostat / Statbel (leur site n'était pas joignable lors de la mise en place). Ils
// ressemblent à la COICOP 1999 (« 01.1.1 Pain et céréales »…) mais l'édition n'est
// PAS confirmée. Tant que `verified` est faux, aucun code n'est présenté comme
// officiel et chaque code porte un statut. Pour passer à une édition officielle :
// remplacer `CODES` d'après le fichier source (code, intitulé FR/NL, niveau), mettre
// `edition`, `source` et `verified` à jour, et migrer les anciens codes
// explicitement (voir `COICOP_LEGACY_MIGRATIONS`) — jamais de reclassement silencieux.
export const COICOP_REFERENCE = {
  id: 'ticketscope-coicop-interne-v1', // identifiant écrit dans les exports
  edition: 'COICOP — sous-ensemble interne, édition non confirmée',
  language: 'fr',
  source: null, // à renseigner : URL / fichier de l'édition officielle
  verified: false,
  levels: ['division (2 chiffres)', 'groupe (01.1)', 'classe (01.1.1)'],
}

// statut : 'a_verifier' (non confronté à la source officielle) ou 'suspect'
// (incohérence connue, voir `note`).
const CODES = {
  '01.1.1': { label: 'Pain et céréales', status: 'a_verifier' },
  '01.1.2': { label: 'Viande', status: 'a_verifier' },
  '01.1.3': { label: 'Poisson et fruits de mer', status: 'a_verifier' },
  '01.1.4': { label: 'Lait, fromage et œufs', status: 'a_verifier' },
  '01.1.5': { label: 'Huiles et graisses', status: 'a_verifier' },
  '01.1.6': { label: 'Fruits', status: 'a_verifier' },
  '01.1.7': { label: 'Légumes', status: 'a_verifier' },
  '01.1.8': { label: 'Sucre, confiture, miel, chocolat et confiserie', status: 'a_verifier' },
  '01.1.9': { label: 'Produits alimentaires n.d.a.', status: 'a_verifier' },
  '02.1.2': {
    label: 'Boissons sans alcool',
    status: 'suspect',
    note: 'La division 02 est « Boissons alcoolisées et tabac » ; les boissons sans alcool sont normalement en division 01 (groupe 01.2). Correction à valider avec la source officielle.',
  },
  '03.1.1': { label: 'Tissus pour vêtements', status: 'a_verifier' },
  '03.1.2': { label: 'Vêtements', status: 'a_verifier' },
  '03.1.3': { label: 'Autres articles d\'habillement et accessoires', status: 'a_verifier' },
  '03.1.4': { label: 'Nettoyage, réparation et location de vêtements', status: 'a_verifier' },
  '03.2.1': { label: 'Chaussures et autres articles chaussants', status: 'a_verifier' },
  '03.2.2': { label: 'Réparation et location de chaussures', status: 'a_verifier' },
  '05.6.1': { label: 'Biens ménagers non durables', status: 'a_verifier' },
}

// Anciens codes → nouveaux, à renseigner lors d'un changement d'édition.
// Migration explicite et relisible ; vide tant que l'édition n'a pas changé.
export const COICOP_LEGACY_MIGRATIONS = {}

// Libellé par code (forme historique, utilisée par l'interface et le prompt IA).
export const COICOP_LABELS = Object.fromEntries(Object.entries(CODES).map(([c, v]) => [c, v.label]))

// Division COICOP (1er niveau) pour agrégation macro.
export const COICOP_DIVISIONS = {
  '01': 'Produits alimentaires et boissons non alcoolisées',
  '02': 'Boissons alcoolisées et tabac',
  '03': 'Articles d\'habillement et chaussures',
  '05': 'Meubles, articles de ménage et entretien courant',
}

const CODE_FORMAT = /^\d{2}(\.\d{1,2}){0,2}$/

// Le texte est-il un code COICOP bien formé (division, groupe ou classe) ?
export function isCoicopFormat(code) {
  return typeof code === 'string' && CODE_FORMAT.test(code)
}

// Le code appartient-il au référentiel du projet ?
export function isKnownCoicop(code) {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(CODES, code)
}

// { label, status, note? } ou null.
export function coicopInfo(code) {
  return isKnownCoicop(code) ? CODES[code] : null
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

export function coicopLabel(code) {
  if (!code) return 'Non classé'
  return COICOP_LABELS[code] || code
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
