import { describe, it, expect } from 'vitest'
import { planReclassification, applyReclassification, changeKey } from './bulkReclassify.js'

const line = (id, raw, extra = {}) => ({ id, raw, normalized: raw, quantity: 1, unitPrice: 1, net: 1, coicop: '01.1.1', confidence: 0.4, source: 'ia', needsReview: true, ...extra })
const tickets = [
  {
    id: 't1', store: 'Proxy', date: '2026-07-22',
    items: [
      line('a', 'QUICHE SAUMON BROC'), // code douteux, dictionnaire/regle ?
      line('b', 'HUILE OLIVE VIERGE 1L', { coicop: null, confidence: 0.25, source: 'inconnu' }),
      line('c', 'LAIT ENTIER', { coicop: '01.1.4', confidence: 0.95, source: 'ia', needsReview: false }),
      line('d', 'QUICHE LORRAINE', { corrected: true }),
      line('e', 'QUICHE SAUMON', { manual: true }),
      line('f', 'REMISE', { category: 'Remise', coicop: null }),
    ],
  },
]

describe('reclassement en masse', () => {
  const plan = planReclassification(tickets, [])
  it('ne propose rien pour les lignes sûres, corrigées, ajoutées à la main ou de remise', () => {
    const ids = plan.changes.map((c) => c.itemId)
    expect(ids).not.toContain('c')
    expect(ids).not.toContain('d')
    expect(ids).not.toContain('e')
    expect(ids).not.toContain('f')
  })
  it('une ligne sans code reçoit la proposition d\'une règle (à confirmer)', () => {
    const c = plan.changes.find((x) => x.itemId === 'b')
    expect(c).toMatchObject({ to: '01.1.5', kind: 'rule', from: null })
  })
  it('un code douteux est remplacé par le dictionnaire quand il est sûr', () => {
    const c = plan.changes.find((x) => x.itemId === 'a')
    expect(c).toMatchObject({ kind: 'sure', from: '01.1.1', to: '01.1.9' })
  })
  it('n\'applique que les lignes acceptées et ne renvoie que les tickets modifiés', () => {
    expect(applyReclassification(tickets, [], [])).toEqual([])
    const [t] = applyReclassification(tickets, [], [changeKey('t1', 'a')])
    const a = t.items.find((i) => i.id === 'a')
    expect(a.coicop).toBe('01.1.9')
    expect(a.source).toBe('dictionnaire')
    expect(a.needsReview).toBe(false)
    expect(t.items.find((i) => i.id === 'b').coicop).toBeNull() // non acceptée : inchangée
  })
  it('une ligne reclassée par règle reste à confirmer', () => {
    const [t] = applyReclassification(tickets, [], [changeKey('t1', 'b')])
    const b = t.items.find((i) => i.id === 'b')
    expect(b.coicop).toBe('01.1.5')
    expect(b.needsReview).toBe(true)
  })
  it('utilise les corrections apprises', () => {
    const learned = [{ keywords: ['quiche saumon broc'], normalized: 'Quiche', coicop: '01.1.3', category: 'Poisson' }]
    const p = planReclassification(tickets, learned)
    expect(p.changes.find((x) => x.itemId === 'a')).toMatchObject({ to: '01.1.3', source: 'appris' })
  })
})
