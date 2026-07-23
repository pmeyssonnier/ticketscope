// Aide à la classification : à partir du nom de produit saisi par l'utilisateur,
// propose un code COICOP et une catégorie.
//
// Deux sources, par ordre de priorité :
//   1. le dictionnaire produits (mots-clés curés, très fiables) ;
//   2. des règles génériques par mot-clé de catégorie (chocolat -> confiserie…).
//
// C'est une aide : l'utilisateur voit la suggestion et l'applique s'il est
// d'accord. Fonction pure -> testable sans navigateur.

import { normalizeStr } from './format.js'
import { PRODUCT_DICTIONARY } from '../data/dictionary.js'
import { coicopLabel } from '../data/coicop.js'

// Règles génériques. `p` = priorité (plus haut = plus déterminant) pour
// départager les chevauchements (« jus d'orange » -> boisson, pas fruit).
const RULES = [
  { p: 2, coicop: '02.1.2', category: 'Boissons sans alcool', kw: ['jus', 'soda', 'limonade', 'cola', 'sirop', 'nectar', 'ice tea', 'the glace', 'eau petillante', 'eau plate', 'boisson', 'tonic', 'ginger'] },
  { p: 2, coicop: '05.6.1', category: "Produits d'entretien", kw: ['lessive', 'nettoyant', 'detergent', 'assouplissant', 'javel', 'vaisselle', 'desinfectant', 'anticalcaire', 'adoucissant', 'wc', 'savon menager'] },
  { p: 1, coicop: '01.1.3', category: 'Poisson et fruits de mer', kw: ['poisson', 'saumon', 'thon', 'cabillaud', 'crevette', 'scampi', 'moule', 'surimi', 'tarama', 'colin', 'maquereau', 'sardine'] },
  { p: 1, coicop: '01.1.2', category: 'Viandes', kw: ['viande', 'boeuf', 'porc', 'poulet', 'dinde', 'jambon', 'saucisse', 'lardon', 'burger', 'steak', 'hache', 'charcuterie', 'salami', 'bacon', 'iberico', 'chorizo', 'merguez'] },
  { p: 1, coicop: '01.1.4', category: 'Produits laitiers et œufs', kw: ['lait', 'fromage', 'yaourt', 'yogurt', 'oeuf', 'beurre', 'creme', 'mozzarella', 'parmesan', 'parmigiano', 'comte', 'feta', 'skyr', 'chester', 'gouda', 'brie'] },
  { p: 1, coicop: '01.1.5', category: 'Huiles et graisses', kw: ['huile', 'margarine', 'graisse'] },
  { p: 1, coicop: '01.1.8', category: 'Confiserie', kw: ['chocolat', 'choco', 'bonbon', 'confiserie', 'biscuit', 'gateau', 'confiture', 'miel', 'pate a tartiner', 'nutella', 'eclair', 'patisserie', 'tarte', 'praline', 'cereales', 'sable', 'gaufre'] },
  { p: 1, coicop: '01.1.7', category: 'Légumes', kw: ['legume', 'tomate', 'oignon', 'carotte', 'salade', 'courgette', 'poivron', 'concombre', 'patate', 'brocoli', 'epinard', 'champignon', 'olive', 'mesclun', 'gazpacho', 'haricot', 'poireau'] },
  { p: 1, coicop: '01.1.6', category: 'Fruits', kw: ['fruit', 'pomme', 'banane', 'fraise', 'orange', 'raisin', 'poire', 'kiwi', 'citron', 'peche', 'abricot', 'ananas', 'mangue', 'melon', 'cerise', 'framboise', 'myrtille'] },
  { p: 1, coicop: '01.1.1', category: 'Pain et céréales', kw: ['pain', 'baguette', 'farine', 'riz', 'pates', 'couscous', 'biscotte', 'pistolet', 'croissant', 'viennoiserie', 'cereale'] },
  { p: 0, coicop: '01.1.9', category: 'Produits alimentaires divers', kw: ['sauce', 'chips', 'snack', 'soupe', 'plat', 'quiche', 'pizza', 'surgele', 'conserve', 'apero', 'aperitif', 'grissini', 'ravioli', 'bami', 'pesto', 'epice'] },
]

// Correspondance d'un mot-clé de règle : mot entier (ou pluriel), pour éviter
// les faux positifs de sous-chaîne (« riz » dans « chorizo »). Les mots-clés
// composés (avec espace) sont cherchés tels quels.
function ruleHit(norm, k) {
  if (k.includes(' ')) return norm.includes(k)
  return norm.split(' ').some((t) => t === k || t.startsWith(k))
}

export function suggestClassification(name) {
  const norm = normalizeStr(name)
  if (!norm || norm.replace(/[^a-z]/g, '').length < 3) return null

  let win = null // { p, len, coicop, category }
  const consider = (p, len, coicop, category) => {
    if (!win || p > win.p || (p === win.p && len > win.len)) win = { p, len, coicop, category }
  }

  // 1) Dictionnaire produits (priorité maximale : mots-clés curés).
  for (const e of PRODUCT_DICTIONARY) {
    for (const kw of e.keywords || []) {
      const k = normalizeStr(kw)
      if (!k || !norm.includes(k)) continue
      if (e.mustAll && !e.mustAll.every((m) => norm.includes(normalizeStr(m)))) continue
      consider(3, k.length, e.coicop, e.category)
    }
  }

  // 2) Règles génériques de catégorie.
  for (const r of RULES) {
    for (const kw of r.kw) {
      const k = normalizeStr(kw)
      if (k && ruleHit(norm, k)) consider(r.p, k.length, r.coicop, r.category)
    }
  }

  if (!win) return null
  return { coicop: win.coicop, category: win.category, label: coicopLabel(win.coicop) }
}
