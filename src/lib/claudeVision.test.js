import { describe, it, expect } from 'vitest'
import { toDraft, safeModel, buildPrompt, DEFAULT_AI_MODEL } from './claudeVision.js'
import { monthKey } from './format.js'
import { parseTicket } from './parser.js'

describe('claudeVision', () => {
  it('conserve les modèles connus et remplace les inconnus', () => {
    expect(DEFAULT_AI_MODEL).toBe('claude-haiku-4-5')
    expect(safeModel('claude-sonnet-5')).toBe('claude-sonnet-5')
    expect(safeModel('claude-sonnet-5-5')).toBe('claude-sonnet-5-5')
    expect(safeModel('claude-foo')).toBe(DEFAULT_AI_MODEL)
  })
  it('recalcule le net au lieu de se fier au modèle', () => {
    const d = toDraft({ store: 'S', date: '', total_paid: 3, items: [{ raw: 'A', product: 'A', quantity: 2, unit_price: 1.5, discount: -0.5, net: 99, coicop: '', confidence: 0.9 }] })
    expect(d.items[0].net).toBe(2.5)
    expect(d.items[0].needsReview).toBe(true) // coicop vide
  })
})

describe('dates', () => {
  it('monthKey sans décalage de fuseau', () => {
    expect(monthKey('2024-03-01')).toBe('2024-03')
  })
  it('rejette les dates impossibles et retente les suivantes', () => {
    expect(parseTicket('31/02/2024 puis 12/03/2024\nPAIN 1,00').date).toBe('2024-03-12')
    expect(parseTicket('PAIN 1,00').date).toBeNull()
  })
})

describe('toDraft — remises', () => {
  it('signale une remise supérieure au montant brut', () => {
    const d = toDraft({ store: 'S', date: '', total_paid: 0, items: [{ raw: 'A', product: 'A', quantity: 1, unit_price: 1, discount: -3.98, net: -2.98, coicop: '01.1.1', confidence: 0.95 }] })
    expect(d.items[0].needsReview).toBe(true)
  })
  it('garde une remise de lot répartie sur plusieurs lignes', () => {
    const items = [-1.33, -1.33, -1.32].map((discount) => ({ raw: 'B', product: 'Boxer', quantity: 1, unit_price: 7.99, discount, net: 0, coicop: '03.1.2', confidence: 0.9 }))
    const d = toDraft({ store: 'Celio', date: '', total_paid: 20, items })
    expect(d.items.every((it) => !it.needsReview)).toBe(true)
    expect(+d.items.reduce((a, b) => a + b.discount, 0).toFixed(2)).toBe(-3.98)
    expect(+d.items.reduce((a, b) => a + b.net, 0).toFixed(2)).toBe(19.99)
  })
})

describe('promotions de lot (ticket Celio)', () => {
  const line = (raw, unit_price) => ({ raw, product: raw, quantity: 1, unit_price, discount: 0, net: unit_price, coicop: '03.1.2', confidence: 0.9 })
  const six = [line('NIWOBIBOUP LIGHT PINK,XL', 7.99), line('MICUADRO BLUE SKY,XL', 7.99), line('DAXFORDMC BLUE,XXL', 17.99), line('DIBISTRIPE BLUE SKY,XL', 7.99), line('PASHAN BLUE NAVY,XXL', 29.99), line('LAPOUKI NAVY,XL', 39.99)]
  const total = (d) => +d.items.reduce((a, b) => a + b.net, 0).toFixed(2)

  it('ajoute la promotion comme une ligne négative', () => {
    const d = toDraft({ store: 'Celio', date: '2026-10-17', total_paid: 107.96, items: six, promotions: [{ label: 'Boxers 3 x 19,99EUR', amount: -3.98, item_numbers: [1, 2, 4] }] })
    expect(d.items).toHaveLength(7)
    const promo = d.items[6]
    expect(promo.net).toBe(-3.98)
    expect(promo.unitPrice).toBe(-3.98)
    expect(promo.coicop).toBe('03.1.2')
    expect(total(d)).toBe(107.96)
    expect(d.items.slice(0, 6).every((x) => x.discount === 0)).toBe(true)
  })
  it('convertit une promo restée parmi les produits en ligne négative', () => {
    const promo = { raw: 'Boxers 3 x 19,99EUR', product: 'Boxers', quantity: 3, unit_price: 19.99, discount: -3.98, net: 55.99, coicop: '03.1.2', confidence: 0.9 }
    const d = toDraft({ store: 'Celio', date: '', total_paid: 107.96, items: [...six, promo], promotions: [] })
    expect(d.items).toHaveLength(7)
    expect(d.items[6].net).toBe(-3.98)
    expect(total(d)).toBe(107.96)
  })
  it('ne touche pas un vrai produit « 6 x 1,50EUR » sans remise', () => {
    const d = toDraft({ store: '', date: '', total_paid: 9, items: [{ raw: 'EAU 6 x 1,50EUR', product: 'Eau', quantity: 1, unit_price: 9, discount: 0, net: 9, coicop: '02.1.2', confidence: 0.9 }], promotions: [] })
    expect(d.items).toHaveLength(1)
    expect(d.items[0].net).toBe(9)
  })
  it('ignore une promotion sans montant négatif', () => {
    const d = toDraft({ store: '', date: '', total_paid: 5, items: [line('A', 5)], promotions: [{ label: 'x', amount: 2, item_numbers: [] }] })
    expect(d.items).toHaveLength(1)
  })
})

describe('consigne au modèle (audit P1)', () => {
  const prompt = buildPrompt()
  it('l\'invariant de total tient compte des promotions', () => {
    expect(prompt).toContain('la somme des "net" des "items" PLUS la somme des "amount" des "promotions"')
    expect(prompt).not.toContain('la somme des "net" de toutes les lignes')
  })
  it('les remises globales vont dans « promotions » (plus ignorées)', () => {
    expect(prompt).toContain('"item_numbers": []')
    expect(prompt).not.toMatch(/Ignore[^\n]*remises globales/)
  })
  it('la liste COICOP imposée contient l\'habillement', () => {
    expect(prompt).toContain('03.1.2')
  })
})

describe('plusieurs promotions : l\'invariant du prompt tient', () => {
  const line = (raw, unit_price) => ({ raw, product: raw, quantity: 1, unit_price, discount: 0, net: unit_price, coicop: '03.1.2', confidence: 0.9 })
  it('somme(items.net) + somme(promotions.amount) = total_paid', () => {
    const items = [line('A', 7.99), line('B', 7.99), line('C', 7.99), line('D', 12.5), line('E', 12.5), line('F', 30)]
    const promotions = [
      { label: '3 pour 19,99', amount: -3.98, item_numbers: [1, 2, 3] },
      { label: '2e à -50 %', amount: -6.25, item_numbers: [4, 5] },
      { label: 'Coupon fidélité', amount: -5, item_numbers: [] },
    ]
    const total_paid = +(7.99 * 3 + 25 + 30 - 3.98 - 6.25 - 5).toFixed(2)
    const d = toDraft({ store: 'S', date: '', total_paid, items, promotions })
    expect(d.items).toHaveLength(9)
    expect(+d.items.reduce((a, b) => a + b.net, 0).toFixed(2)).toBe(total_paid)
    expect(d.items.slice(6).map((x) => x.net)).toEqual([-3.98, -6.25, -5])
    expect(d.items[8].coicop).toBeNull() // remise globale : pas d'article de référence
    expect(d.items[7].coicop).toBe('03.1.2')
  })
  it('ignore une promotion nulle ou positive (pas d\'invention)', () => {
    const d = toDraft({ store: '', date: '', total_paid: 5, items: [line('A', 5)], promotions: [{ label: 'x', amount: 0, item_numbers: [] }, { label: 'y', amount: 2, item_numbers: [] }] })
    expect(d.items).toHaveLength(1)
  })
})

describe('deux confiances : lecture et classement', () => {
  const base = { raw: 'LAIT', product: 'Lait', quantity: 1, unit_price: 1, discount: 0, net: 1, coicop: '01.1.4' }
  it('read_confidence et class_confidence sont conservées séparément', () => {
    const d = toDraft({ store: '', date: '', total_paid: 1, promotions: [], items: [{ ...base, read_confidence: 0.4, class_confidence: 0.95 }] })
    expect(d.items[0]).toMatchObject({ confidence: 0.95, readConfidence: 0.4, needsReview: true }) // lecture douteuse
  })
  it('classement douteux, lecture sûre : à confirmer aussi', () => {
    const d = toDraft({ store: '', date: '', total_paid: 1, promotions: [], items: [{ ...base, read_confidence: 0.95, class_confidence: 0.5 }] })
    expect(d.items[0]).toMatchObject({ confidence: 0.5, readConfidence: 0.95, needsReview: true })
  })
  it('les deux sûres : rien à confirmer', () => {
    const d = toDraft({ store: '', date: '', total_paid: 1, promotions: [], items: [{ ...base, read_confidence: 0.9, class_confidence: 0.9 }] })
    expect(d.items[0].needsReview).toBe(false)
  })
  it('ancienne réponse (une seule « confidence ») : reste acceptée', () => {
    const d = toDraft({ store: '', date: '', total_paid: 1, promotions: [], items: [{ ...base, confidence: 0.9 }] })
    expect(d.items[0]).toMatchObject({ confidence: 0.9, readConfidence: null, needsReview: false })
  })
  it('valeurs hors bornes ramenées dans [0 ; 1]', () => {
    const d = toDraft({ store: '', date: '', total_paid: 1, promotions: [], items: [{ ...base, read_confidence: 7, class_confidence: -2 }] })
    expect(d.items[0]).toMatchObject({ readConfidence: 1, confidence: 0 })
  })
  it('le schéma et la consigne exposent les deux scores', () => {
    const prompt = buildPrompt()
    expect(prompt).toContain('"read_confidence"')
    expect(prompt).toContain('"class_confidence"')
    expect(prompt).not.toContain('"confidence" entre 0 et 1')
  })

  it('le prompt n\'amorce pas un type d\'article et interdit de recopier le prix d\'un lot', () => {
    const p = buildPrompt()
    expect(p).not.toMatch(/boxer, chemise/i)
    expect(p).toMatch(/item_numbers/)
    expect(p).toMatch(/sous-vêtements.*03\.1\.2/)
    expect(p).toMatch(/jamais d'un autre prix/i)
  })
})
