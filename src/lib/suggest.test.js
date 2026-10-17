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
      'Sucre, confiserie et desserts',
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
})

