import { describe, it, expect } from 'vitest'
import { parseTicket } from './parser.js'
import { classifyItems } from './classifier.js'
import { parseAmount, normalizeStr } from './format.js'
import { SAMPLE_TICKET_TEXT } from '../data/sampleTicket.js'

describe('parseAmount', () => {
  it('parse les formats belges', () => {
    expect(parseAmount('25,60')).toBeCloseTo(25.6)
    expect(parseAmount('-51,20')).toBeCloseTo(-51.2)
    expect(parseAmount('1 234,56 €')).toBeCloseTo(1234.56)
    expect(parseAmount('6.35')).toBeCloseTo(6.35)
    expect(parseAmount('')).toBeNull()
  })
})

describe('normalizeStr', () => {
  it('retire accents et casse', () => {
    expect(normalizeStr('Œufs Pesseleux x12')).toContain('ufs')
    expect(normalizeStr('Réduction')).toBe('reduction')
  })
})

describe('parseTicket (ticket de référence)', () => {
  const t = parseTicket(SAMPLE_TICKET_TEXT)

  it('regroupe les DASH Pods en quantité 4 avec remise', () => {
    const dash = t.items.find((i) => /dash/i.test(i.raw))
    expect(dash.quantity).toBe(4)
    expect(dash.gross).toBeCloseTo(102.4)
    expect(dash.discount).toBeCloseTo(-51.2)
    expect(dash.net).toBeCloseTo(51.2)
  })

  it('ne compte pas deux fois la remise du récapitulatif', () => {
    expect(t.totalDeclared).toBeCloseTo(269.67)
    expect(t.computedTotal).toBeCloseTo(269.67, 1)
  })

  it('détecte le sous-total récapitulatif', () => {
    expect(t.subtotalDeclared).toBeCloseTo(320.87)
  })

  it('capture toutes les lignes produit distinctes', () => {
    // 45 lignes produit sur le ticket, dont 4 DASH regroupées + 2 Ginger Beer.
    expect(t.items.length).toBeGreaterThan(38)
  })
})

describe('classifyItems', () => {
  const t = parseTicket(SAMPLE_TICKET_TEXT)
  const classified = classifyItems(t.items)

  it('classe les DASH Pods en 05.6.1', () => {
    const dash = classified.find((i) => /dash/i.test(i.raw))
    expect(dash.coicop).toBe('05.6.1')
    expect(dash.confidence).toBeGreaterThan(0.7)
  })

  it('classe le tarama en 01.1.9 (base de référence)', () => {
    const tarama = classified.find((i) => /tarama/i.test(i.raw))
    expect(tarama.coicop).toBe('01.1.9')
  })

  it('classe le mélange d\'olives (Mix Ver) en 01.1.7 et la pâte de Dubaï en 01.1.8', () => {
    const olives = classified.find((i) => /mix ver/i.test(i.raw))
    expect(olives.coicop).toBe('01.1.7')
    const dubai = classified.find((i) => /dubaich/i.test(i.raw))
    expect(dubai.coicop).toBe('01.1.8')
  })

  it('tolère les libellés OCR abrégés du ticket Proxy', () => {
    const raws = [
      { raw: '400GR TOM.CERISES', coicop: '01.1.7' },
      { raw: '3OO0ML DID SAUC HAM', coicop: '01.1.9' },
      { raw: 'AMERICIAN MARTINO', coicop: '01.1.2' },
    ]
    const out = classifyItems(
      raws.map((r) => ({ raw: r.raw, quantity: 1, unitPrice: 1, gross: 1, discount: 0, net: 1 })),
    )
    out.forEach((c, i) => expect(c.coicop).toBe(raws[i].coicop))
  })

  it('marque les produits inconnus pour révision', () => {
    const [res] = classifyItems([
      { raw: 'PRODUIT XYZ INCONNU', quantity: 1, unitPrice: 1, gross: 1, discount: 0, net: 1 },
    ])
    expect(res.coicop).toBeNull()
    expect(res.needsReview).toBe(true)
  })

  it('classe la majorité des lignes automatiquement', () => {
    const classifiedCount = classified.filter((i) => i.coicop).length
    expect(classifiedCount / classified.length).toBeGreaterThan(0.8)
  })
})
