import { describe, it, expect, vi } from 'vitest'
import { saveTicketThenLearn } from './saveFlow.js'

const corrections = [{ raw: 'LAIT', correction: { coicop: '01.1.4' } }, { raw: 'PAIN', correction: { coicop: '01.1.1' } }]

describe('saveTicketThenLearn (audit P2)', () => {
  it('enregistre le ticket puis apprend, dans cet ordre', async () => {
    const calls = []
    const save = vi.fn(async () => calls.push('save'))
    const learn = vi.fn(() => (calls.push('learn'), true))
    const r = await saveTicketThenLearn({ id: 't' }, corrections, { save, learn })
    expect(calls).toEqual(['save', 'learn', 'learn'])
    expect(r).toEqual({ learnFailed: 0 })
  })

  it('si l\'enregistrement échoue, rien n\'est appris', async () => {
    const save = vi.fn(async () => {
      throw new Error('quota')
    })
    const learn = vi.fn(() => true)
    await expect(saveTicketThenLearn({ id: 't' }, corrections, { save, learn })).rejects.toThrow('quota')
    expect(learn).not.toHaveBeenCalled()
  })

  it('un échec d\'apprentissage est compté sans annuler le ticket', async () => {
    const save = vi.fn(async () => {})
    const learn = vi.fn((raw) => raw !== 'PAIN')
    const r = await saveTicketThenLearn({ id: 't' }, corrections, { save, learn })
    expect(save).toHaveBeenCalledTimes(1)
    expect(r).toEqual({ learnFailed: 1 })
  })

  it('sans correction : enregistre seulement', async () => {
    const save = vi.fn(async () => {})
    const r = await saveTicketThenLearn({ id: 't' }, undefined, { save, learn: vi.fn() })
    expect(save).toHaveBeenCalled()
    expect(r).toEqual({ learnFailed: 0 })
  })
})
