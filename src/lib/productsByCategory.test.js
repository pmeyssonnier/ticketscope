import { describe, it, expect } from 'vitest'
import { productLines, groupProductLines, applyLineCorrection, lineKey } from './productsByCategory.js'

const tickets = [
  { id: 'a', store: 'Brico', date: '2026-10-01', items: [
    { id: 1, raw: 'BOUQUET 2', normalized: 'Bouquet', coicop: null, category: 'Inconnu', net: 24.99, needsReview: true },
    { id: 2, raw: 'PAIN BIO', normalized: 'Pain bio', coicop: '01.1.1', category: 'Pain', net: 3.29 },
    { id: 3, raw: 'REDUCTION', normalized: 'Réduction', coicop: null, category: 'Remise', net: -1 },
  ] },
  { id: 'b', store: 'Proxy', date: '2026-10-02', items: [
    { id: 1, raw: 'VESTE', normalized: 'Veste', coicop: null, category: 'Inconnu', net: 8, needsReview: true },
    { id: 2, raw: 'AJOUT', normalized: 'Ajout', coicop: '01.1.1', category: 'Pain', net: 1, manual: true },
  ] },
]

describe('produits par catégorie', () => {
  it('écarte les remises et garde la provenance', () => {
    const l = productLines(tickets)
    expect(l).toHaveLength(4)
    expect(l[0]).toMatchObject({ id: 'a:1', ticketId: 'a', itemId: 1, store: 'Brico' })
  })
  it('filtre par produit, libellé brut ou magasin', () => {
    expect(productLines(tickets, 'veste')).toHaveLength(1)
    expect(productLines(tickets, 'proxy')).toHaveLength(2)
  })
  it('place « Non classé » en premier', () => {
    const g = groupProductLines(productLines(tickets))
    expect(g[0]).toMatchObject({ code: null, label: 'Non classé' })
    expect(g[0].items).toHaveLength(2)
  })
  it('reclasse une ligne : confirmée, catégorie renseignée, seuls les tickets touchés sont renvoyés', () => {
    const r = applyLineCorrection(tickets, [lineKey('a', 1)], '09.3.1')
    expect(r.tickets).toHaveLength(1)
    expect(r.tickets[0].items[0]).toMatchObject({ coicop: '09.3.1', confidence: 1, source: 'manuel', needsReview: false, corrected: true })
    expect(r.tickets[0].items[0].category).not.toBe('Inconnu')
    expect(r.tickets[0].items[1].coicop).toBe('01.1.1')
    expect(r.learn).toEqual([{ raw: 'BOUQUET 2', correction: expect.objectContaining({ coicop: '09.3.1' }) }])
  })
  it("n'apprend pas les lignes ajoutées à la main et garde une catégorie existante", () => {
    const r = applyLineCorrection(tickets, [lineKey('b', 2)], '01.1.2')
    expect(r.learn).toHaveLength(0)
    expect(r.tickets[0].items[1].category).toBe('Pain')
  })
})
