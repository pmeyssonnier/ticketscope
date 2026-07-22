import React, { useRef, useState } from 'react'
import { SAMPLE_TICKET_TEXT } from '../data/sampleTicket.js'
import { parseTicket } from '../lib/parser.js'
import { classifyItems } from '../lib/classifier.js'
import { loadLearned } from '../lib/storage.js'
import { uid } from '../lib/format.js'
import { extractText } from '../lib/ocr.js'

export default function Importer({ onDraft }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const photoRef = useRef(null)
  const pdfRef = useRef(null)
  const txtRef = useRef(null)

  function analyze(source) {
    const input = (source ?? text).trim()
    if (!input) return
    const parsed = parseTicket(input)
    const learned = loadLearned()
    const items = classifyItems(parsed.items, learned).map((it) => ({
      ...it,
      id: uid('it'),
    }))
    onDraft({
      id: uid('tk'),
      createdAt: new Date().toISOString(),
      rawText: input,
      store: parsed.store,
      date: parsed.date,
      items,
      globalDiscountTotal: parsed.globalDiscountTotal,
      subtotalDeclared: parsed.subtotalDeclared,
      totalDeclared: parsed.totalDeclared,
    })
  }

  async function handleScan(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setBusy(true)
    setProgress({ label: 'Préparation…', progress: 0 })
    try {
      const { text: extracted } = await extractText(file, setProgress)
      const clean = (extracted || '').trim()
      setText(clean)
      if (clean) analyze(clean)
      else setError("Aucun texte n'a pu être lu. Réessayez avec une photo plus nette et bien cadrée.")
    } catch (err) {
      console.error(err)
      setError(
        "La lecture a échoué. Vérifiez votre connexion au premier usage (chargement du moteur), puis réessayez.",
      )
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  function onTxt(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const content = String(reader.result || '')
      setText(content)
      analyze(content)
    }
    reader.readAsText(file)
  }

  const pct = progress ? Math.round((progress.progress || 0) * 100) : 0

  return (
    <div className="card">
      <h2>Importer un ticket</h2>
      <p className="hint">
        Photographiez un ticket, importez un PDF ou collez son texte.
        L'application lit le ticket, extrait les produits, les normalise et leur
        attribue un code COICOP.
      </p>

      <div className="import-actions">
        <button className="btn primary" onClick={() => photoRef.current?.click()} disabled={busy}>
          📷 Photographier / choisir une image
        </button>
        <button className="btn" onClick={() => pdfRef.current?.click()} disabled={busy}>
          📄 Importer un PDF
        </button>
        <button className="btn" onClick={() => txtRef.current?.click()} disabled={busy}>
          📃 Fichier texte
        </button>
        <button className="btn" onClick={() => setText(SAMPLE_TICKET_TEXT)} disabled={busy}>
          🧾 Exemple
        </button>
      </div>

      <input ref={photoRef} type="file" accept="image/*" capture="environment" onChange={handleScan} style={{ display: 'none' }} />
      <input ref={pdfRef} type="file" accept="application/pdf,.pdf" onChange={handleScan} style={{ display: 'none' }} />
      <input ref={txtRef} type="file" accept=".txt,.csv,text/plain" onChange={onTxt} style={{ display: 'none' }} />

      {busy && (
        <div className="ocr-progress">
          <div className="ocr-label">
            <span className="spin">◠</span> {progress?.label || 'Traitement…'} {pct ? `${pct}%` : ''}
          </div>
          <div className="progress">
            <div className="bar" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {error && (
        <div className="banner warn" style={{ marginTop: 12 }}>
          <span className="b-ico">⚠</span>
          <span>{error}</span>
        </div>
      )}

      <label className="field" htmlFor="ticket-text" style={{ marginTop: 14 }}>
        Texte du ticket {text && <span className="muted">(vérifiable / modifiable avant analyse)</span>}
      </label>
      <textarea
        id="ticket-text"
        placeholder={'Le texte lu apparaît ici — ou collez-le directement.\n\n26 DASH PODS PL. C     25,60\n...\nTOTAL PAYE           269,67'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
      />

      <div className="btn-row" style={{ marginTop: 14 }}>
        <button className="btn primary" onClick={() => analyze()} disabled={!text.trim() || busy}>
          Analyser le ticket →
        </button>
        {text && !busy && (
          <button className="btn" onClick={() => { setText(''); setError('') }}>
            Effacer
          </button>
        )}
      </div>

      <p className="inline-note">
        🔒 Photo, PDF et OCR sont traités <b>entièrement sur votre appareil</b> —
        aucune image n'est envoyée sur Internet. Au tout premier usage, le moteur
        OCR (~3 Mo) et le modèle français se chargent puis restent disponibles
        hors connexion.
      </p>
    </div>
  )
}
