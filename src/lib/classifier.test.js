import { describe, it, expect } from 'vitest'
import { classifyItems, RULE_CONFIDENCE, RULE_CONFIDENCE_GENERIC } from './classifier.js'

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
