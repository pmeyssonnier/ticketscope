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

describe('réglages IA', () => {
  it('conserve un modèle connu et remplace un modèle inconnu', async () => {
    const { loadAiSettings } = await import('./storage.js')
    localStorage.setItem('ticketscope.ai.v1', JSON.stringify({ model: 'claude-haiku-4-5' }))
    expect(loadAiSettings().model).toBe('claude-haiku-4-5')
    localStorage.setItem('ticketscope.ai.v1', JSON.stringify({ model: 'claude-sonnet-5-5' }))
    expect(loadAiSettings().model).toBe('claude-sonnet-5-5')
    localStorage.setItem('ticketscope.ai.v1', JSON.stringify({ model: 'inconnu' }))
    expect(loadAiSettings().model).toBe('claude-haiku-4-5')
  })
  it('n\'expose ni n\'écrit jamais la clé API', async () => {
    const { loadAiSettings, saveAiSettings } = await import('./storage.js')
    localStorage.setItem('ticketscope.ai.v1', JSON.stringify({ engine: 'claude', apiKey: 'sk-ant-secret' }))
    expect(loadAiSettings()).not.toHaveProperty('apiKey')
    saveAiSettings({ model: 'claude-sonnet-5', apiKey: 'sk-ant-autre' })
    expect(localStorage.getItem('ticketscope.ai.v1')).not.toMatch(/sk-ant/)
    expect(loadAiSettings()).toMatchObject({ engine: 'claude', model: 'claude-sonnet-5' })
  })
})

describe('learnFromCorrection : résultat d\'écriture (audit P2)', () => {
  it('renvoie true quand c\'est écrit ou quand il n\'y a rien à apprendre', async () => {
    const { learnFromCorrection, loadLearned } = await import('./storage.js')
    expect(learnFromCorrection('LAIT 1L', { coicop: '01.1.4', normalized: 'Lait' })).toBe(true)
    expect(loadLearned()).toHaveLength(1)
    expect(learnFromCorrection('', { coicop: '01.1.4' })).toBe(true)
    expect(learnFromCorrection('X', { normalized: 'sans coicop' })).toBe(true)
    expect(loadLearned()).toHaveLength(1)
  })
  it('renvoie false si localStorage refuse l\'écriture', async () => {
    const { learnFromCorrection } = await import('./storage.js')
    const real = globalThis.localStorage
    globalThis.localStorage = { ...real, getItem: real.getItem, setItem: () => { throw new Error('quota') } }
    expect(learnFromCorrection('PAIN', { coicop: '01.1.1' })).toBe(false)
    globalThis.localStorage = real
  })
  it('mémorise la date de dernière sauvegarde', async () => {
    const { loadLastBackup, markBackupDone } = await import('./storage.js')
    expect(loadLastBackup()).toBeNull()
    markBackupDone(new Date('2026-10-17T12:00:00Z'))
    expect(loadLastBackup()).toBe('2026-10-17T12:00:00.000Z')
  })
})
