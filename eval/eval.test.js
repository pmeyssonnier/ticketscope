import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { evaluate, noisify, mulberry32, buildText } from './evaluate.js'

const dataset = JSON.parse(readFileSync(new URL('./dataset.json', import.meta.url), 'utf8'))
const results = evaluate(dataset)

// Garde-fous « à cliquet » : seuils placés juste sous les mesures actuelles. Une
// baisse est une régression ; après une amélioration, REMONTER les seuils.
describe('précision du pipeline local sur le jeu annoté', () => {
  it('texte propre : toutes les lignes et tous les montants sont retrouvés', () => {
    const r = results[0]
    expect(r.recall).toBeGreaterThanOrEqual(0.98)
    expect(r.precision).toBeGreaterThanOrEqual(0.98)
    expect(r.netAccuracy).toBeGreaterThanOrEqual(0.98)
    expect(r.totalReconciled).toBe(1)
  })

  it('texte bruité (6 % de lettres altérées) : lignes et montants tiennent', () => {
    const r = results[0.06]
    expect(r.recall).toBeGreaterThanOrEqual(0.95)
    expect(r.netAccuracy).toBeGreaterThanOrEqual(0.95)
    expect(r.totalReconciled).toBe(1)
  })

  it('ticket d\'exemple (libellés OCR réels) : accord avec les codes de référence', () => {
    const t = results[0].perTicket['proxy-ocr']
    expect(t.coicopAccuracy).toBeGreaterThanOrEqual(0.9)
    expect(t.coverage).toBeGreaterThanOrEqual(0.95)
  })

  it('classement global (inclut les tickets synthétiques) : le repli par règles couvre presque tout', () => {
    const r = results[0]
    expect(r.coicopAccuracy).toBeGreaterThanOrEqual(0.9)
    expect(r.coverage).toBeGreaterThanOrEqual(0.95)
  })

  it('classes ajoutées (santé, soins corporels, maison, carburant, restauration) : bien classées', () => {
    for (const id of ['pharmacie-soins-synthetique', 'maison-auto-resto-synthetique']) {
      expect(results[0].perTicket[id].coverage, id).toBeGreaterThanOrEqual(0.95)
      expect(results[0].perTicket[id].coicopAccuracy, id).toBeGreaterThanOrEqual(0.9)
    }
  })

  it('tickets synthétiques : le repli par règles classe les vêtements et la plupart des courses', () => {
    expect(results[0].perTicket['vetements-synthetique'].coverage).toBeGreaterThanOrEqual(0.9)
    expect(results[0].perTicket['courses-synthetique'].coverage).toBeGreaterThanOrEqual(0.9)
  })

  it('sans bruit, les codes à confiance haute sont fiables', () => {
    expect(results[0].calibration.haute.accuracy).toBeGreaterThanOrEqual(0.9)
    expect(results[0].coicopAccuracy).toBeGreaterThanOrEqual(0.95)
  })

  it('avec du bruit OCR, la tranche « basse » est nettement moins fiable', () => {
    const c = results[0.06].calibration
    expect(c.haute.accuracy).toBeGreaterThan(c.basse.accuracy + 0.3)
  })

  it('avec du bruit OCR, les erreurs de classement sont presque toujours signalées « à confirmer »', () => {
    // Sans bruit il ne reste qu'une erreur (« MCCAIN AIRFRY », code sûr du dictionnaire) :
    // le taux de détection n'y est pas significatif, on le mesure avec du bruit.
    expect(results[0.03].errorDetection).toBeGreaterThanOrEqual(0.7)
    expect(results[0.06].errorDetection).toBeGreaterThanOrEqual(0.9)
  })
})

describe('outillage du jeu d\'évaluation', () => {
  it('le bruit est déterministe (même graine, même résultat)', () => {
    const a = noisify('QUICHE SAUMON BROC', 0.3, mulberry32(7))
    const b = noisify('QUICHE SAUMON BROC', 0.3, mulberry32(7))
    expect(a).toBe(b)
    expect(a).not.toBe('QUICHE SAUMON BROC')
    expect(noisify('QUICHE', 0, mulberry32(7))).toBe('QUICHE')
  })

  it('ne touche ni les chiffres ni les montants', () => {
    const text = buildText({ store: 'S', date: '01/01/2026', declaredTotal: 5, items: [{ raw: 'LAIT 1L', quantity: 2, unitPrice: 2.5, discount: 0 }] }, 1, mulberry32(1))
    expect(text).toContain('2,50')
    expect(text).toMatch(/TOTAL PAYE\s+5,00/)
    expect(text.match(/2,50/g)).toHaveLength(2) // quantité 2 -> 2 lignes
  })

  it('le jeu est bien formé : chaque ticket a ses lignes, montants et provenance', () => {
    for (const t of dataset.tickets) {
      expect(t.provenance.length).toBeGreaterThan(20)
      expect(t.items.length).toBeGreaterThan(0)
      for (const it of t.items) {
        expect(typeof it.raw).toBe('string')
        expect(Number.isFinite(it.unitPrice) && Number.isFinite(it.net)).toBe(true)
        expect(it.coicop === null || /^\d{2}\.\d\.\d$/.test(it.coicop)).toBe(true)
      }
    }
  })
})
