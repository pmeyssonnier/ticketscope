import { describe, it, expect } from 'vitest'
import { stitchOcrTexts, _internal } from './stitch.js'

const { similarity } = _internal

describe('similarity', () => {
  it('détecte les lignes identiques malgré le bruit OCR', () => {
    expect(similarity('Le Chat 880 ml   5,98', 'Le Chat 880 ml 5,98')).toBeGreaterThan(0.9)
    expect(similarity('Oignon rouge 1,97', 'Bertolli huile 13,49')).toBeLessThan(0.4)
  })
})

describe('stitchOcrTexts', () => {
  it('retire le recouvrement entre deux photos', () => {
    const a = 'SUPERMARCHE DEMO\nCalgon Tabs 11,72\nLe Chat 880 ml 5,98\nOignon rouge 1,97'
    const b = 'Le Chat 880 ml 5,98\nOignon rouge 1,97\nFraises 5,49\nTOTAL PAYE 25,16'
    const merged = stitchOcrTexts([a, b])
    const lines = merged.split('\n')
    // "Le Chat" et "Oignon rouge" ne doivent apparaître qu'une fois.
    expect(lines.filter((l) => /Le Chat/.test(l)).length).toBe(1)
    expect(lines.filter((l) => /Oignon/.test(l)).length).toBe(1)
    expect(merged).toContain('Fraises 5,49')
    expect(merged).toContain('TOTAL PAYE 25,16')
  })

  it('concatène quand il n\'y a pas de recouvrement', () => {
    const a = 'Calgon Tabs 11,72\nLe Chat 880 ml 5,98'
    const b = 'Fraises 5,49\nTOTAL PAYE 17,21'
    const merged = stitchOcrTexts([a, b])
    expect(merged.split('\n')).toHaveLength(4)
  })

  it('préserve les vraies répétitions (mêmes produits achetés en plusieurs exemplaires)', () => {
    // 4 lignes DASH identiques dans une seule photo : ne doivent pas être fusionnées.
    const a = 'DASH PODS 25,60\nDASH PODS 25,60\nDASH PODS 25,60\nDASH PODS 25,60'
    const merged = stitchOcrTexts([a])
    expect(merged.split('\n').filter((l) => /DASH/.test(l)).length).toBe(4)
  })

  it('gère une seule photo ou une liste vide', () => {
    expect(stitchOcrTexts(['Fraises 5,49'])).toBe('Fraises 5,49')
    expect(stitchOcrTexts([])).toBe('')
    expect(stitchOcrTexts(['', ''])).toBe('')
  })
})
