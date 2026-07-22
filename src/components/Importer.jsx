import React, { useRef, useState } from 'react'
import { SAMPLE_TICKET_TEXT } from '../data/sampleTicket.js'
import { parseTicket } from '../lib/parser.js'
import { classifyItems } from '../lib/classifier.js'
import { loadLearned } from '../lib/storage.js'
import { uid } from '../lib/format.js'

export default function Importer({ onDraft }) {
  const [text, setText] = useState('')
  const fileRef = useRef(null)

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

  function onFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const content = String(reader.result || '')
      setText(content)
      analyze(content)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <div className="card">
      <h2>Importer un ticket</h2>
      <p className="hint">
        Collez le texte d'un ticket de caisse (ou importez un fichier .txt issu
        d'un OCR). L'application extrait les produits, les normalise et attribue
        automatiquement un code COICOP.
      </p>

      <div className="btn-row" style={{ marginBottom: 12 }}>
        <button
          className="btn"
          onClick={() => {
            setText(SAMPLE_TICKET_TEXT)
          }}
        >
          🧾 Charger un ticket d'exemple
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          📄 Importer un fichier .txt
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.csv,text/plain"
          onChange={onFile}
          style={{ display: 'none' }}
        />
      </div>

      <label className="field" htmlFor="ticket-text">
        Texte du ticket
      </label>
      <textarea
        id="ticket-text"
        placeholder={
          'Ex.\n26 DASH PODS PL. C     25,60\nOignon rouge 750 g      1,97\n...\nTOTAL PAYE            269,67'
        }
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <div className="btn-row" style={{ marginTop: 14 }}>
        <button className="btn primary" onClick={() => analyze()} disabled={!text.trim()}>
          Analyser le ticket →
        </button>
        {text && (
          <button className="btn" onClick={() => setText('')}>
            Effacer
          </button>
        )}
      </div>

      <p className="inline-note">
        🔒 Tout est traité localement sur votre appareil — aucune donnée n'est
        envoyée sur Internet. La lecture OCR de photos/PDF est prévue en V2 ; le
        parseur accepte déjà tout texte de ticket.
      </p>
    </div>
  )
}
