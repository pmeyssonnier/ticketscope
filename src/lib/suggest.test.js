import { describe, it, expect } from 'vitest'
import { suggestClassification } from './suggest.js'

describe('suggestClassification', () => {
  const cases = [
    ['Chocolat noir de Dubaï', '01.1.8'],
    ['Olives vertes apéritif', '01.1.7'],
    ['Filet de poulet', '01.1.2'],
    ['Jus d’orange', '02.1.2'], // boisson prioritaire sur « orange »
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
      'Sucre, confiture, miel, chocolat et confiserie',
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
