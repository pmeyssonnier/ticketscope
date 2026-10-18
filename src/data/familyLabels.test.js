import { describe, it, expect } from 'vitest'
import { FAMILY_LABELS, familyLabel } from './familyLabels.js'
import { COICOP_LABELS } from './coicop.js'
import { searchCoicop } from '../lib/coicopSearch.js'

describe('noms courants des classes (parcours famille)', () => {
  it('toutes les classes proposées ont un nom courant, et rien de plus', () => {
    expect(Object.keys(FAMILY_LABELS).sort()).toEqual(Object.keys(COICOP_LABELS).sort())
  })
  it('un emoji et des mots, sans code dans le texte', () => {
    for (const [code, [emoji, text]] of Object.entries(FAMILY_LABELS)) {
      expect(emoji.length, code).toBeGreaterThan(0)
      expect(text.length, code).toBeGreaterThanOrEqual(3)
      expect(text, code).not.toMatch(/\d\d\.\d/)
    }
    expect(familyLabel('01.1.4')).toBe('🥛 Lait, fromages, yaourts et œufs')
  })
  it('la recherche comprend les noms courants', () => {
    expect(searchCoicop('fromage')).toContain('01.1.4')
    expect(searchCoicop('bricolage')).toContain('04.3.1')
  })
})
