import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  COICOP_REFERENCE, COICOP_LABELS, COICOP_DIVISIONS, COICOP_LEGACY_MIGRATIONS,
  isCoicopFormat, isKnownCoicop, coicopInfo, coicopLevel, coicopParent, coicopLabel,
} from './coicop.js'
import { toDraft } from '../lib/claudeVision.js'
import { validateTicket } from '../lib/backup.js'
import { flattenRows } from '../lib/exporters.js'

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')

describe('référentiel COICOP versionné', () => {
  it('est identifié et ne se prétend pas officiel tant qu\'il n\'est pas vérifié', () => {
    expect(COICOP_REFERENCE.id).toMatch(/^ticketscope-coicop-/)
    expect(COICOP_REFERENCE.verified).toBe(false)
    expect(COICOP_REFERENCE.source).toBeNull()
  })

  it('chaque code est bien formé, de niveau 3, avec libellé, statut et division connue', () => {
    for (const code of Object.keys(COICOP_LABELS)) {
      expect(isCoicopFormat(code), code).toBe(true)
      expect(coicopLevel(code), code).toBe(3)
      expect(coicopInfo(code).label.length, code).toBeGreaterThan(2)
      expect(['a_verifier', 'suspect'], code).toContain(coicopInfo(code).status)
      expect(COICOP_DIVISIONS[code.slice(0, 2)], code).toBeTruthy()
    }
  })

  it('les incohérences connues portent une note', () => {
    for (const code of Object.keys(COICOP_LABELS)) {
      if (coicopInfo(code).status === 'suspect') expect(coicopInfo(code).note, code).toBeTruthy()
    }
  })

  it('tous les codes du dictionnaire et des règles existent dans le référentiel', () => {
    const src = read('./dictionary.js') + read('../lib/suggest.js')
    const used = new Set([...src.matchAll(/coicop:\s*'(\d{2}\.\d\.\d)'/g)].map((m) => m[1]))
    expect(used.size).toBeGreaterThan(10)
    for (const code of used) expect(isKnownCoicop(code), code).toBe(true)
  })

  it('hiérarchie et format', () => {
    expect(coicopLevel('01')).toBe(1)
    expect(coicopLevel('01.1')).toBe(2)
    expect(coicopLevel('01.1.4')).toBe(3)
    expect(coicopLevel('1.1')).toBeNull()
    expect(coicopParent('01.1.4')).toBe('01.1')
    expect(coicopParent('01.1')).toBe('01')
    expect(coicopParent('01')).toBeNull()
    expect(isCoicopFormat('01.1.4.5')).toBe(false)
    expect(isKnownCoicop('99.9.9')).toBe(false)
    expect(isKnownCoicop(undefined)).toBe(false)
    expect(coicopInfo('99.9.9')).toBeNull()
    expect(coicopLabel('99.9.9')).toBe('99.9.9')
  })

  it('aucune migration implicite : la table est vide tant que l\'édition n\'a pas changé', () => {
    expect(COICOP_LEGACY_MIGRATIONS).toEqual({})
  })
})

describe('code hors référentiel', () => {
  it('mode IA : un code inconnu devient « non classé », à relire', () => {
    const d = toDraft({ store: '', date: '', total_paid: 1, items: [{ raw: 'X', product: 'X', quantity: 1, unit_price: 1, discount: 0, net: 1, coicop: '99.9.9', class_confidence: 0.9, read_confidence: 0.9 }], promotions: [] })
    expect(d.items[0].coicop).toBeNull()
    expect(d.items[0].needsReview).toBe(true)
  })

  it('sauvegarde : un code inconnu est conservé mais signalé', () => {
    const t = { id: 't1', store: 'S', date: '2024-01-01', items: [{ id: 'i', raw: 'A', quantity: 1, unitPrice: 1, gross: 1, discount: 0, net: 1, coicop: '99.9.9' }] }
    const r = validateTicket(t)
    expect(r.errors).toBeUndefined()
    expect(r.ticket.items[0].coicop).toBe('99.9.9')
    expect(r.warnings.join(' ')).toMatch(/99\.9\.9.*inconnu du référentiel/)
  })

  it('exports : chaque ligne indique le référentiel utilisé', () => {
    const rows = flattenRows([{ id: 't', store: 'S', date: '2024-01-01', items: [{ raw: 'A', coicop: '01.1.4', quantity: 1, net: 1 }] }])
    expect(rows[0].coicop_version).toBe(COICOP_REFERENCE.id)
  })
})
