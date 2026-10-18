import { describe, it, expect } from 'vitest'
import { suggestClassification } from './suggest.js'

describe('suggestClassification', () => {
  const cases = [
    ['Chocolat noir de Dubaï', '01.1.8'],
    ['Olives vertes apéritif', '01.1.7'],
    ['Filet de poulet', '01.1.2'],
    ['Jus d’orange', '01.2.1'], // boisson prioritaire sur « orange »
    ['Lessive liquide', '05.6.1'],
    ['Yaourt nature', '01.1.4'],
    ['Saumon fumé', '01.1.3'],
    ['Huile de tournesol', '01.1.5'],
    ['Baguette tradition', '01.1.1'],
    ['Pommes Golden', '01.1.6'],
  ]
  it.each(cases)('« %s » -> %s', (name, coicop) => {
    const s = suggestClassification(name)
    expect(s).not.toBeNull()
    expect(s.coicop).toBe(coicop)
  })

  it('renvoie un libellé lisible', () => {
    expect(suggestClassification('Chocolat').label).toBe(
      'Sucre, confiseries et desserts',
    )
  })

  it('ne devine rien pour une saisie trop courte ou vide', () => {
    expect(suggestClassification('')).toBeNull()
    expect(suggestClassification('x')).toBeNull()
  })

  it("n'est pas piégé par les sous-chaînes (« chorizo » ne matche pas « riz »)", () => {
    // chorizo -> charcuterie (viande), pas pain via « riz »
    expect(suggestClassification('Chorizo').coicop).toBe('01.1.2')
  })
})

describe('suggestClassification — habillement', () => {
  it.each([
    ['BOXERS 3 PACK', '03.1.2'],
    ['Chemise lin bleu', '03.1.2'],
    ['T-shirt blanc XL', '03.1.2'],
    ['Pantalon chino navy', '03.1.2'],
    ['Chaussettes x3', '03.1.3'],
    ['Ceinture cuir', '03.1.3'],
    ['Baskets blanches', '03.2.1'],
  ])('%s -> %s', (name, code) => {
    expect(suggestClassification(name)?.coicop).toBe(code)
  })
  it('ne confond pas avec l\'alimentaire', () => {
    expect(suggestClassification('Chorizo doux')?.coicop).toBe('01.1.2')
    expect(suggestClassification('Pain de campagne')?.coicop).toBe('01.1.1')
  })
})

describe('suggestClassification — accessoires de chaussures', () => {
  it('lacets et semelles : chaussures, pas alimentaire', () => {
    expect(suggestClassification('Lacet gros rond vert dik 90 brun')?.coicop).toBe('03.2.1')
    expect(suggestClassification('Semelles confort')?.coicop).toBe('03.2.1')
  })

  it('boissons : codes COICOP 2018 (café 01.2.2, eau 01.2.5, soda 01.2.6, vin 02.1.2…)', () => {
    const code = (n) => suggestClassification(n)?.coicop
    expect(code('CAFE MOULU 250G')).toBe('01.2.2')
    expect(code('Eau plate 6x1,5L')).toBe('01.2.5')
    expect(code('Cola zero 1,5L')).toBe('01.2.6')
    expect(code('Vin rouge Bordeaux')).toBe('02.1.2')
    expect(code('Biere Jupiler 6x25cl')).toBe('02.1.3')
    expect(code('Thé vert menthe')).toBe('01.2.3')
  })

  it('sauces et condiments : 01.1.9 (même avec « tomate » dans le libellé)', () => {
    expect(suggestClassification('SAUCE TOMATE 400G').coicop).toBe('01.1.9')
    expect(suggestClassification('Ketchup 500ml').coicop).toBe('01.1.9')
  })

  it('pas de faux positifs boissons : gingembre, vinaigre, thermomètre', () => {
    expect(suggestClassification('Gingembre frais')?.coicop).not.toBe('02.1.1')
    expect(suggestClassification('Vinaigre balsamique')?.coicop).not.toBe('02.1.2')
    expect(suggestClassification('Thermos 1L')?.coicop).not.toBe('01.2.3')
  })

  it('lacets, cirage, cordonnerie', () => {
    expect(suggestClassification('Lacets bruns 90cm').coicop).toBe('03.2.1')
    expect(suggestClassification('Lacet gros rond vet dik 90 brun').coicop).toBe('03.2.1')
    expect(suggestClassification('Cirage noir').coicop).toBe('05.6.1')
    expect(suggestClassification('Ressemelage homme').coicop).toBe('03.2.2')
  })

  it('nouvelles classes : soins corporels, santé, carburant, restauration, ménage', () => {
    const code = (n) => suggestClassification(n)?.coicop
    expect(code('SHAMPOOING DOUX 250ML')).toBe('13.1.2')
    expect(code('Dentifrice 75ml')).toBe('13.1.2')
    expect(code('COUPE HOMME')).toBe('13.1.3')
    expect(code('DAFALGAN 500MG 16 COMP')).toBe('06.1.1')
    expect(code('Pansements 20 pcs')).toBe('06.1.2')
    expect(code('DIESEL B7')).toBe('07.2.2')
    expect(code('MENU ENFANT')).toBe('11.1.1')
    expect(code('CANTINE SCOLAIRE')).toBe('11.1.2')
    expect(code('DRAP HOUSSE 140X200')).toBe('05.2.1')
    expect(code('BOUILLOIRE 1.7L')).toBe('05.3.2')
    expect(code('ASSIETTE PLATE X6')).toBe('05.4.0')
    expect(code('MARTEAU 500G')).toBe('05.5.2')
  })

  it('papier toilette et mouchoirs : soins corporels (13.1.2), pas produits ménagers (texte officiel)', () => {
    expect(suggestClassification('PAPIER TOILETTE 12 ROULEAUX').coicop).toBe('13.1.2')
    expect(suggestClassification('Mouchoirs en papier').coicop).toBe('13.1.2')
    expect(suggestClassification('Sacs poubelle 30L').coicop).toBe('05.6.1')
    expect(suggestClassification('Papier aluminium').coicop).toBe('05.6.1')
  })

  it('priorités : le mot précis l\'emporte sur le mot général', () => {
    const code = (n) => suggestClassification(n)?.coicop
    expect(code('Savon vaisselle citron')).toBe('05.6.1') // pas 13.1.2
    expect(code('Savon de Marseille')).toBe('13.1.2')
    expect(code('Lait corporel')).toBe('13.1.2') // pas 01.1.4
    expect(code('Creme solaire SPF50')).toBe('13.1.2') // pas crème (01.1.4)
    expect(code('Huile moteur 5W30')).toBe('07.2.2') // pas 01.1.5
    expect(code('Huile d\'olive')).toBe('01.1.5')
    expect(code('Cafetiere 12 tasses')).toBe('05.3.2') // pas café (01.2.2)
    expect(code('Pince a linge x20')).toBe('05.6.1') // pas outillage
  })

  it('pas de faux positifs : bolognaise, essence de vanille, gingembre, pellets, science', () => {
    const code = (n) => suggestClassification(n)?.coicop
    expect(code('Sauce bolognaise')).toBe('01.1.9')
    expect(code('Essence de vanille')).not.toBe('07.2.2')
    expect(code('Gingembre frais')).not.toBe('13.1.2')
    expect(code('Pellets de bois')).not.toBe('05.5.2')
    expect(code('Science et vie')).not.toBe('05.5.2')
  })

  it('COICOP 2018 : biscuits, gâteaux, éclairs = produits de boulangerie (01.1.1), pas confiserie', () => {
    const code = (n) => suggestClassification(n)?.coicop
    expect(code('Biscuits au chocolat')).toBe('01.1.1') // pas 01.1.8 malgré « chocolat »
    expect(code('Gateau chocolat')).toBe('01.1.1')
    expect(code('3+1 ECLAIR CHOCO')).toBe('01.1.1')
    expect(code('Gaufres')).toBe('01.1.1')
    expect(code('Tablette chocolat noir')).toBe('01.1.8')
    expect(code('Miel de fleurs')).toBe('01.1.8')
  })

  it('COICOP 2018 : chips = légumes préparés (01.1.7.9), gazpacho = soupe prête à consommer (01.1.9)', () => {
    const code = (n) => suggestClassification(n)?.coicop
    expect(code('Chips nature 200g')).toBe('01.1.7')
    expect(code('Gazpacho 1L')).toBe('01.1.9')
    expect(code('Soupe tomate')).toBe('01.1.9')
    expect(code('Frites surgelees')).toBeDefined()
  })
})

