import { describe, it, expect } from 'vitest'
import data from './coicop1999.js'
import official from './coicop2018.js'
import { coicop1999Title, from1999, to1999 } from './coicopCorrespondence.js'
import { isKnownCoicop } from './coicop.js'

// Codes proposés par l'application avant le passage à la COICOP 2018 officielle (≤ v2.9.5).
const ANCIENS_CODES = ['01.1.1', '01.1.2', '01.1.3', '01.1.4', '01.1.5', '01.1.6', '01.1.7', '01.1.8', '01.1.9', '02.1.2', '03.1.1', '03.1.2', '03.1.3', '03.1.4', '03.2.1', '03.2.2', '05.6.1']

describe('correspondance COICOP 1999 ↔ 2018', () => {
  it('source consignée', () => {
    expect(data.source.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(data.source.publisher).toBe('UNSD')
  })

  it('tous les codes 2018 de la table existent dans la structure officielle, tous les codes 1999 ont un titre', () => {
    for (const [c99, c18] of data.pairs.map((p) => [p[0], p[1]])) {
      expect(isKnownCoicop(c18), c18).toBe(true)
      expect(coicop1999Title(c99), c99).toBeTruthy()
    }
    expect(official.codes.length).toBe(264)
  })

  it('titres 1999 officiels', () => {
    expect(coicop1999Title('01.1.1')).toBe('Bread and cereals (ND)')
    expect(coicop1999Title('01.1.4')).toBe('Milk, cheese and eggs (ND)')
    expect(coicop1999Title('99.9.9')).toBeNull()
  })

  it('une classe 1999 peut se répartir sur plusieurs classes 2018 : toutes les cibles sont rendues', () => {
    const r = from1999('01.2.2') // 1999 : eaux minérales, boissons rafraîchissantes, jus
    expect(r.unique).toBe(false)
    const cibles = r.targets.map((t) => t.code)
    for (const c of ['01.2.1', '01.2.5', '01.2.6']) expect(cibles).toContain(c)
    expect(r.targets.reduce((a, t) => a + t.share, 0)).toBeGreaterThan(0.98)
    expect(from1999('01.1.4').unique).toBe(true) // lait, fromage et œufs : 1 seule cible
    expect(from1999('01.1.4').primary).toBe('01.1.4')
  })

  it('sens inverse : le café 2018 vient de 01.2.1 (1999)', () => {
    expect(to1999('01.2.2').primary).toBe('01.2.1')
    expect(to1999('01.2.5').targets.map((t) => t.code)).toContain('01.2.2')
    expect(to1999('99.9.9')).toBeNull()
  })

  it('anciens tickets : chaque ancien code garde sa place en 2018 (cible principale = lui-même), sauf 02.1.2 interne', () => {
    for (const code of ANCIENS_CODES.filter((c) => c !== '02.1.2')) {
      const r = from1999(code)
      expect(r, code).not.toBeNull()
      expect(r.primary, code).toBe(code)
    }
  })

  it('l\'ancien 02.1.2 interne (« Boissons sans alcool ») n\'était pas un code 1999 valide pour cela : c\'est le vin, déjà migré', () => {
    expect(coicop1999Title('02.1.2')).toMatch(/Wine/)
    expect(from1999('02.1.2').primary).toBe('02.1.2')
  })
})
