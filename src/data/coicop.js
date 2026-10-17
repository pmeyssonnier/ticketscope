// Référence COICOP (Classification of Individual Consumption by Purpose).
// Libellés officiels (niveau groupe / classe) pour les codes rencontrés dans
// la base produits. La catégorie fine ("Légumes", "Fromages"...) reste portée
// par chaque produit ; ce tableau donne le libellé normalisé du code COICOP.
export const COICOP_LABELS = {
  '01.1.1': 'Pain et céréales',
  '01.1.2': 'Viande',
  '01.1.3': 'Poisson et fruits de mer',
  '01.1.4': 'Lait, fromage et œufs',
  '01.1.5': 'Huiles et graisses',
  '01.1.6': 'Fruits',
  '01.1.7': 'Légumes',
  '01.1.8': 'Sucre, confiture, miel, chocolat et confiserie',
  '01.1.9': 'Produits alimentaires n.d.a.',
  '02.1.2': 'Boissons sans alcool',
  '03.1.1': 'Tissus pour vêtements',
  '03.1.2': 'Vêtements',
  '03.1.3': 'Autres articles d\'habillement et accessoires',
  '03.1.4': 'Nettoyage, réparation et location de vêtements',
  '03.2.1': 'Chaussures et autres articles chaussants',
  '03.2.2': 'Réparation et location de chaussures',
  '05.6.1': 'Biens ménagers non durables',
}

// Division COICOP (1er niveau) pour agrégation macro.
export const COICOP_DIVISIONS = {
  '01': 'Produits alimentaires et boissons non alcoolisées',
  '02': 'Boissons alcoolisées et tabac',
  '03': 'Articles d\'habillement et chaussures',
  '05': 'Meubles, articles de ménage et entretien courant',
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
