import React, { useMemo, useState } from 'react'
import { COICOP_LABELS, coicopLabel } from '../data/coicop.js'
import { formatEUR } from '../lib/format.js'
import { ConfidenceBadge } from './ui.jsx'

const COICOP_OPTIONS = Object.keys(COICOP_LABELS)

export default function ReviewTable({ draft, onSave, onCancel }) {
  const [store, setStore] = useState(draft.store || '')
  const [date, setDate] = useState(draft.date || new Date().toISOString().slice(0, 10))
  const [items, setItems] = useState(() => draft.items.map((it) => ({ ...it })))

  function update(id, patch) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it
        const next = { ...it, ...patch }
        const q = Number(next.quantity) || 0
        const up = Number(next.unitPrice) || 0
        next.gross = +(q * up).toFixed(2)
        next.net = +(next.gross + (Number(next.discount) || 0)).toFixed(2)
        return next
      }),
    )
  }

  function correctClassification(id, patch) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it
        const next = { ...it, ...patch, corrected: true }
        if (patch.coicop !== undefined) {
          next.coicopLabel = coicopLabel(patch.coicop)
          next.confidence = 1
          next.source = 'manuel'
          next.needsReview = false
        }
        return next
      }),
    )
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  const totals = useMemo(() => {
    const gross = +items.reduce((a, b) => a + (b.gross || 0), 0).toFixed(2)
    const discount = +items.reduce((a, b) => a + (b.discount || 0), 0).toFixed(2)
    const net = +(gross + discount + (draft.globalDiscountTotal || 0)).toFixed(2)
    return { gross, discount, net }
  }, [items, draft.globalDiscountTotal])

  const declared = draft.totalDeclared
  const diff = declared != null ? +(totals.net - declared).toFixed(2) : null
  const reconciled = diff != null && Math.abs(diff) < 0.02
  const reviewCount = items.filter((it) => it.needsReview).length

  function save() {
    const ticket = {
      id: draft.id,
      createdAt: draft.createdAt,
      store: store.trim() || 'Magasin inconnu',
      date,
      items,
      globalDiscountTotal: draft.globalDiscountTotal,
      subtotalDeclared: draft.subtotalDeclared,
      totalDeclared: draft.totalDeclared,
      totalNet: totals.net,
    }
    const corrections = items
      .filter((it) => it.corrected && it.coicop)
      .map((it) => ({
        raw: it.raw,
        correction: {
          normalized: it.normalized,
          brand: it.brand,
          coicop: it.coicop,
          category: it.category,
        },
      }))
    onSave(ticket, corrections)
  }

  return (
    <div className="card">
      <h2>Vérification &amp; correction</h2>
      <p className="hint">
        Corrigez si besoin le produit reconnu, le code COICOP ou les montants.
        Chaque correction enrichit la base pour les prochains tickets.
      </p>

      <div className="grid cols-3" style={{ marginBottom: 16 }}>
        <div>
          <label className="field">Enseigne / magasin</label>
          <input type="text" value={store} onChange={(e) => setStore(e.target.value)} />
        </div>
        <div>
          <label className="field">Date du ticket</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label className="field">Lignes à vérifier</label>
          <div style={{ paddingTop: 8, fontWeight: 700, color: reviewCount ? '#b45309' : '#15803d' }}>
            {reviewCount ? `${reviewCount} à confirmer` : 'Tout est classé ✓'}
          </div>
        </div>
      </div>

      {declared != null && (
        <div className={`banner ${reconciled ? 'ok' : 'warn'}`}>
          <span className="b-ico">{reconciled ? '✓' : '⚠'}</span>
          <span>
            {reconciled ? (
              <>
                Total recalculé <b>{formatEUR(totals.net)}</b> — cohérent avec le
                total payé du ticket.
              </>
            ) : (
              <>
                Total recalculé <b>{formatEUR(totals.net)}</b> vs total ticket{' '}
                <b>{formatEUR(declared)}</b> (écart {formatEUR(diff)}). Vérifiez
                les quantités, remises ou lignes manquantes.
              </>
            )}
          </span>
        </div>
      )}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Produit reconnu</th>
              <th className="num">Qté</th>
              <th className="num">P.U.</th>
              <th className="num">Remise</th>
              <th className="num">Net</th>
              <th>COICOP</th>
              <th>Catégorie</th>
              <th>Confiance</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className={it.needsReview ? 'review' : ''}>
                <td style={{ minWidth: 180 }}>
                  <input
                    type="text"
                    value={it.normalized}
                    placeholder="Produit…"
                    onChange={(e) => correctClassification(it.id, { normalized: e.target.value })}
                  />
                  <div className="raw">brut : {it.raw}</div>
                </td>
                <td className="num" style={{ width: 74 }}>
                  <input
                    type="number"
                    min="0"
                    value={it.quantity}
                    onChange={(e) => update(it.id, { quantity: e.target.value })}
                  />
                </td>
                <td className="num" style={{ width: 118 }}>
                  <input
                    type="number"
                    step="0.01"
                    value={it.unitPrice}
                    onChange={(e) => update(it.id, { unitPrice: e.target.value })}
                  />
                </td>
                <td className="num" style={{ width: 112 }}>
                  <input
                    type="number"
                    step="0.01"
                    value={it.discount}
                    onChange={(e) => update(it.id, { discount: e.target.value })}
                  />
                </td>
                <td className="num" style={{ whiteSpace: 'nowrap' }}>{formatEUR(it.net)}</td>
                <td style={{ width: 110 }}>
                  <select
                    value={it.coicop || ''}
                    onChange={(e) => correctClassification(it.id, { coicop: e.target.value || null })}
                  >
                    <option value="">—</option>
                    {COICOP_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ minWidth: 140 }}>
                  <input
                    type="text"
                    value={it.category}
                    onChange={(e) => correctClassification(it.id, { category: e.target.value })}
                  />
                </td>
                <td>
                  <ConfidenceBadge value={it.confidence} />
                </td>
                <td>
                  <button
                    className="btn danger"
                    style={{ padding: '4px 9px' }}
                    onClick={() => removeItem(it.id)}
                    title="Supprimer la ligne"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="btn-row" style={{ marginTop: 16 }}>
        <button className="btn primary" onClick={save} disabled={!items.length}>
          💾 Enregistrer le ticket
        </button>
        <button className="btn" onClick={onCancel}>
          Annuler
        </button>
        <div style={{ flex: 1 }} />
        <div className="muted" style={{ alignSelf: 'center' }}>
          {items.length} ligne(s) · net {formatEUR(totals.net)}
        </div>
      </div>
    </div>
  )
}
