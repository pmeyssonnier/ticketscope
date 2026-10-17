import { describe, it, expect } from 'vitest'
import { parseFormat, unitPrice, unitPriceFor } from './units.js'

describe('parseFormat', () => {
  it('lit le poids et normalise en kg', () => {
    expect(parseFormat('OIGNON ROUGE 750G').baseQty).toBeCloseTo(0.75)
    expect(parseFormat('600G MCCAIN AIRFRY').base).toBe('kg')
  })
  it('lit le volume et normalise en L', () => {
    expect(parseFormat('880ML LE CHAT P&S').baseQty).toBeCloseTo(0.88)
    expect(parseFormat('Gazpacho Verde 1 L').baseQty).toBeCloseTo(1)
    expect(parseFormat('Bunda 37,5 cl').baseQty).toBeCloseTo(0.375)
  })
  it('lit le nombre de pièces', () => {
    const f = parseFormat('Oeufs Pesseleux 12X')
    expect(f.base).toBe('pièce')
    expect(f.baseQty).toBe(12)
  })
  it('détecte la vente au poids (vrac)', () => {
    const f = parseFormat('Tomates Charnues (vrac)')
    expect(f.saleType).toBe('weight')
    expect(f.baseQty).toBeNull()
  })
  it('ne confond pas un code produit avec un format', () => {
    expect(parseFormat('26 DASH PODS PL. C')).toBeNull()
  })
})

describe('unitPrice', () => {
  it('calcule €/kg', () => {
    const up = unitPrice(1.97, 1, 'OIGNON ROUGE 750G')
    expect(up.label).toBe('€/kg')
    expect(up.value).toBeCloseTo(2.63, 1)
  })
  it('calcule €/L', () => {
    expect(unitPrice(5.98, 1, '880ML LE CHAT').value).toBeCloseTo(6.8, 1)
  })
  it('calcule €/pièce et tient compte de la quantité', () => {
    expect(unitPrice(6.35, 1, 'Oeufs 12X').value).toBeCloseTo(0.53, 1)
    // 2 paquets de 12 -> prix par pièce inchangé
    expect(unitPrice(12.7, 2, 'Oeufs 12X').value).toBeCloseTo(0.53, 1)
  })
  it('renvoie null sans format exploitable', () => {
    expect(unitPrice(3.99, 1, 'Ravioli')).toBeNull()
  })
})

describe('formats (régressions audit)', () => {
  it('« max 12 » n\'est pas un pack de 12', () => {
    expect(parseFormat('PRIX MAX 12')).toBeNull()
  })
  it('le texte « ×12 » se reparse (prix unitaire conservé)', () => {
    expect(parseFormat('×12')?.baseQty).toBe(12)
    expect(unitPriceFor({ net: 4.8, quantity: 1, format: '×12', raw: '' })?.value).toBe(0.4)
  })
  it('multipack 2x33cl = 0,66 L', () => {
    const f = parseFormat('COLA 2x33cl')
    expect(f.baseQty).toBe(0.66)
    expect(parseFormat(f.text)?.baseQty).toBe(0.66)
  })
})

describe('prix unitaire — montants négatifs', () => {
  it('pas de prix unitaire pour une remise ou un montant nul', () => {
    expect(unitPriceFor({ net: -3.98, quantity: 1, format: '', raw: 'Boxers 3 x 19,99EUR' })).toBeNull()
    expect(unitPrice(0, 1, '1 kg')).toBeNull()
    expect(unitPrice(2.5, 1, '1 kg')).toEqual({ value: 2.5, label: '€/kg' })
  })
})
