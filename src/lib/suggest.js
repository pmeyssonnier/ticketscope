// Aide à la classification : à partir du nom de produit saisi par l'utilisateur,
// propose un code COICOP et une catégorie.
//
// Deux sources, par ordre de priorité :
//   1. le dictionnaire produits (mots-clés curés, très fiables) ;
//   2. des règles génériques par mot-clé de catégorie (chocolat -> confiserie…).
//
// C'est une aide : l'utilisateur voit la suggestion et l'applique s'il est
// d'accord. Fonction pure -> testable sans navigateur.

import { normalizeStr, hasWord } from './format.js'
import { PRODUCT_DICTIONARY } from '../data/dictionary.js'
import { coicopLabel } from '../data/coicop.js'

// Règles génériques. `p` = priorité (plus haut = plus déterminant) pour
// départager les chevauchements (« jus d'orange » -> boisson, pas fruit).
const RULES = [
  { p: 2, coicop: '01.2.1', category: 'Jus', kw: ['jus', 'nectar'] },
  { p: 2, coicop: '01.2.5', category: 'Eau', kw: ['eau petillante', 'eau plate', 'eau gazeuse', 'eau minerale'] },
  { p: 2, coicop: '01.2.6', category: 'Boissons rafraîchissantes', kw: ['soda', 'limonade', 'cola', 'sirop', 'ice tea', 'the glace', 'tonic', 'ginger'] },
  { p: 2, coicop: '01.2.9', category: 'Boissons sans alcool', kw: ['boisson'] },
  { p: 2, coicop: '01.2.2', category: 'Café', kw: ['cafe', 'espresso', 'nespresso'] },
  { p: 2, coicop: '01.2.3', category: 'Thé et infusions', kw: ['infusion', 'tisane', 'the vert', 'the noir', 'earl grey', 'lipton'] },
  { p: 2, coicop: '02.1.2', category: 'Vin', kw: ['vin rouge', 'vin blanc', 'vin rose', 'champagne', 'cava', 'prosecco'] },
  { p: 2, coicop: '02.1.3', category: 'Bière', kw: ['biere', 'pils', 'lager'] },
  { p: 2, coicop: '02.1.1', category: 'Spiritueux', kw: ['whisky', 'vodka', 'rhum', 'cognac', 'liqueur'] },
  { p: 2, coicop: '01.1.9', category: 'Sauces et condiments', kw: ['sauce', 'ketchup', 'mayonnaise', 'moutarde', 'vinaigre'] },
  // --- Soins corporels, santé, ménage, carburant, restauration (classes 2018 : 13.1.2, 13.1.3, 06.1.x, 05.x, 07.2.2, 11.1.x) ---
  // Mots-clés tirés du texte officiel de chaque classe ; papier toilette et mouchoirs sont en 13.1.2
  // (pas 05.6.1). Pas de mot-clé court qui ouvrirait un autre mot (« bol » → « bolognaise »).
  { p: 2, coicop: '13.1.2', category: 'Soins corporels et hygiène', kw: ['shampooing', 'shampoing', 'dentifrice', 'brosse a dents', 'deodorant', 'gel douche', 'savon', 'rasoir', 'mousse a raser', 'creme solaire', 'creme visage', 'creme mains', 'lait corporel', 'mouchoir', 'papier toilette', 'parfum', 'maquillage', 'mascara', 'rouge a levres', 'vernis a ongles', 'demaquillant', 'lime a ongles', 'peigne', 'brosse a cheveux', 'laque', 'apres rasage', 'serviettes hygieniques', 'proteges slips', 'cotons tiges', 'coton demaquillant'] },
  { p: 2, coicop: '13.1.3', category: 'Coiffure et soins de beauté', kw: ['coiffeur', 'coiffure', 'barbier', 'brushing', 'coupe homme', 'coupe femme', 'coupe enfant', 'manucure', 'pedicure'] },
  { p: 2, coicop: '06.1.1', category: 'Médicaments', kw: ['medicament', 'comprime', 'gelule', 'paracetamol', 'ibuprofene', 'dafalgan', 'aspirine', 'pommade', 'antibiotique', 'homeopathie', 'sirop toux'] },
  { p: 2, coicop: '06.1.2', category: 'Produits médicaux', kw: ['pansement', 'bandage', 'thermometre', 'test de grossesse', 'preservatif', 'masque chirurgical', 'compresse', 'seringue', 'tensiometre', 'bas de contention'] },
  { p: 2, coicop: '07.2.2', category: 'Carburants et lubrifiants', kw: ['diesel', 'gasoil', 'sp95', 'sp98', 'e10', 'euro 95', 'euro95', 'carburant', 'huile moteur', 'lpg', 'autogas'] },
  { p: 2, coicop: '11.1.1', category: 'Restaurants et cafés', kw: ['restaurant', 'plat du jour', 'menu'] },
  { p: 2, coicop: '11.1.2', category: 'Cantines', kw: ['cantine', 'refectoire', 'cafeteria'] },
  { p: 2, coicop: '03.2.2', category: 'Réparation de chaussures', kw: ['reparation chaussures', 'ressemelage', 'talonnage', 'cordonnier', 'cordonnerie'] },
  { p: 2, coicop: '05.2.1', category: 'Linge de maison', kw: ['drap', 'housse de couette', 'taie', 'plaid', 'couverture', 'rideau', 'serviette de bain', 'tapis de bain'] },
  { p: 2, coicop: '05.3.2', category: 'Petits appareils ménagers', kw: ['grille pain', 'mixeur', 'blender', 'bouilloire', 'cafetiere', 'machine a cafe', 'robot de cuisine', 'friteuse', 'fer a repasser', 'ventilateur'] },
  { p: 2, coicop: '05.4.0', category: 'Vaisselle et ustensiles', kw: ['verre', 'assiette', 'tasse', 'mug', 'fourchette', 'cuillere', 'couteau', 'casserole', 'poele', 'saladier', 'carafe', 'plat a four', 'moule a gateau'] },
  { p: 2, coicop: '04.3.1', category: 'Matériaux et fournitures de bricolage', kw: ['bonde', 'siphon', 'profile', 'profil alu', 'peinture', 'vernis bois', 'lasure', 'enduit', 'mastic', 'silicone', 'cheville', 'visserie', 'boulon', 'tuyau', 'raccord', 'robinet', 'colle carrelage', 'ciment', 'platre', 'plinthe', 'tasseau', 'cadenas', 'serrure'] },
  { p: 2, coicop: '05.5.2', category: 'Outillage non motorisé', kw: ['marteau', 'tournevis', 'pince', 'echelle', 'arrosoir', 'rateau', 'secateur', 'ampoule'] },
  { p: 2, coicop: '05.6.1', category: "Produits d'entretien", kw: ['lessive', 'nettoyant', 'detergent', 'assouplissant', 'javel', 'vaisselle', 'desinfectant', 'anticalcaire', 'adoucissant', 'wc', 'savon menager', 'essuie tout', 'papier aluminium', 'sacs poubelle', 'sac poubelle', 'bougie', 'eponge', 'pince a linge', 'cirage'] },
  { p: 1, coicop: '01.1.3', category: 'Poisson et fruits de mer', kw: ['poisson', 'saumon', 'thon', 'cabillaud', 'crevette', 'scampi', 'moule', 'surimi', 'tarama', 'colin', 'maquereau', 'sardine'] },
  { p: 1, coicop: '01.1.2', category: 'Viandes', kw: ['viande', 'boeuf', 'porc', 'poulet', 'dinde', 'jambon', 'saucisse', 'lardon', 'burger', 'steak', 'hache', 'charcuterie', 'salami', 'bacon', 'iberico', 'chorizo', 'merguez'] },
  { p: 1, coicop: '01.1.4', category: 'Produits laitiers et œufs', kw: ['lait', 'fromage', 'yaourt', 'yogurt', 'oeuf', 'beurre', 'creme', 'mozzarella', 'parmesan', 'parmigiano', 'comte', 'feta', 'skyr', 'chester', 'gouda', 'brie'] },
  { p: 1, coicop: '01.1.5', category: 'Huiles et graisses', kw: ['huile', 'margarine', 'graisse'] },
  { p: 1, coicop: '01.1.8', category: 'Confiserie', kw: ['chocolat', 'choco', 'bonbon', 'confiserie', 'confiture', 'miel', 'pate a tartiner', 'nutella', 'praline'] },
  // Biscuits, gâteaux, pâtisseries, gaufres : « pain et produits de boulangerie » (01.1.1.3) en COICOP 2018, pas confiserie.
  { p: 2, coicop: '01.1.1', category: 'Biscuits et pâtisserie', kw: ['biscuit', 'gateau', 'eclair', 'patisserie', 'tarte', 'sable', 'gaufre', 'muffin', 'cookie'] },
  { p: 1, coicop: '01.1.7', category: 'Légumes', kw: ['legume', 'tomate', 'oignon', 'carotte', 'salade', 'courgette', 'poivron', 'concombre', 'patate', 'brocoli', 'epinard', 'champignon', 'olive', 'mesclun', 'haricot', 'poireau', 'chips'] },
  { p: 1, coicop: '01.1.6', category: 'Fruits', kw: ['fruit', 'pomme', 'banane', 'fraise', 'orange', 'raisin', 'poire', 'kiwi', 'citron', 'peche', 'abricot', 'ananas', 'mangue', 'melon', 'cerise', 'framboise', 'myrtille'] },
  { p: 1, coicop: '01.1.1', category: 'Pain et céréales', kw: ['pain', 'baguette', 'farine', 'riz', 'pates', 'couscous', 'biscotte', 'pistolet', 'croissant', 'viennoiserie', 'cereale', 'grissini', 'ravioli'] },
  { p: 1, coicop: '03.2.1', category: 'Chaussures', kw: ['chaussure', 'lacet', 'semelle', 'basket', 'sneaker', 'botte', 'bottine', 'sandale', 'mocassin', 'escarpin', 'pantoufle', 'tong', 'ballerine'] },
  { p: 1, coicop: '03.1.3', category: 'Accessoires', kw: ['ceinture', 'echarpe', 'bonnet', 'gant', 'cravate', 'casquette', 'chapeau', 'foulard', 'chaussette', 'collant', 'bretelle', 'noeud papillon'] },
  { p: 1, coicop: '03.1.2', category: 'Vêtements', kw: ['vetement', 'boxer', 'slip', 'calecon', 'chemise', 'chemisier', 'pantalon', 'jean', 'pull', 'gilet', 'cardigan', 'veste', 'manteau', 'blouson', 'parka', 'doudoune', 'imper', 'polo', 't shirt', 'tshirt', 'debardeur', 'sweat', 'jogging', 'legging', 'short', 'bermuda', 'jupe', 'robe', 'costume', 'blouse', 'pyjama', 'lingerie', 'soutien', 'maillot', 'peignoir', 'survet'] },
  // Soupes prêtes à consommer (01.1.9.1) : le légume du nom (« soupe tomate ») ne décide pas.
  { p: 2, coicop: '01.1.9', category: 'Soupes', kw: ['soupe', 'potage', 'gazpacho', 'veloute'] },
  { p: 0, coicop: '01.1.9', category: 'Produits alimentaires divers', kw: ['sauce', 'snack', 'soupe', 'gazpacho', 'plat', 'quiche', 'pizza', 'surgele', 'conserve', 'apero', 'aperitif', 'bami', 'pesto', 'epice'] },
]

// Correspondance d'un mot-clé de règle : mot entier (ou pluriel), pour éviter
// les faux positifs de sous-chaîne (« riz » dans « chorizo »). Les mots-clés
// composés (avec espace) sont cherchés tels quels.
function ruleHit(norm, k) {
  if (k.includes(' ')) return hasWord(norm, k)
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
      if (!k || !hasWord(norm, k)) continue
      if (e.mustAll && !e.mustAll.every((m) => hasWord(norm, normalizeStr(m)))) continue
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
  // `priority` : 3 = dictionnaire, 2/1 = règles précises, 0 = règle très générique.
  return { coicop: win.coicop, category: win.category, label: coicopLabel(win.coicop), priority: win.p }
}
