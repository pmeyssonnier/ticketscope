import { describe, it, expect } from 'vitest'
import { searchCoicop, groupByDivision } from './coicopSearch.js'
import { groupItemsByCoicop, codesInTicket } from './codeGroups.js'

describe('recherche d\'une classe COICOP', () => {
  it('sans requête, toutes les classes', () => {
    expect(searchCoicop('')).toHaveLength(41)
  })
  it('par mot-clé de produit', () => {
    expect(searchCoicop('bonde')[0]).toBe('04.3.1')
    expect(searchCoicop('shampooing')[0]).toBe('13.1.2')
  })
  it('par code, même partiel', () => {
    expect(searchCoicop('04.3')).toEqual(['04.3.1'])
    expect(searchCoicop('01.2.').every((c) => c.startsWith('01.2.'))).toBe(true)
  })
  it('par titre, sans tenir compte des accents ni de la casse', () => {
    expect(searchCoicop('CHAUSSURES')).toContain('03.2.1')
    expect(searchCoicop('legumes')).toContain('01.1.7')
  })
  it('tous les mots doivent correspondre ; rien de trouvé = liste vide', () => {
    expect(searchCoicop('zzzzqq')).toEqual([])
    expect(searchCoicop('pain xyzabc')).toEqual([])
  })
  it('groupe les classes par division, dans l\'ordre', () => {
    const g = groupByDivision()
    expect(g[0].division).toBe('01')
    expect(g.flatMap((x) => x.codes)).toHaveLength(41)
    expect(g.map((x) => x.division)).toEqual([...g.map((x) => x.division)].sort())
  })
})

describe('regroupement des lignes par code', () => {
  const items = [
    { id: 'a', coicop: '01.1.9', net: 2.5, needsReview: true },
    { id: 'b', coicop: '01.1.1', net: 1.1 },
    { id: 'c', coicop: '01.1.9', net: 0.1 },
    { id: 'd', coicop: null, net: 3 },
  ]
  it('non classé d\'abord, puis par code, avec totaux exacts en centimes', () => {
    const g = groupItemsByCoicop(items)
    expect(g.map((x) => x.code)).toEqual([null, '01.1.1', '01.1.9'])
    expect(g[2].total).toBe(2.6)
    expect(g[2].toReview).toBe(1)
    expect(g[0].label).toBe('Non classé')
  })
  it('codes du ticket, les plus fréquents d\'abord', () => {
    expect(codesInTicket(items)).toEqual(['01.1.9', '01.1.1'])
  })
})
