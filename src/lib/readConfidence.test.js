import { describe, it, expect } from 'vitest'
import { attachReadConfidence } from './readConfidence.js'

const lines = [
  { text: 'COLRUYT', confidence: 91 },
  { text: 'LAIT DEMI-ECREME 1L        1,15', confidence: 93.4 },
  { text: 'PAIN GR1S 800G             2,40', confidence: 58 }, // lecture douteuse
  { text: 'TOTAL 3,55', confidence: 96 },
]
const items = [{ raw: 'LAIT DEMI-ECREME 1L' }, { raw: 'PAIN GRIS 800G' }, { raw: 'CHOCOLAT NOIR' }]

describe('attachReadConfidence', () => {
  it('rattache le score de la ligne OCR la plus proche du libellé (montant ignoré)', () => {
    const out = attachReadConfidence(items, lines)
    expect(out[0].readConfidence).toBe(0.93)
    expect(out[1].readConfidence).toBe(0.58) // « GR1S » ≈ « GRIS » malgré la faute OCR
  })
  it('null quand aucune ligne OCR ne correspond', () => {
    expect(attachReadConfidence(items, lines)[2].readConfidence).toBeNull()
  })
  it('null pour tous sans lignes OCR (texte collé, PDF numérique)', () => {
    expect(attachReadConfidence(items, []).map((i) => i.readConfidence)).toEqual([null, null, null])
    expect(attachReadConfidence(items, undefined).map((i) => i.readConfidence)).toEqual([null, null, null])
  })
  it('ne modifie pas les autres champs et borne le score à [0 ; 1]', () => {
    const out = attachReadConfidence([{ raw: 'LAIT DEMI-ECREME 1L', coicop: '01.1.4' }], [{ text: 'LAIT DEMI-ECREME 1L 1,15', confidence: 140 }])
    expect(out[0]).toMatchObject({ raw: 'LAIT DEMI-ECREME 1L', coicop: '01.1.4', readConfidence: 1 })
  })
  it('ignore les lignes sans score exploitable', () => {
    const out = attachReadConfidence([{ raw: 'LAIT' }], [{ text: 'LAIT 1,15', confidence: Number.NaN }, { text: '', confidence: 90 }])
    expect(out[0].readConfidence).toBeNull()
  })
})
