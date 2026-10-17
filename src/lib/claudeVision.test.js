import { describe, it, expect } from 'vitest'
import { toDraft, safeModel, reconcileDiscounts, applyPromotions, DEFAULT_AI_MODEL } from './claudeVision.js'
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

describe('reconcileDiscounts', () => {
  const mk = (discount) => ({ gross: 7.99, discount, net: +(7.99 + discount).toFixed(2), needsReview: false })
  it('ramène -3,30 à -3,98 pour atteindre le total payé', () => {
    const items = [mk(-1.1), mk(-1.1), mk(-1.1), { gross: 17.99, discount: 0, net: 17.99 }, { gross: 29.99, discount: 0, net: 29.99 }, { gross: 39.99, discount: 0, net: 39.99 }]
    const out = reconcileDiscounts(items, 107.96)
    expect(+out.reduce((a, b) => a + b.discount, 0).toFixed(2)).toBe(-3.98)
    expect(+out.reduce((a, b) => a + b.net, 0).toFixed(2)).toBe(107.96)
    expect(out.slice(0, 3).every((it) => it.needsReview)).toBe(true)
    expect(out[3].needsReview).toBeFalsy()
  })
  it('ne touche à rien si déjà cohérent ou sans remise', () => {
    const ok = [mk(-1.33), mk(-1.33), mk(-1.32)]
    expect(reconcileDiscounts(ok, 19.99)).toBe(ok)
    const none = [{ gross: 5, discount: 0, net: 5 }]
    expect(reconcileDiscounts(none, 9)).toBe(none)
  })
  it('ignore un écart non plausible', () => {
    const items = [mk(-1), { gross: 10, discount: 0, net: 10 }]
    expect(reconcileDiscounts(items, 1)).toBe(items)
  })
})

describe('promotions de lot (ticket Celio)', () => {
  const line = (raw, unit_price) => ({ raw, product: raw, quantity: 1, unit_price, discount: 0, net: unit_price, coicop: '03.1.2', confidence: 0.9 })
  const six = [line('NIWOBIBOUP LIGHT PINK,XL', 7.99), line('MICUADRO BLUE SKY,XL', 7.99), line('DAXFORDMC BLUE,XXL', 17.99), line('DIBISTRIPE BLUE SKY,XL', 7.99), line('PASHAN BLUE NAVY,XXL', 29.99), line('LAPOUKI NAVY,XL', 39.99)]
  const total = (d) => +d.items.reduce((a, b) => a + b.net, 0).toFixed(2) + d.globalDiscountTotal

  it('répartit la promotion sur les articles désignés', () => {
    const d = toDraft({ store: 'Celio', date: '2026-10-17', total_paid: 107.96, items: six, promotions: [{ label: 'Boxers 3 x 19,99EUR', amount: -3.98, item_numbers: [1, 2, 4] }] })
    expect(d.items).toHaveLength(6)
    expect(d.items.map((x) => x.discount)).toEqual([-1.33, -1.33, 0, -1.32, 0, 0])
    expect(+total(d).toFixed(2)).toBe(107.96)
    expect(d.globalDiscountTotal).toBe(0)
  })
  it('retire la promo restée parmi les produits (remise globale)', () => {
    const promo = { raw: 'Boxers 3 x 19,99EUR', product: 'Boxers', quantity: 3, unit_price: 19.99, discount: -3.98, net: 55.99, coicop: '03.1.2', confidence: 0.9 }
    const d = toDraft({ store: 'Celio', date: '', total_paid: 107.96, items: [...six, promo], promotions: [] })
    expect(d.items).toHaveLength(6)
    expect(d.globalDiscountTotal).toBe(-3.98)
    expect(+total(d).toFixed(2)).toBe(107.96)
  })
  it('sans article identifiable, la remise reste globale', () => {
    const r = applyPromotions(toDraft({ store: '', date: '', total_paid: 0, items: six, promotions: [] }).items, [{ label: 'x', amount: -3.98, item_numbers: [] }])
    expect(r.globalDiscountTotal).toBe(-3.98)
    expect(r.items.every((x) => x.discount === 0)).toBe(true)
  })
  it('ne retire pas un vrai produit « 6 x 1,50EUR » sans remise', () => {
    const d = toDraft({ store: '', date: '', total_paid: 9, items: [{ raw: 'EAU 6 x 1,50EUR', product: 'Eau', quantity: 1, unit_price: 9, discount: 0, net: 9, coicop: '02.1.2', confidence: 0.9 }], promotions: [] })
    expect(d.items).toHaveLength(1)
  })
})
