import { describe, it, expect } from 'vitest'
import { safeCell, flattenRows, summarizeByCoicop } from './exporters.js'

describe('exporters', () => {
  it('neutralise les formules', () => {
    expect(safeCell('=1+1')).toBe("'=1+1")
    expect(safeCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(safeCell('Pain')).toBe('Pain')
    expect(safeCell(-1.5)).toBe(-1.5)
  })
  it('aplatit et protège le libellé brut', () => {
    const rows = flattenRows([{ id: 't', date: '2024-03-01', store: 'X', items: [{ raw: '=cmd', quantity: 1, net: 2, gross: 2, discount: 0 }] }])
    expect(rows[0].libelle_brut).toBe("'=cmd")
    expect(rows[0].mois).toBe('2024-03')
  })
  it('synthèse tolère un net absent', () => {
    const s = summarizeByCoicop([{ items: [{ raw: 'a', coicop: '01.1.1' }, { raw: 'b', coicop: '01.1.1', net: 1.5 }] }])
    expect(s[0].net).toBe(1.5)
  })
})

describe('export : confiance de lecture', () => {
  it('ajoute la colonne sans changer « confiance » (classement)', () => {
    const rows = flattenRows([{ id: 't', items: [{ raw: 'A', quantity: 1, net: 1, confidence: 0.9, readConfidence: 0.6 }, { raw: 'B', quantity: 1, net: 1, confidence: 0.8 }] }])
    expect(rows[0]).toMatchObject({ confiance: 0.9, confiance_lecture: 0.6 })
    expect(rows[1]).toMatchObject({ confiance: 0.8, confiance_lecture: '' })
  })
})
