import { describe, it, expect } from 'vitest'
import { ticketEngine, ticketStats, alignItems, pairStatus, diceCoefficient } from './compare.js'

const iaTicket = {
  engine: 'ia',
  totalDeclared: 14.0,
  items: [
    { normalized: 'Lait demi-écrémé', raw: '880ML LE CHAT', quantity: 1, net: 5.98, coicop: '01.1.4', confidence: 0.9, source: 'ia' },
    { normalized: 'Fraises', raw: 'FRAISE', quantity: 1, net: 5.49, coicop: '01.1.6', confidence: 0.8, source: 'ia' },
    { normalized: 'Chocolat', raw: 'NOCCIOLAT', quantity: 1, net: 2.53, coicop: null, confidence: 0.5, source: 'ia', needsReview: true },
  ],
}

const ocrTicket = {
  engine: 'local',
  totalDeclared: 14.0,
  items: [
    { normalized: 'Lait demi-écrémé', raw: '880ML LE CHAT', quantity: 1, net: 5.98, coicop: '01.1.4', confidence: 0.85, source: 'dictionnaire' },
    { normalized: 'Fraises', raw: 'FRAISE', quantity: 1, net: 5.49, coicop: '01.1.7', confidence: 0.7, source: 'dictionnaire' },
  ],
}

describe('ticketEngine', () => {
  it('lit le champ engine explicite', () => {
    expect(ticketEngine(iaTicket)).toBe('ia')
    expect(ticketEngine(ocrTicket)).toBe('local')
  })
  it('déduit ia des sources de ligne pour les anciens tickets', () => {
    expect(ticketEngine({ items: [{ source: 'ia' }, { source: 'ia' }] })).toBe('ia')
    expect(ticketEngine({ items: [{ source: 'dictionnaire' }] })).toBe('local')
  })
})

describe('ticketStats', () => {
  it('agrège lignes, net, écart, confiance, à confirmer', () => {
    const s = ticketStats(iaTicket)
    expect(s.lines).toBe(3)
    expect(s.net).toBe(14.0)
    expect(s.declared).toBe(14.0)
    expect(s.diff).toBe(0)
    expect(s.classified).toBe(2)
    expect(s.review).toBe(1)
    expect(s.avgConf).toBeCloseTo(0.73, 2)
  })
})

describe('alignItems', () => {
  it('apparie par nom normalisé, communes en tête', () => {
    const rows = alignItems(iaTicket, ocrTicket)
    // Lait + Fraises (communes) + Chocolat (IA seul)
    expect(rows.length).toBe(3)
    const lait = rows.find((r) => r.key === 'lait demi ecreme')
    expect(lait.a).toBeTruthy()
    expect(lait.b).toBeTruthy()
    expect(pairStatus(lait)).toBe('same')
    const choco = rows.find((r) => r.key.includes('chocolat'))
    expect(choco.a).toBeTruthy()
    expect(choco.b).toBeNull()
    expect(pairStatus(choco)).toBe('only-a')
  })
  it('détecte un COICOP divergent sur une ligne commune', () => {
    const rows = alignItems(iaTicket, ocrTicket)
    const fraises = rows.find((r) => r.key === 'fraises')
    expect(pairStatus(fraises)).toBe('coicop-diff')
  })
})

describe('appariement flou (libellés proches)', () => {
  it('apparie des noms normalisés différents mais même libellé brut', () => {
    const a = { items: [{ raw: 'AMERICIAN MARTINO', normalized: 'American Martino', net: 2.69, coicop: '01.1.2', confidence: 0.5, source: 'ia' }] }
    const b = { items: [{ raw: 'AMERICIAN MARTINO', normalized: 'American Martino (préparation)', net: 2.69, coicop: '01.1.2', confidence: 0.95, source: 'dictionnaire' }] }
    const rows = alignItems(a, b)
    expect(rows.length).toBe(1)
    expect(rows[0].a).toBeTruthy()
    expect(rows[0].b).toBeTruthy()
    expect(pairStatus(rows[0])).toBe('same')
  })

  it('apparie malgré le bruit OCR sur le libellé brut', () => {
    const a = { items: [{ raw: 'DLL BAMI GORENG', normalized: 'Bami Goreng', net: 4.59, coicop: '01.1.9', confidence: 0.55 }] }
    const b = { items: [{ raw: 'DLI. RAMI GORENG', normalized: 'Bami Goreng préparé', net: 4.59, coicop: '01.1.9', confidence: 0.7 }] }
    const rows = alignItems(a, b)
    expect(rows.length).toBe(1)
    expect(rows[0].a && rows[0].b).toBeTruthy()
  })

  it('ne fusionne pas deux produits distincts au même prix', () => {
    const a = { items: [
      { raw: 'QUICHE SAUMON BROC', normalized: 'Quiche saumon', net: 8.99, coicop: '01.1.9' },
      { raw: 'QUICHE OLIVES FETA', normalized: 'Quiche olives', net: 8.99, coicop: '01.1.9' },
    ] }
    const b = { items: [
      { raw: 'QUICHE OLIVES FETA', normalized: 'Quiche olives feta', net: 8.99, coicop: '01.1.9' },
      { raw: 'QUICHE SAUMON BROC', normalized: 'Quiche saumon brocoli', net: 8.99, coicop: '01.1.9' },
    ] }
    const rows = alignItems(a, b)
    expect(rows.length).toBe(2)
    // chaque quiche appariée avec son homologue exact
    for (const r of rows) {
      expect(r.a && r.b).toBeTruthy()
      expect(r.a.raw).toBe(r.b.raw)
    }
  })

  it('diceCoefficient : 1 si identique, 0 si disjoint', () => {
    expect(diceCoefficient('abc', 'abc')).toBe(1)
    expect(diceCoefficient('abcdef', 'xyz')).toBe(0)
    expect(diceCoefficient('bami goreng', 'rami goreng')).toBeGreaterThan(0.6)
  })
})
