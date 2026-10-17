import { describe, it, expect } from 'vitest'
import { computeNeedsReview, recomputeAmounts, reviewSummary, formatGap } from './review.js'

const eur = (n) => `${n.toFixed(2).replace('.', ',')} €`
const item = (extra = {}) => ({ id: 'a', quantity: 1, unitPrice: 2, gross: 2, discount: 0, net: 2, coicop: '01.1.1', confidence: 0.95, ...extra })

describe('computeNeedsReview', () => {
  it('ligne classée avec bonne confiance : rien à confirmer', () => {
    expect(computeNeedsReview(item())).toBe(false)
  })
  it('non classée, ou classement douteux : à confirmer', () => {
    expect(computeNeedsReview(item({ coicop: null }))).toBe(true)
    expect(computeNeedsReview(item({ confidence: 0.6 }))).toBe(true)
  })
  it('lecture douteuse (OCR / IA) : à confirmer même si le classement est sûr', () => {
    expect(computeNeedsReview(item({ readConfidence: 0.5 }))).toBe(true)
    expect(computeNeedsReview(item({ readConfidence: 0.9 }))).toBe(false)
  })
  it('lecture inconnue (texte collé, ancien ticket) : ne déclenche rien', () => {
    expect(computeNeedsReview(item({ readConfidence: null }))).toBe(false)
    expect(computeNeedsReview(item({ readConfidence: undefined }))).toBe(false)
  })
  it('les lignes de remise n\'ont rien à classer', () => {
    expect(computeNeedsReview(item({ category: 'Remise', coicop: null, confidence: 0.2 }))).toBe(false)
  })
})

describe('recomputeAmounts', () => {
  it('recalcule brut et net depuis des champs saisis (chaînes)', () => {
    expect(recomputeAmounts(item({ quantity: '3', unitPrice: '1,5', discount: '-0.5' }))).toMatchObject({ gross: 0, net: -0.5 }) // « 1,5 » n'est pas un nombre : 0
    expect(recomputeAmounts(item({ quantity: '3', unitPrice: '1.5', discount: '-0.5' }))).toMatchObject({ gross: 4.5, net: 4 })
  })
})

describe('reviewSummary', () => {
  const items = [item({ gross: 10, discount: -1, net: 9, needsReview: true }), item({ gross: 5, discount: 0, net: 5 })]
  it('total recalculé, écart et compte de lignes à confirmer', () => {
    expect(reviewSummary(items, 0, 14)).toMatchObject({ net: 14, diff: 0, reconciled: true, reviewCount: 1 })
    expect(reviewSummary(items, 0, 107.96)).toMatchObject({ diff: -93.96, reconciled: false })
  })
  it('tient compte de la remise globale', () => {
    expect(reviewSummary(items, -2, 12)).toMatchObject({ net: 12, reconciled: true })
  })
  it('sans total lu : pas d\'écart', () => {
    expect(reviewSummary(items, 0, null)).toMatchObject({ declared: null, diff: null, reconciled: false })
  })
  it('tolère 1 centime d\'arrondi', () => {
    expect(reviewSummary(items, 0, 14.01).reconciled).toBe(true)
    expect(reviewSummary(items, 0, 14.05).reconciled).toBe(false)
  })
})

describe('formatGap', () => {
  it('signe explicite', () => {
    expect(formatGap(71.97, eur)).toBe('+71,97 €')
    expect(formatGap(-3.98, eur)).toBe('−3,98 €')
    expect(formatGap(0, eur)).toBe('0,00 €')
    expect(formatGap(null, eur)).toBe('—')
  })
})
