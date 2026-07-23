import { describe, it, expect } from 'vitest'
import { ticketEngine, ticketStats, alignItems, pairStatus } from './compare.js'

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
