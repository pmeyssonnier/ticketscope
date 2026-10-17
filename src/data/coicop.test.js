import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  COICOP_REFERENCE, COICOP_LABELS, COICOP_DIVISIONS,
  isCoicopFormat, isKnownCoicop, coicopInfo, coicopLevel, coicopParent, coicopLabel,
  migrateLegacyCoicop, migrateTicketCoicop,
} from './coicop.js'
import official from './coicop2018.js'
import { toDraft } from '../lib/claudeVision.js'
import { validateTicket } from '../lib/backup.js'
import { flattenRows } from '../lib/exporters.js'

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')

describe('référentiel COICOP 2018 versionné', () => {
  it('est identifié, sourcé et vérifié contre le fichier officiel', () => {
    expect(COICOP_REFERENCE.id).toBe('coicop-2018')
    expect(COICOP_REFERENCE.edition).toBe('COICOP 2018')
    expect(COICOP_REFERENCE.sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(COICOP_REFERENCE.verified).toBe(true)
  })

  it('structure officielle complète : 15 divisions, 63 groupes, 186 classes', () => {
    const byLevel = { 1: 0, 2: 0, 3: 0 }
    for (const [code] of official.codes) byLevel[coicopLevel(code)] += 1
    expect(byLevel).toEqual({ 1: 15, 2: 63, 3: 186 })
  })

  it('chaque code proposé est une classe officielle, avec titre officiel et libellé français', () => {
    for (const code of Object.keys(COICOP_LABELS)) {
      const info = coicopInfo(code)
      expect(info, code).not.toBeNull()
      expect(info.level, code).toBe(3)
      expect(info.titleEn.length, code).toBeGreaterThan(2)
      expect(COICOP_LABELS[code].length, code).toBeGreaterThan(2)
      expect(COICOP_DIVISIONS[code.slice(0, 2)], code).toBeTruthy()
    }
  })

  it('titres officiels de référence (extraits du fichier source)', () => {
    expect(coicopInfo('01.1.4').titleEn).toBe('Milk, other dairy products and eggs (ND)')
    expect(coicopInfo('01.2.2').titleEn).toBe('Coffee and coffee substitutes (ND)')
    expect(coicopInfo('01.2.6').titleEn).toBe('Soft drinks (ND)')
    expect(coicopInfo('02.1.2').titleEn).toBe('Wine (ND)')
    expect(coicopInfo('03.1.2').titleEn).toBe('Garments (SD)')
  })

  it('tous les codes du dictionnaire et des règles sont des classes proposées', () => {
    const src = read('./dictionary.js') + read('../lib/suggest.js')
    const used = new Set([...src.matchAll(/coicop:\s*'(\d{2}\.\d\.\d)'/g)].map((m) => m[1]))
    expect(used.size).toBeGreaterThan(10)
    for (const code of used) expect(COICOP_LABELS[code], code).toBeTruthy()
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
    expect(isKnownCoicop('11.1.1')).toBe(true) // officiel, même si non proposé
    expect(coicopInfo('99.9.9')).toBeNull()
    expect(coicopLabel('99.9.9')).toBe('99.9.9')
    expect(coicopLabel('11.1.1')).not.toBe('11.1.1') // titre officiel en repli
  })
})

describe('migration de l\'ancien code 02.1.2 « Boissons sans alcool »', () => {
  const legacy = { raw: 'COCA', coicop: '02.1.2', coicopLabel: 'Boissons sans alcool', needsReview: false }

  it('est explicite : ancien code conservé, nouveau code officiel, ligne à confirmer', () => {
    const m = migrateLegacyCoicop(legacy)
    expect(m.coicop).toBe('01.2.9')
    expect(m.coicopLegacy).toBe('02.1.2')
    expect(m.needsReview).toBe(true)
    expect(m.coicopLabel).toBe(coicopLabel('01.2.9'))
  })

  it('ne touche pas au vrai 02.1.2 (vin) ni aux autres codes, et est idempotente', () => {
    const wine = { raw: 'VIN', coicop: '02.1.2', coicopLabel: 'Vin' }
    expect(migrateLegacyCoicop(wine)).toBe(wine)
    const other = { raw: 'LAIT', coicop: '01.1.4', coicopLabel: 'Lait' }
    expect(migrateLegacyCoicop(other)).toBe(other)
    const once = migrateLegacyCoicop(legacy)
    expect(migrateLegacyCoicop(once)).toBe(once)
  })

  it('s\'applique à un ticket entier', () => {
    const t = { id: 't', items: [legacy, { raw: 'LAIT', coicop: '01.1.4', coicopLabel: 'Lait' }] }
    const m = migrateTicketCoicop(t)
    expect(m.items[0].coicop).toBe('01.2.9')
    expect(m.items[1]).toBe(t.items[1])
    expect(migrateTicketCoicop({ id: 'x', items: [t.items[1]] }).items[0]).toBe(t.items[1])
  })

  it('import d\'une ancienne sauvegarde : migré et signalé', () => {
    const t = { id: 't1', store: 'S', date: '2024-01-01', items: [{ id: 'i', raw: 'COCA', quantity: 1, unitPrice: 1, gross: 1, discount: 0, net: 1, coicop: '02.1.2', coicopLabel: 'Boissons sans alcool' }] }
    const r = validateTicket(t)
    expect(r.ticket.items[0].coicop).toBe('01.2.9')
    expect(r.ticket.items[0].coicopLegacy).toBe('02.1.2')
    expect(r.warnings.join(' ')).toMatch(/02\.1\.2.*remplacé par 01\.2\.9/)
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
