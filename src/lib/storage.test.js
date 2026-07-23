import { describe, it, expect, beforeEach } from 'vitest'
import { mergeLearned, loadLearned, clearLearned, exportLearnedData } from './storage.js'

// localStorage minimal pour l'environnement Node.
beforeEach(() => {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }
  clearLearned()
})

describe('mergeLearned', () => {
  it('ajoute de nouvelles entrées valides', () => {
    const r = mergeLearned([
      { normalized: 'Gaufre de Liège', coicop: '01.1.8', category: 'Confiserie', keywords: ['gaufre de liege'] },
    ])
    expect(r.added).toBe(1)
    expect(loadLearned()).toHaveLength(1)
  })

  it('dédoublonne par mot-clé (met à jour au lieu de dupliquer)', () => {
    mergeLearned([{ coicop: '01.1.8', category: 'Confiserie', keywords: ['gaufre'] }])
    const r = mergeLearned([{ coicop: '01.1.9', category: 'Snacks', keywords: ['Gaufre'] }])
    expect(r.updated).toBe(1)
    expect(loadLearned()).toHaveLength(1)
    expect(loadLearned()[0].coicop).toBe('01.1.9')
  })

  it('accepte l’objet exporté { entries } comme un tableau brut', () => {
    const wrapped = { type: 'learned-dictionary', entries: [{ coicop: '01.1.2', keywords: ['merguez'] }] }
    expect(mergeLearned(wrapped).added).toBe(1)
  })

  it('ignore les entrées invalides (sans COICOP ou sans mot-clé)', () => {
    const r = mergeLearned([{ keywords: ['x'] }, { coicop: '01.1.1' }, 'bidon'])
    expect(r.added).toBe(0)
    expect(r.skipped).toBe(3)
  })

  it('signale une donnée non conforme', () => {
    expect(mergeLearned({ nope: true }).invalid).toBe(true)
  })
})

describe('exportLearnedData', () => {
  it('emballe les entrées avec des métadonnées', () => {
    mergeLearned([{ coicop: '01.1.6', keywords: ['fraise des bois'] }])
    const out = exportLearnedData()
    expect(out.type).toBe('learned-dictionary')
    expect(out.entries).toHaveLength(1)
    expect(typeof out.exportedAt).toBe('string')
  })
})
