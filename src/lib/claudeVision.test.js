import { describe, it, expect } from 'vitest'
import { toDraft, safeModel, DEFAULT_AI_MODEL } from './claudeVision.js'
import { monthKey } from './format.js'
import { parseTicket } from './parser.js'

describe('claudeVision', () => {
  it('migre les anciens identifiants de modèle', () => {
    expect(safeModel('claude-haiku-4-5')).toBe(DEFAULT_AI_MODEL)
    expect(safeModel('claude-sonnet-5')).toBe(DEFAULT_AI_MODEL)
    expect(safeModel('claude-sonnet-5-5')).toBe('claude-sonnet-5-5')
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
