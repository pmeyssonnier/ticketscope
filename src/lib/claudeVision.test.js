import { describe, it, expect } from 'vitest'
import { toDraft, safeModel, DEFAULT_AI_MODEL } from './claudeVision.js'
import { monthKey } from './format.js'
import { parseTicket } from './parser.js'

describe('claudeVision', () => {
  it('conserve les modèles connus et remplace les inconnus', () => {
    expect(DEFAULT_AI_MODEL).toBe('claude-haiku-4-5')
    expect(safeModel('claude-sonnet-5')).toBe('claude-sonnet-5')
    expect(safeModel('claude-sonnet-5-5')).toBe('claude-sonnet-5-5')
    expect(safeModel('claude-foo')).toBe(DEFAULT_AI_MODEL)
  })
  it('recalcule le net au lieu de se fier au modèle', () => {
    const d = toDraft({ store: 'S', date: '', total_paid: 3, items: [{ raw: 'A', product: 'A', quantity: 2, unit_price: 1.5, discount: -0.5, net: 99, coicop: '', confidence: 0.9 }] })
    expect(d.items[0].net).toBe(2.5)
    expect(d.items[0].needsReview).toBe(true) // coicop vide
  })
})

describe('dates', () => {
  it('monthKey sans décalage de fuseau', () => {
    expect(monthKey('2024-03-01')).toBe('2024-03')
  })
  it('rejette les dates impossibles et retente les suivantes', () => {
    expect(parseTicket('31/02/2024 puis 12/03/2024\nPAIN 1,00').date).toBe('2024-03-12')
    expect(parseTicket('PAIN 1,00').date).toBeNull()
  })
})

describe('toDraft — remises', () => {
  it('signale une remise supérieure au montant brut', () => {
    const d = toDraft({ store: 'S', date: '', total_paid: 0, items: [{ raw: 'A', product: 'A', quantity: 1, unit_price: 1, discount: -3.98, net: -2.98, coicop: '01.1.1', confidence: 0.95 }] })
    expect(d.items[0].needsReview).toBe(true)
  })
  it('garde une remise de lot répartie sur plusieurs lignes', () => {
    const items = [-1.33, -1.33, -1.32].map((discount) => ({ raw: 'B', product: 'Boxer', quantity: 1, unit_price: 7.99, discount, net: 0, coicop: '03.1.2', confidence: 0.9 }))
    const d = toDraft({ store: 'Celio', date: '', total_paid: 20, items })
    expect(d.items.every((it) => !it.needsReview)).toBe(true)
    expect(+d.items.reduce((a, b) => a + b.discount, 0).toFixed(2)).toBe(-3.98)
    expect(+d.items.reduce((a, b) => a + b.net, 0).toFixed(2)).toBe(19.99)
  })
})
