import { describe, it, expect } from 'vitest'
import { toCents, fromCents, roundMoney, sumMoney, mulMoney, diffMoney, sameMoney } from './money.js'

describe('montants en centimes', () => {
  it('toCents : entiers exacts, texte accepté, valeurs invalides = 0', () => {
    expect(toCents(12.5)).toBe(1250)
    expect(toCents('3,98'.replace(',', '.'))).toBe(398)
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(toCents(1.1 * 3)).toBe(330)
    expect(toCents(NaN)).toBe(0)
    expect(toCents(null)).toBe(0)
    expect(toCents(undefined)).toBe(0)
  })

  it('arrondi commercial au demi-centime, symétrique pour les négatifs', () => {
    expect(roundMoney(0.495)).toBe(0.5) // (0.495).toFixed(2) donne « 0.49 »
    expect(roundMoney(1.005)).toBe(1.01) // (1.005).toFixed(2) donne « 1.00 »
    expect(roundMoney(2.675)).toBe(2.68) // (2.675).toFixed(2) donne « 2.67 »
    expect(roundMoney(-0.495)).toBe(-0.5)
    expect(roundMoney(-3.98)).toBe(-3.98)
  })

  it('sumMoney : somme exacte, sans bruit de virgule flottante', () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3)
    expect(sumMoney(Array(10).fill(0.1))).toBe(1)
    expect(sumMoney([7.99, 7.99, 17.99, 7.99, 29.99, 39.99, -3.98])).toBe(107.96)
    expect(sumMoney([])).toBe(0)
  })

  it('mulMoney : quantité décimale (poids) × prix, arrondi au centime', () => {
    expect(mulMoney(0.5, 0.99)).toBe(0.5)
    expect(mulMoney(3, 7.99)).toBe(23.97)
    expect(mulMoney(0.335, 2.99)).toBe(1)
    expect(mulMoney(2, -1.5)).toBe(-3)
    expect(mulMoney('x', 2)).toBe(0)
  })

  it('diffMoney / sameMoney', () => {
    expect(diffMoney(109.96, 107.96)).toBe(2)
    expect(diffMoney(0.3, 0.1 + 0.2)).toBe(0)
    expect(sameMoney(1.0, 1.01)).toBe(false)
    expect(sameMoney(1.0, 1.01, 1)).toBe(true)
    expect(fromCents(398)).toBe(3.98)
  })
})
