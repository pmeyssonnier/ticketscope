import { describe, it, expect } from 'vitest'
import { parseFormat, unitPrice } from './units.js'

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
