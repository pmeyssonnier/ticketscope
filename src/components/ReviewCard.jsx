import React from 'react'
import { COICOP_LABELS } from '../data/coicop.js'
import { formatEUR } from '../lib/format.js'
import { suggestClassification } from '../lib/suggest.js'
import { unitPriceFor } from '../lib/units.js'
import { ConfidenceBadge } from './ui.jsx'

const COICOP_OPTIONS = Object.keys(COICOP_LABELS)

// Une ligne du ticket sous forme de fiche (téléphone) : champs étiquetés,
// pleine largeur, sans défilement horizontal.
export default function ReviewCard({ it, onUpdate, onCorrect, onSuggest, onRemove, onConfirmRead }) {
  const suggestion = !it.coicop ? suggestClassification(it.normalized || it.raw) : null
  const up = unitPriceFor(it)
  const readDoubtful = it.readConfidence != null && it.readConfidence < 0.75
  const name = it.normalized || it.raw || 'ligne'

  return (
    <article className={`rcard ${it.needsReview ? 'review' : ''}`} data-testid="review-card">
      <header className="rcard-head">
        <input
          type="text"
          value={it.normalized}
          placeholder="Produit…"
          aria-label={`Produit : ${name}`}
          onChange={(e) => onCorrect(it.id, { normalized: e.target.value })}
        />
        <button className="btn danger" onClick={() => onRemove(it.id)} title="Supprimer la ligne" aria-label={`Supprimer ${name}`}>
          ✕
        </button>
      </header>
      <div className="raw">{it.manual ? '➕ ligne ajoutée' : `brut : ${it.raw}`}</div>

      {suggestion && (
        <button type="button" className="suggest-chip" onClick={() => onSuggest(it.id, suggestion)} title="Appliquer cette suggestion">
          💡 {suggestion.coicop} · {suggestion.category} → appliquer
        </button>
      )}

      <div className="rgrid three">
        <label>
          <span>Qté</span>
          <input type="number" min="0" inputMode="decimal" value={it.quantity} onChange={(e) => onUpdate(it.id, { quantity: e.target.value })} />
        </label>
        <label>
          <span>Prix unit.</span>
          <input type="number" step="0.01" inputMode="decimal" value={it.unitPrice} onChange={(e) => onUpdate(it.id, { unitPrice: e.target.value })} />
        </label>
        <label>
          <span>Remise</span>
          <input type="number" step="0.01" inputMode="decimal" value={it.discount} onChange={(e) => onUpdate(it.id, { discount: e.target.value })} />
        </label>
      </div>

      <div className="rgrid two">
        <label>
          <span>Format</span>
          <input type="text" value={it.format || ''} placeholder="ex. 750 g" onChange={(e) => onUpdate(it.id, { format: e.target.value })} />
          {up && (
            <small className="unit-price">
              {formatEUR(up.value)} {up.label}
            </small>
          )}
        </label>
        <div className="rnet">
          <span>Net</span>
          <strong>{formatEUR(it.net)}</strong>
        </div>
      </div>

      <label className="rfull">
        <span>Code COICOP</span>
        <select value={it.coicop || ''} onChange={(e) => onCorrect(it.id, { coicop: e.target.value || null })}>
          <option value="">— choisir —</option>
          {COICOP_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c} — {COICOP_LABELS[c]}
            </option>
          ))}
        </select>
      </label>
      <label className="rfull">
        <span>Catégorie</span>
        <input type="text" value={it.category} onChange={(e) => onCorrect(it.id, { category: e.target.value })} />
      </label>

      <footer className="rcard-foot">
        {it.readConfidence != null && <ConfidenceBadge kind="read" value={it.readConfidence} />}
        <ConfidenceBadge kind="class" value={it.confidence} />
        {it.source === 'regle' && <span className="muted" title="Proposé par une règle générique, à confirmer">💡 par règle</span>}
        {readDoubtful && (
          <button type="button" className="link-btn" onClick={() => onConfirmRead(it.id)}>
            ✓ Lecture vérifiée
          </button>
        )}
      </footer>
    </article>
  )
}
