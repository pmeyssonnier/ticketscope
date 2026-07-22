import React, { useRef, useState } from 'react'
import { SAMPLE_TICKET_TEXT } from '../data/sampleTicket.js'
import { parseTicket } from '../lib/parser.js'
import { classifyItems } from '../lib/classifier.js'
import { loadLearned } from '../lib/storage.js'
import { uid } from '../lib/format.js'
import { extractText, extractTextMulti } from '../lib/ocr.js'

export default function Importer({ onDraft }) {
  const [text, setText] = useState('')
  const [queue, setQueue] = useState([]) // [{ id, url, file }]
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const [enhance, setEnhance] = useState(true)
  const [preview, setPreview] = useState('')
  const cameraRef = useRef(null)
  const galleryRef = useRef(null)
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

  function addToQueue(fileList) {
    const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    setError('')
    setQueue((q) => [...q, ...files.map((file) => ({ id: uid('ph'), url: URL.createObjectURL(file), file }))])
  }

  function removeFromQueue(id) {
    setQueue((q) => {
      const item = q.find((p) => p.id === id)
      if (item) URL.revokeObjectURL(item.url)
      return q.filter((p) => p.id !== id)
    })
  }

  function clearQueue() {
    setQueue((q) => {
      q.forEach((p) => URL.revokeObjectURL(p.url))
      return []
    })
  }

  async function readQueue() {
    if (!queue.length) return
    setError('')
    setPreview('')
    setBusy(true)
    setProgress({ label: 'Préparation…', progress: 0 })
    try {
      const files = queue.map((p) => p.file)
      const { text: extracted } =
        files.length === 1
          ? await extractText(files[0], setProgress, { enhance, onPreview: setPreview })
          : await extractTextMulti(files, setProgress, { enhance, onPreview: setPreview })
      const clean = (extracted || '').trim()
      setText(clean)
      clearQueue()
      if (clean) analyze(clean)
      else setError("Aucun texte n'a pu être lu. Réessayez avec des photos plus nettes, bien cadrées et qui se recouvrent légèrement.")
    } catch (err) {
      console.error(err)
      setError('La lecture a échoué. Vérifiez votre connexion au premier usage (chargement du moteur), puis réessayez.')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  async function handlePdf(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setPreview('')
    setBusy(true)
    setProgress({ label: 'Lecture du PDF…', progress: 0 })
    try {
      const { text: extracted } = await extractText(file, setProgress, { enhance, onPreview: setPreview })
      const clean = (extracted || '').trim()
      setText(clean)
      if (clean) analyze(clean)
      else setError("Aucun texte n'a pu être lu dans ce PDF.")
    } catch (err) {
      console.error(err)
      setError('La lecture du PDF a échoué.')
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
        Photographiez le ticket (une ou plusieurs photos pour les longs tickets),
        importez un PDF ou collez son texte. L'application lit le ticket, extrait
        les produits, les normalise et leur attribue un code COICOP.
      </p>

      <div className="import-actions">
        <button className="btn primary" onClick={() => cameraRef.current?.click()} disabled={busy}>
          📷 {queue.length ? 'Ajouter une photo' : 'Photographier'}
        </button>
        <button className="btn" onClick={() => galleryRef.current?.click()} disabled={busy}>
          🖼️ Galerie
        </button>
        <button className="btn" onClick={() => pdfRef.current?.click()} disabled={busy}>
          📄 PDF
        </button>
        <button className="btn" onClick={() => txtRef.current?.click()} disabled={busy}>
          📃 Texte
        </button>
      </div>

      <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={(e) => { addToQueue(e.target.files); e.target.value = '' }} style={{ display: 'none' }} />
      <input ref={galleryRef} type="file" accept="image/*" multiple onChange={(e) => { addToQueue(e.target.files); e.target.value = '' }} style={{ display: 'none' }} />
      <input ref={pdfRef} type="file" accept="application/pdf,.pdf" onChange={handlePdf} style={{ display: 'none' }} />
      <input ref={txtRef} type="file" accept=".txt,.csv,text/plain" onChange={onTxt} style={{ display: 'none' }} />

      <label className="toggle">
        <input type="checkbox" checked={enhance} onChange={(e) => setEnhance(e.target.checked)} disabled={busy} />
        <span>✨ Améliorer l'image avant lecture <span className="muted">(contraste, ombres, redressement — recommandé)</span></span>
      </label>

      {queue.length > 0 && (
        <div className="photo-queue">
          <div className="pq-head">
            <b>{queue.length} photo{queue.length > 1 ? 's' : ''}</b>
            <span className="muted"> — dans l'ordre du haut vers le bas du ticket</span>
          </div>
          <div className="pq-grid">
            {queue.map((p, i) => (
              <div className="pq-item" key={p.id}>
                <img src={p.url} alt={`Photo ${i + 1}`} />
                <span className="pq-num">{i + 1}</span>
                {!busy && (
                  <button className="pq-del" onClick={() => removeFromQueue(p.id)} title="Retirer">
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
          <div className="btn-row" style={{ marginTop: 10 }}>
            <button className="btn primary" onClick={readQueue} disabled={busy}>
              🔎 Lire {queue.length > 1 ? `les ${queue.length} photos` : 'la photo'} →
            </button>
            <button className="btn" onClick={clearQueue} disabled={busy}>
              Vider
            </button>
          </div>
          {queue.length > 1 && (
            <p className="inline-note">
              Astuce : laissez un léger recouvrement entre deux photos — les
              lignes communes sont détectées et non dupliquées.
            </p>
          )}
        </div>
      )}

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

      {preview && (
        <div className="ocr-preview">
          <img src={preview} alt="Image optimisée pour l'OCR" />
          <span className="muted">Image telle que lue par l'OCR</span>
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
        <button className="btn" onClick={() => setText(SAMPLE_TICKET_TEXT)} disabled={busy}>
          🧾 Exemple
        </button>
        {text && !busy && (
          <button className="btn" onClick={() => { setText(''); setError('') }}>
            Effacer
          </button>
        )}
      </div>

      <p className="inline-note">
        🔒 Photos, PDF et OCR sont traités <b>entièrement sur votre appareil</b> —
        rien n'est envoyé sur Internet. Au tout premier usage, le moteur OCR
        (~3 Mo) et le modèle français se chargent puis restent disponibles hors
        connexion.
      </p>
    </div>
  )
}
