import React from 'react'
import { formatEUR } from '../lib/format.js'
import { formatGap } from '../lib/review.js'
import { suggestClassification } from '../lib/suggest.js'
import { shouldSuggest } from '../lib/review.js'
import { familyLabel } from '../data/familyLabels.js'
import CoicopPicker from './CoicopPicker.jsx'

// Vérification d'un ticket pour une famille : le total, puis seulement les articles à vérifier, avec
// des catégories aux noms courants (pas de code). Le détail reste accessible (« modifier en détail »).
export default function FamilyReview({
  items, store, setStore, date, setDate, summary, inTicket,
  onCorrect, onUpdate, onConfirmItem, onRemove, onAdd, onSave, onCancel, onDetail,
}) {
  const { declared, diff, reconciled, net } = summary
  const flagged = items.filter((it) => it.needsReview)
  const others = items.filter((it) => !it.needsReview)
  const suggestionFor = (it) => {
    const s = suggestClassification(it.normalized || it.raw)
    return shouldSuggest(it, s) ? [s.coicop] : []
  }

  return (
    <div className="card family">
      <h2>Vérifiez votre ticket</h2>

      <div className="family-meta">
        <label>
          <span className="rlabel">Magasin</span>
          <input type="text" value={store} onChange={(e) => setStore(e.target.value)} />
        </label>
        <label>
          <span className="rlabel">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>

      <div className={`banner ${declared == null ? '' : reconciled ? 'ok' : 'warn'}`} role="status">
        <span className="b-ico">{declared == null ? '🧾' : reconciled ? '✓' : '⚠'}</span>
        <span>
          <b>{items.length} article{items.length > 1 ? 's' : ''}</b> lu{items.length > 1 ? 's' : ''} · total <b>{formatEUR(net)}</b>
          {declared != null && (reconciled ? ' · cohérent avec le ticket' : ` · écart de ${formatGap(diff, formatEUR)} avec le ticket (${formatEUR(declared)}) : un article a peut-être été oublié ou mal lu`)}
        </span>
      </div>

      {flagged.length > 0 ? (
        <>
          <h3 className="family-h">
            {flagged.length} article{flagged.length > 1 ? 's' : ''} à vérifier
          </h3>
          <div className="fcards">
            {flagged.map((it) => (
              <article className="fcard" key={it.id} data-testid="family-flagged">
                <div className="fcard-top">
                  <input
                    type="text"
                    value={it.normalized}
                    placeholder="Article…"
                    aria-label={`Article : ${it.normalized || it.raw}`}
                    onChange={(e) => onCorrect(it.id, { normalized: e.target.value })}
                  />
                  {it.manual ? (
                    <input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      className="fcard-price"
                      value={it.unitPrice}
                      aria-label="Prix"
                      onChange={(e) => onUpdate(it.id, { unitPrice: e.target.value })}
                    />
                  ) : (
                    <b>{formatEUR(it.net)}</b>
                  )}
                </div>
                {!it.manual && <div className="raw">sur le ticket : {it.raw}</div>}
                <CoicopPicker
                  friendly
                  label="Catégorie"
                  value={it.coicop}
                  suggested={suggestionFor(it)}
                  inTicket={inTicket}
                  placeholder="Choisir une catégorie…"
                  onChange={(code) => onCorrect(it.id, { coicop: code || null })}
                />
                <div className="fcard-actions">
                  <button type="button" className="btn primary" disabled={!it.coicop} onClick={() => onConfirmItem(it.id)}>
                    ✓ C'est bon
                  </button>
                  <button type="button" className="btn danger" onClick={() => onRemove(it.id)} aria-label={`Retirer ${it.normalized || it.raw}`}>
                    🗑 Retirer
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      ) : (
        <p className="family-ok">✓ Tous les articles sont classés.</p>
      )}

      {others.length > 0 && (
        <details className="family-others">
          <summary>
            {flagged.length ? 'Voir les' : 'Voir les'} {others.length} {flagged.length ? 'autres ' : ''}article{others.length > 1 ? 's' : ''}
          </summary>
          <ul>
            {others.map((it) => (
              <li key={it.id}>
                <span className="cg-name">{it.normalized || it.raw}</span>
                <span className="cg-net">{formatEUR(it.net)}</span>
                <CoicopPicker friendly label={`Catégorie de ${it.normalized || it.raw}`} value={it.coicop} inTicket={inTicket} onChange={(code) => onCorrect(it.id, { coicop: code || null })} />
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="family-links">
        <button type="button" className="link-btn" onClick={onAdd}>
          ➕ Ajouter un article oublié
        </button>
        <button type="button" className="link-btn" onClick={onDetail}>
          Modifier en détail (prix, quantités, codes)
        </button>
      </div>

      <div className="review-bar family-bar">
        <div className="rb-main">
          <strong>{formatEUR(net)}</strong>
          <span>{items.length} article{items.length > 1 ? 's' : ''}{flagged.length ? ` · ${flagged.length} à vérifier` : ''}</span>
        </div>
        <button type="button" className="btn" onClick={onCancel}>
          Annuler
        </button>
        <button type="button" className="btn primary" onClick={onSave} disabled={!items.length}>
          💾 Enregistrer
        </button>
      </div>
    </div>
  )
}
