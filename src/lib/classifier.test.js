import { describe, it, expect } from 'vitest'
import { classifyItems, RULE_CONFIDENCE, RULE_CONFIDENCE_GENERIC } from './classifier.js'
import { hasWord } from './format.js'

const mk = (raw) => ({ id: raw, raw, qty: 1, net: 1 })

describe('repli par règles du classement local', () => {
  it('classe un produit absent du dictionnaire grâce aux règles génériques', () => {
    const [p] = classifyItems([mk('PANTALON CHINO SLIM')])
    expect(p.source).toBe('regle')
    expect(p.coicop).toBe('03.1.2')
    expect(p.confidence).toBeLessThanOrEqual(RULE_CONFIDENCE)
    expect(p.confidence).toBeGreaterThanOrEqual(RULE_CONFIDENCE_GENERIC)
    expect(p.needsReview).toBe(true)
  })

  it('garde « inconnu » quand aucune règle ne correspond', () => {
    const [u] = classifyItems([mk('ZORGLUB MACHIN TRUC')])
    expect(u.source).toBe('inconnu')
    expect(u.coicop).toBeNull()
    expect(u.confidence).toBe(0.25)
    expect(u.needsReview).toBe(true)
  })

  it('le dictionnaire reste prioritaire sur les règles', () => {
    const [q] = classifyItems([mk('QUICHE SAUMON BROC')])
    expect(q.source).not.toBe('regle')
    expect(q.needsReview).toBe(false)
  })
})

describe('hasWord (mot entier, pas sous-chaîne)', () => {
  it('trouve un mot, son pluriel et une expression', () => {
    expect(hasWord('lait demi ecreme', 'lait')).toBe(true)
    expect(hasWord('pommes golden', 'pomme')).toBe(true)
    expect(hasWord('creme fraiche 20cl', 'creme fraiche')).toBe(true)
  })

  it('refuse une sous-chaîne interne ou un autre mot', () => {
    expect(hasWord('laitue romaine', 'lait')).toBe(false)
    expect(hasWord('epinards', 'pina')).toBe(false)
    expect(hasWord('chocolatine', 'chocolat')).toBe(false)
    expect(hasWord('', 'lait')).toBe(false)
  })

  it('les caractères spéciaux du mot-clé sont littéraux', () => {
    expect(hasWord('a b', 'a.b')).toBe(false)
  })
})

describe('correspondances apprises', () => {
  const learned = [{ keywords: ['lait'], normalized: 'Lait', coicop: '01.1.4', category: 'Lait' }]
  const mkItem = (raw) => ({ id: raw, raw, qty: 1, net: 1 })

  it('exacte : confiance maximale, pas à confirmer', () => {
    const [p] = classifyItems([mkItem('LAIT DEMI ECREME 1L')], learned)
    expect(p.source).toBe('appris')
    expect(p.confidence).toBe(0.99)
    expect(p.needsReview).toBe(false)
  })

  it('un mot-clé appris au milieu d\'un autre mot (laitue ~ lait) n\'est jamais « sûr »', () => {
    const [p] = classifyItems([mkItem('LAITUE ROMAINE')], learned)
    expect(p.confidence).toBeLessThan(0.75)
    expect(p.needsReview).toBe(true)
  })

  it('approximative (faute OCR) : proposée à confirmer, jamais 0,99', () => {
    const l = [{ keywords: ['zorglub'], normalized: 'Zorglub', coicop: '01.1.9', category: 'X' }]
    const [p] = classifyItems([mkItem('ZORGLUR 500G')], l)
    expect(p.source).toBe('appris')
    expect(p.confidence).toBeLessThan(0.75)
    expect(p.needsReview).toBe(true)
  })

  it('une correspondance exacte l\'emporte sur une approximative, quel que soit l\'ordre', () => {
    const l = [
      { keywords: ['zorglur'], normalized: 'Faux', coicop: '01.1.1', category: 'A' },
      { keywords: ['zorglub'], normalized: 'Bon', coicop: '01.1.9', category: 'B' },
    ]
    const [p] = classifyItems([mkItem('ZORGLUB 500G')], l)
    expect(p.normalized).toBe('Bon')
    expect(p.confidence).toBe(0.99)
  })
})

describe('correspondance approximative du dictionnaire vs règle précise', () => {
  const mkItem = (raw) => ({ id: raw, raw, qty: 1, net: 1 })

  it('« COUPE HOMME » n\'est pas la pomme du dictionnaire (« homme » ~ « pomme ») mais une coupe de cheveux', () => {
    const [p] = classifyItems([mkItem('COUPE HOMME')])
    expect(p.source).toBe('regle')
    expect(p.coicop).toBe('13.1.3')
    expect(p.needsReview).toBe(true)
  })

  it('sans règle précise, la correspondance approximative du dictionnaire reste proposée (à confirmer)', () => {
    const [p] = classifyItems([mkItem('QUICHE OLTVES FETA')])
    expect(p.source).toBe('dictionnaire')
    expect(p.needsReview).toBe(true)
  })
})
