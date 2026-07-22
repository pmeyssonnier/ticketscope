// Base de connaissances produits de TicketScope BE.
//
// Chaque entrée relie des libellés bruts (tels qu'ils apparaissent sur un
// ticket, souvent abrégés) à un produit normalisé, une marque, un code COICOP
// et une catégorie fine. Elle est issue du jeu de référence
// `ticket_proxy_coicop.xlsx` enrichi des libellés bruts du ticket d'exemple.
//
// `keywords` : fragments recherchés dans le libellé brut (comparaison sans
// accents ni casse). Une entrée est retenue si l'un de ses keywords est présent.
// `mustAll`  : (optionnel) tous ces fragments doivent être présents (désambiguïse
//              les libellés proches).
//
// La base est destinée à grandir : les corrections utilisateur y ajoutent des
// entrées locales (voir lib/storage.js).

export const PRODUCT_DICTIONARY = [
  // --- Produits d'entretien (05.6.1) ---
  { id: 'dash-pods', normalized: 'Lessive DASH Pods', brand: 'Dash', coicop: '05.6.1', category: "Produits d'entretien", keywords: ['dash pods', 'dash pod', 'dash'] },
  { id: 'calgon', normalized: 'Calgon Tabs', brand: 'Calgon', coicop: '05.6.1', category: "Produits d'entretien", keywords: ['calgon'] },
  { id: 'le-chat', normalized: 'Lessive Le Chat', brand: 'Le Chat', coicop: '05.6.1', category: "Produits d'entretien", keywords: ['le chat'] },
  { id: 'lenor', normalized: 'Assouplissant Lenor', brand: 'Lenor', coicop: '05.6.1', category: "Produits d'entretien", keywords: ['lenor'] },

  // --- Légumes (01.1.7) ---
  { id: 'oignon', normalized: 'Oignon rouge', coicop: '01.1.7', category: 'Légumes', keywords: ['oignon'] },
  { id: 'gazpacho', normalized: 'Gazpacho', coicop: '01.1.7', category: 'Légumes', keywords: ['gazpacho'] },
  { id: 'mix-olives', normalized: "Mélange d'olives apéritif", coicop: '01.1.7', category: 'Apéritif / Olives', keywords: ['mix ver no oli', 'mix ver', 'mix olives'] },
  { id: 'tomates-vrac', normalized: 'Tomates fraîches', coicop: '01.1.7', category: 'Légumes', keywords: ['tomates charnues', 'tom charnue', 'tomate charnue'] },
  { id: 'mesclun', normalized: 'Mesclun', coicop: '01.1.7', category: 'Légumes', keywords: ['mesclun'] },
  { id: 'tomates-cerises', normalized: 'Tomates cerises', coicop: '01.1.7', category: 'Légumes', keywords: ['tomates cerises', 'tomate cerise', 'tom cerises', 'tom cerise'] },

  // --- Fruits (01.1.6) ---
  { id: 'pomme', normalized: 'Pomme bio', coicop: '01.1.6', category: 'Fruits', keywords: ['pomme'] },
  { id: 'fraises', normalized: 'Fraises', coicop: '01.1.6', category: 'Fruits', keywords: ['fraise'] },

  // --- Produits laitiers et œufs / Fromages (01.1.4) ---
  { id: 'yaourt', normalized: 'Yaourt maigre bio', coicop: '01.1.4', category: 'Produits laitiers et œufs', keywords: ['yaourt', 'yogurt'] },
  { id: 'oikos', normalized: 'Yaourt Oikos Stracciatella', brand: 'Oikos', coicop: '01.1.4', category: 'Produits laitiers et œufs', keywords: ['oikos', 'stracciatella'] },
  { id: 'oeufs', normalized: 'Œufs x12', coicop: '01.1.4', category: 'Produits laitiers et œufs', keywords: ['oeufs', 'œufs', 'pesseleux'] },
  { id: 'mezzel-parma', normalized: 'Parmigiano (Parma)', brand: 'Mezzel', coicop: '01.1.4', category: 'Fromages', keywords: ['parma', 'parmigiano', 'mezzel'] },
  { id: 'chester', normalized: 'Chester', coicop: '01.1.4', category: 'Fromages', keywords: ['chester'] },
  { id: 'fromage-aop', normalized: "Fromage d'Abondance AOP", coicop: '01.1.4', category: 'Fromages', keywords: ['abondance'] },
  { id: 'comte-aop', normalized: 'Comté / Tomme AOP', coicop: '01.1.4', category: 'Fromages', keywords: ['comte', 'tomme'] },

  // --- Huiles et graisses (01.1.5) ---
  { id: 'bertolli', normalized: "Huile d'olive Bertolli", brand: 'Bertolli', coicop: '01.1.5', category: 'Huiles et graisses', keywords: ['bertolli'] },

  // --- Pain (01.1.1) ---
  { id: 'pepper-bun', normalized: 'Premium Pepper Bun', coicop: '01.1.1', category: 'Pain', keywords: ['pepper bun', 'premium pepper'] },
  { id: 'sac-pain', normalized: 'Sac de pain', coicop: '01.1.1', category: 'Pain', keywords: ['sac pain', 'sac de pain'], mustAll: ['sac', 'pain'] },
  { id: 'pains-tradition', normalized: 'Pains tradition (x6)', coicop: '01.1.1', category: 'Pain', keywords: ['pains tradition', 'pain tradition', '6 pains'] },

  // --- Viandes (01.1.2) ---
  { id: 'american-martino', normalized: 'American Martino (préparation)', coicop: '01.1.2', category: 'Viandes', keywords: ['american martino', 'martino'] },
  { id: 'iberico-burger', normalized: 'Iberico Burger', coicop: '01.1.2', category: 'Viandes', keywords: ['iberico'] },

  // --- Sucre, confiserie, petit-déjeuner, biscuits, pâtisserie (01.1.8) ---
  { id: 'jord-crunch', normalized: 'Céréales Jord Crunch Choco', brand: 'Jord', coicop: '01.1.8', category: 'Petit-déjeuner', keywords: ['jord crunch', 'jord'] },
  { id: 'chocolat-bio', normalized: 'Chocolat bio', coicop: '01.1.8', category: 'Confiserie', keywords: ['chocolat bio'] },
  { id: 'gusto-dubaich', normalized: 'Pâte de chocolat de Dubaï', brand: 'Gusto', coicop: '01.1.8', category: 'Confiserie', keywords: ['gusto dubaich', 'dubaich'] },
  { id: 'nocciolat', normalized: 'Pâte à tartiner chocolat bio', coicop: '01.1.8', category: 'Confiserie', keywords: ['nocciolat'] },
  { id: 'crunchy-choco', normalized: 'Crunchy Choco', coicop: '01.1.8', category: 'Petit-déjeuner', keywords: ['crunchy choco', 'crunchy'] },
  { id: 'biscuits-sables', normalized: 'Biscuits sablés au beurre', coicop: '01.1.8', category: 'Biscuits', keywords: ['biscuits sable', 'sable beu', 'sables beurre', 'sable beurre'] },
  { id: 'eclair', normalized: 'Éclair au chocolat', coicop: '01.1.8', category: 'Pâtisserie', keywords: ['eclair'] },

  // --- Boissons sans alcool (02.1.2) ---
  { id: 'ginger-beer', normalized: 'Bunda Ginger Beer', brand: 'Bunda', coicop: '02.1.2', category: 'Boissons sans alcool', keywords: ['ginger beer', 'bunda'] },

  // --- Produits alimentaires divers (01.1.9) ---
  { id: 'chips-camembert', normalized: 'Chips Camembert', coicop: '01.1.9', category: 'Snacks', keywords: ['chips camembert', 'chips'] },
  { id: 'grissini', normalized: 'Grissini', coicop: '01.1.9', category: 'Snacks', keywords: ['grissini'] },
  { id: 'sauce-jambon', normalized: 'Sauce au jambon', coicop: '01.1.9', category: 'Produits alimentaires divers', keywords: ['sauce jambon', 'sauc ham', 'did sauc'] },
  { id: 'ravioli', normalized: 'Ravioli frais Bertagni', brand: 'Bertagni', coicop: '01.1.9', category: 'Plats préparés', keywords: ['ravioli', 'bertagni'] },
  { id: 'mccain', normalized: 'Frites McCain Airfry', brand: 'McCain', coicop: '01.1.9', category: 'Surgelés', keywords: ['mccain', 'airfry'] },
  { id: 'tarama', normalized: 'Tarama', brand: 'Dili', coicop: '01.1.9', category: 'Épicerie', keywords: ['tarama'] },
  { id: 'bami-goreng', normalized: 'Bami Goreng préparé', brand: 'Dili', coicop: '01.1.9', category: 'Plats préparés', keywords: ['bami goreng', 'bami'] },
  { id: 'quiche-saumon', normalized: 'Quiche saumon-brocoli', coicop: '01.1.9', category: 'Plats préparés', keywords: ['quiche saumon'], mustAll: ['quiche', 'saumon'] },
  { id: 'quiche-olives', normalized: 'Quiche olives-feta', coicop: '01.1.9', category: 'Plats préparés', keywords: ['quiche olives', 'quiche olive'], mustAll: ['quiche', 'olive'] },
]

// Types de lignes non-produit détectables sur un ticket.
// `discount` : mots qui font d'une ligne (à montant positif) une remise. Les
// marqueurs promo « 3+1 », « 1+1 » sont volontairement exclus car ils préfixent
// souvent un produit vendu au prix normal (ex. « 3+1 Éclair Choco 4,19 »). Une
// ligne à montant négatif est toujours traitée comme une remise.
export const LINE_KEYWORDS = {
  discount: ['reduction', 'remise', 'ristourne', 'avantage fidelite', 'coupon', 'cashback', 'bon de reduction'],
  total: ['total paye', 'total a payer', 'total du', 'net a payer', 'montant du'],
  subtotal: ['total avant', 'sous-total', 'sous total'],
}
