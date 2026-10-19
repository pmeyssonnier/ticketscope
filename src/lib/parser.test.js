import { describe, it, expect } from 'vitest'
import { parseTicket } from './parser.js'
import { classifyItems } from './classifier.js'
import { parseAmount, normalizeStr, titleFromRaw } from './format.js'
import { SAMPLE_TICKET_TEXT } from '../data/sampleTicket.js'

const mkItems = (raws) =>
  raws.map((raw) => ({ raw, quantity: 1, unitPrice: 1, gross: 1, discount: 0, net: 1 }))

describe('classification tolérante aux fautes OCR (fuzzy)', () => {
  it('reconnaît un libellé à ~1 lettre d’erreur, avec le bon nom et code', () => {
    const [q, m] = classifyItems(mkItems(['QUICHE OLTVES FETA', 'AMERICIAN MARTING']))
    expect(q.coicop).toBe('01.1.9')
    expect(q.normalized).toMatch(/quiche olives/i)
    expect(q.needsReview).toBe(true) // fuzzy -> confiance sous le seuil
    expect(m.coicop).toBe('01.1.2')
    expect(m.normalized).toMatch(/martino/i)
  })

  it('garde la haute confiance pour un libellé net (pas de fuzzy inutile)', () => {
    const [q] = classifyItems(mkItems(['QUICHE SAUMON BROC']))
    expect(q.coicop).toBe('01.1.9')
    expect(q.needsReview).toBe(false)
  })

  it('ne fuzzy-matche pas un produit vraiment inconnu', () => {
    const [u] = classifyItems(mkItems(['ZORGLUB MACHIN TRUC']))
    expect(u.coicop).toBeNull()
  })
})

describe('titleFromRaw', () => {
  it('nettoie et met en forme un libellé brut', () => {
    expect(titleFromRaw('145G CHIPS CAMEMB')).toBe('Chips Camemb')
    expect(titleFromRaw('26 DASH PODS')).toBe('Dash Pods')
    expect(titleFromRaw('GAUFRE DE LIEGE')).toBe('Gaufre De Liege')
  })
})

describe('parseAmount', () => {
  it('parse les formats belges', () => {
    expect(parseAmount('25,60')).toBeCloseTo(25.6)
    expect(parseAmount('-51,20')).toBeCloseTo(-51.2)
    expect(parseAmount('1 234,56 €')).toBeCloseTo(1234.56)
    expect(parseAmount('6.35')).toBeCloseTo(6.35)
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('3,98-')).toBeCloseTo(-3.98)
    expect(parseAmount('.5')).toBeCloseTo(0.5)
  })

  it('rejette les valeurs malformées au lieu de les arrondir', () => {
    for (const bad of ['12,5abc', 'abc', '12-34', '--3', '-3-', '1,2,3', '1.2.3', '12,', '€', '4 x 5']) {
      expect(parseAmount(bad), bad).toBeNull()
    }
  })
})

describe('normalizeStr', () => {
  it('retire accents et casse', () => {
    expect(normalizeStr('Œufs Pesseleux x12')).toContain('ufs')
    expect(normalizeStr('Réduction')).toBe('reduction')
  })
})

describe('parseTicket (ticket de référence)', () => {
  const t = parseTicket(SAMPLE_TICKET_TEXT)

  it('regroupe les DASH Pods en quantité 4 avec remise', () => {
    const dash = t.items.find((i) => /dash/i.test(i.raw))
    expect(dash.quantity).toBe(4)
    expect(dash.gross).toBeCloseTo(102.4)
    expect(dash.discount).toBeCloseTo(-51.2)
    expect(dash.net).toBeCloseTo(51.2)
  })

  it('ne compte pas deux fois la remise du récapitulatif', () => {
    expect(t.totalDeclared).toBeCloseTo(269.67)
    expect(t.computedTotal).toBeCloseTo(269.67, 1)
  })

  it('ignore les lignes parasites (Tel, TOTA(A)L, POI, paiement)', () => {
    const t2 = parseTicket(
      [
        'Proxy Verhaeren',
        'Tel : 02/241.17.97',
        'Calgon Tabs 11,72',
        'Fraise 5,49',
        'TOTA(A)L 17,21',
        'BANCONTACT 17,21',
        'POI: 01851465',
      ].join('\n'),
    )
    // Aucune ligne parasite ne doit devenir un produit.
    expect(t2.items.every((i) => !/tel|tota|poi|bancontact/i.test(i.raw))).toBe(true)
    expect(t2.items).toHaveLength(2) // Calgon + Fraise
    expect(t2.totalDeclared).toBeCloseTo(17.21) // « TOTA(A)L » reconnu comme total
  })

  it('détecte le sous-total récapitulatif', () => {
    expect(t.subtotalDeclared).toBeCloseTo(320.87)
  })

  it('capture toutes les lignes produit distinctes', () => {
    // 45 lignes produit sur le ticket, dont 4 DASH regroupées + 2 Ginger Beer.
    expect(t.items.length).toBeGreaterThan(38)
  })
})

describe('classifyItems', () => {
  const t = parseTicket(SAMPLE_TICKET_TEXT)
  const classified = classifyItems(t.items)

  it('classe les DASH Pods en 05.6.1', () => {
    const dash = classified.find((i) => /dash/i.test(i.raw))
    expect(dash.coicop).toBe('05.6.1')
    expect(dash.confidence).toBeGreaterThan(0.7)
  })

  it('classe le tarama (pâte d\'œufs de poisson) en 01.1.3 (COICOP 2018 : poissons et autres fruits de mer)', () => {
    const tarama = classified.find((i) => /tarama/i.test(i.raw))
    expect(tarama.coicop).toBe('01.1.3')
  })

  it('classe le mélange d\'olives (Mix Ver) en 01.1.7 et la pâte de Dubaï en 01.1.8', () => {
    const olives = classified.find((i) => /mix ver/i.test(i.raw))
    expect(olives.coicop).toBe('01.1.7')
    const dubai = classified.find((i) => /dubaich/i.test(i.raw))
    expect(dubai.coicop).toBe('01.1.8')
  })

  it('tolère les libellés OCR abrégés du ticket Proxy', () => {
    const raws = [
      { raw: '400GR TOM.CERISES', coicop: '01.1.7' },
      { raw: '3OO0ML DID SAUC HAM', coicop: '01.1.9' },
      { raw: 'AMERICIAN MARTINO', coicop: '01.1.2' },
      { raw: 'BISCUITS SABLE BEU', coicop: '01.1.1' }, // biscuits = produits de boulangerie (01.1.1.3), pas confiserie
    ]
    const out = classifyItems(
      raws.map((r) => ({ raw: r.raw, quantity: 1, unitPrice: 1, gross: 1, discount: 0, net: 1 })),
    )
    out.forEach((c, i) => expect(c.coicop).toBe(raws[i].coicop))
  })

  it('marque les produits inconnus pour révision', () => {
    const [res] = classifyItems([
      { raw: 'PRODUIT XYZ INCONNU', quantity: 1, unitPrice: 1, gross: 1, discount: 0, net: 1 },
    ])
    expect(res.coicop).toBeNull()
    expect(res.needsReview).toBe(true)
  })

  it('classe la majorité des lignes automatiquement', () => {
    const classifiedCount = classified.filter((i) => i.coicop).length
    expect(classifiedCount / classified.length).toBeGreaterThan(0.8)
  })

  it('donne une confiance élevée aux correspondances de dictionnaire (pas de faux « à confirmer »)', () => {
    // Une correspondance de marque fiable doit dépasser le seuil de révision.
    const lenor = classified.find((i) => /lenor/i.test(i.raw))
    expect(lenor.confidence).toBeGreaterThanOrEqual(0.75)
    expect(lenor.needsReview).toBe(false)
    // Sur un ticket entièrement reconnu, aucune ligne ne doit être à confirmer.
    expect(classified.filter((i) => i.needsReview)).toHaveLength(0)
  })
})

describe('parseTicket (régressions audit)', () => {
  it('« SPARKLING » dans un produit ne désigne pas Spar', () => {
    expect(parseTicket('SPARKLING WATER BIO 1,29\nPAIN 2,10\nTOTAL 3,39').store).not.toBe('Spar')
  })
  it('enseigne reconnue en en-tête', () => {
    expect(parseTicket('COLRUYT\nPAIN 2,10\nTOTAL 2,10').store).toBe('Colruyt')
  })
  it('ligne « 2 x 1,50 3,00 » = quantité 2 à 1,50', () => {
    const [it] = parseTicket('Colruyt\n2 x 1,50 3,00\nTOTAL 3,00').items
    expect(it.quantity).toBe(2)
    expect(it.unitPrice).toBe(1.5)
    expect(it.net).toBe(3)
  })
})

describe('arrondi de caisse', () => {
  it("ignore la ligne « Liquide arrondi » : le total reste celui d'avant l'arrondi", () => {
    const r = parseTicket(`Pharmacie Lambermont
19-10-26
1 ACETYLCYSTEINE EG 600MG 6.47
1 DAKTARIN SPRAY 10.47
Total a payer : 16.94
Liquide arrondi 16.95`)
    expect(r.totalDeclared).toBe(16.94)
    expect(r.items).toHaveLength(2)
  })
})
