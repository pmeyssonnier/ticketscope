import React, { useMemo, useState } from 'react'
import { coicopLabel } from '../data/coicop.js'
import { formatEUR, titleFromRaw, uid } from '../lib/format.js'
import { suggestClassification } from '../lib/suggest.js'
import { unitPriceFor } from '../lib/units.js'
import { ConfidenceBadge } from './ui.jsx'
import ReviewCard from './ReviewCard.jsx'
import CoicopPicker from './CoicopPicker.jsx'
import CodesView from './CodesView.jsx'
import FamilyReview from './FamilyReview.jsx'
import { codesInTicket, SIMPLE_MODE_THRESHOLD } from '../lib/codeGroups.js'
import useMediaQuery from '../lib/useMediaQuery.js'
import { computeNeedsReview, recomputeAmounts, reviewSummary, formatGap, correctionsToLearn, shouldSuggest, reconcileWithLocal } from '../lib/review.js'
import { loadLearned } from '../lib/storage.js'

export default function ReviewTable({ draft, onSave, onCancel, advanced = true }) {
  const [store, setStore] = useState(draft.store || '')
  const [date, setDate] = useState(draft.date || '')
  const [items, setItems] = useState(() => draft.items.map((it) => ({ ...it })))
  const [onlyReview, setOnlyReview] = useState(false)
  // Au-delà de 10 lignes, on ouvre sur la liste simplifiée (une ligne par article).
  const [mode, setMode] = useState(() => (draft.items.length > SIMPLE_MODE_THRESHOLD ? 'simple' : 'detail'))
  const [openId, setOpenId] = useState(null)
  // Parcours « famille » : vue simple par défaut ; « Modifier en détail » ouvre l'éditeur complet.
  const [detailed, setDetailed] = useState(advanced)
  const [recheckMsg, setRecheckMsg] = useState('')
  // Téléphone : fiches (sans défilement horizontal) et barre d'écart collante.
  const phone = useMediaQuery('(max-width: 640px)')

  function update(id, patch) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it
        const next = recomputeAmounts({ ...it, ...patch })
        // Modifier la ligne = l'avoir relue : la confiance de lecture passe à 100 %.
        if (it.readConfidence != null) {
          next.readConfidence = 1
          next.needsReview = computeNeedsReview(next)
        }
        return next
      }),
    )
  }

  // « Lecture vérifiée » sans rien modifier.
  function confirmRead(id) {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it
        const next = { ...it, readConfidence: 1 }
        next.needsReview = computeNeedsReview(next)
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

  // « C'est bon » : confirme le classement proposé et la lecture de la ligne.
  function confirmItem(id) {
    const it = items.find((x) => x.id === id)
    if (!it) return
    if (it.coicop) correctClassification(id, { coicop: it.coicop })
    if (it.readConfidence != null) confirmRead(id)
  }

  // Reclassement groupé (écran de contrôle des codes).
  function bulkCorrect(ids, code) {
    const set = new Set(ids)
    setItems((prev) =>
      prev.map((it) =>
        set.has(it.id)
          ? { ...it, coicop: code, coicopLabel: coicopLabel(code), confidence: 1, source: 'manuel', needsReview: false, corrected: true }
          : it,
      ),
    )
  }

  function applySuggestion(id, s) {
    const it = items.find((x) => x.id === id)
    const name = it && it.normalized && it.normalized.trim() ? it.normalized : titleFromRaw(it ? it.raw : '')
    correctClassification(id, { normalized: name, coicop: s.coicop, category: s.category })
  }

  // Reclasse les lignes douteuses avec le dictionnaire sûr (voir reconcileWithLocal).
  function recheck() {
    const { items: next, changed } = reconcileWithLocal(items, loadLearned())
    setItems(next)
    setRecheckMsg(
      changed
        ? `✓ ${changed} ligne(s) reclassée(s) d'après le dictionnaire — à relire.`
        : "Aucune ligne à reclasser : le dictionnaire n'a rien de plus sûr à proposer.",
    )
  }

  function removeItem(id) {
    setItems((prev) => prev.filter((it) => it.id !== id))
  }

  // Ajout manuel d'une ligne (utile quand l'OCR a sauté un produit).
  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        id: uid('it'),
        raw: '',
        manual: true,
        normalized: '',
        quantity: 1,
        unitPrice: 0,
        gross: 0,
        discount: 0,
        net: 0,
        coicop: null,
        coicopLabel: 'Non classé',
        category: '',
        confidence: 0.25,
        source: 'manuel',
        needsReview: true,
      },
    ])
    setOnlyReview(false) // s'assurer que la nouvelle ligne est visible
  }

  const summary = useMemo(
    () => reviewSummary(items, draft.globalDiscountTotal, draft.totalDeclared),
    [items, draft.globalDiscountTotal, draft.totalDeclared],
  )
  const totals = summary
  const declared = summary.declared
  const diff = summary.diff
  const reconciled = summary.reconciled
  const reviewCount = summary.reviewCount
  const inTicket = useMemo(() => codesInTicket(items), [items])
  const visibleItems = onlyReview ? items.filter((it) => it.needsReview) : items

  function save() {
    if (!date && !confirm('Aucune date renseignée : le ticket sera classé « Inconnu » dans le tableau de bord. Enregistrer quand même ?')) return
    // Les champs numériques sont saisis via des <input> et peuvent être des
    // chaînes ; on les normalise en nombres avant persistance (dashboard,
    // exports et comparaison font de l'arithmétique dessus).
    const cleanItems = items.map((it) => ({
      ...it,
      quantity: Number(it.quantity) || 0,
      unitPrice: Number(it.unitPrice) || 0,
      gross: Number(it.gross) || 0,
      discount: Number(it.discount) || 0,
      net: Number(it.net) || 0,
    }))
    const ticket = {
      id: draft.id,
      createdAt: draft.createdAt,
      engine: draft.engine,
      store: store.trim() || 'Magasin inconnu',
      date: date || null,
      items: cleanItems,
      globalDiscountTotal: draft.globalDiscountTotal,
      subtotalDeclared: draft.subtotalDeclared,
      totalDeclared: draft.totalDeclared,
      totalNet: totals.net,
    }
    onSave(ticket, correctionsToLearn(items))
  }

  if (!detailed) {
    return (
      <FamilyReview
        items={items}
        store={store}
        setStore={setStore}
        date={date}
        setDate={setDate}
        summary={summary}
        inTicket={inTicket}
        onCorrect={correctClassification}
        onUpdate={update}
        onConfirmItem={confirmItem}
        onRemove={removeItem}
        onAdd={() => {
          addItem()
          // la nouvelle ligne est « à vérifier » : elle apparaît en tête de la liste
        }}
        onSave={save}
        onCancel={onCancel}
        onDetail={() => setDetailed(true)}
      />
    )
  }

  return (
    <div className="card">
      <h2>Vérification &amp; correction</h2>
      <p className="hint">
        Corrigez si besoin le produit reconnu, le code COICOP ou les montants.
        Pour un produit inconnu, saisissez son nom : une <b>suggestion</b> de
        catégorie et de COICOP apparaît (à appliquer d'un clic). Chaque correction
        enrichit la base pour les prochains tickets.
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
          {reviewCount ? (
            <button
              type="button"
              className={`review-filter ${onlyReview ? 'active' : ''}`}
              onClick={() => setOnlyReview((v) => !v)}
              title="N'afficher que les lignes à confirmer"
            >
              <span className="dot" /> {reviewCount} à confirmer
              <span className="rf-action">{onlyReview ? '— tout afficher' : '— filtrer'}</span>
            </button>
          ) : (
            <div style={{ paddingTop: 8, fontWeight: 700, color: '#15803d' }}>Tout est classé ✓</div>
          )}
          {reviewCount > 0 && (
            <button type="button" className="link-btn" onClick={recheck} title="Reclasser les lignes douteuses avec le dictionnaire (corrections apprises et produits connus)">
              ↻ Revérifier avec le dictionnaire
            </button>
          )}
          {recheckMsg && <div className="hint" role="status">{recheckMsg}</div>}
        </div>
      </div>

      {!phone && declared != null && (
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

      <div className="mode-tabs" role="tablist" aria-label="Mode d'affichage">
        {[['simple', 'Simplifié'], ['detail', 'Détaillé'], ['codes', 'Contrôle des codes']].map(([k, t]) => (
          <button key={k} type="button" role="tab" aria-selected={mode === k} className={`mode-tab ${mode === k ? 'active' : ''}`} onClick={() => setMode(k)}>
            {t}
          </button>
        ))}
      </div>

      {mode === 'codes' ? (
        <CodesView items={items} onBulkCorrect={bulkCorrect} />
      ) : mode === 'simple' ? (
        <ul className="compact-list" data-testid="compact-list">
          {visibleItems.map((it) => (
            <li key={it.id} className={`crow ${it.needsReview ? 'review' : ''}`}>
              <button
                type="button"
                className="crow-main"
                aria-expanded={openId === it.id}
                onClick={() => setOpenId((cur) => (cur === it.id ? null : it.id))}
              >
                <span className="crow-state" aria-label={it.needsReview ? 'À confirmer' : 'Classé'}>{it.needsReview ? '⚠' : '✓'}</span>
                <span className="crow-name">{it.normalized || it.raw || 'ligne'}</span>
                <span className="crow-code">{it.coicop || '—'}</span>
                <span className="crow-net">{formatEUR(it.net)}</span>
              </button>
              {openId === it.id && (
                <ReviewCard
                  it={it}
                  onUpdate={update}
                  onCorrect={correctClassification}
                  onSuggest={applySuggestion}
                  onRemove={removeItem}
                  onConfirmRead={confirmRead}
                  inTicket={inTicket}
                />
              )}
            </li>
          ))}
        </ul>
      ) : phone ? (
        <div className="rcards">
          {visibleItems.map((it) => (
            <ReviewCard
              key={it.id}
              it={it}
              onUpdate={update}
              onCorrect={correctClassification}
              onSuggest={applySuggestion}
              onRemove={removeItem}
              onConfirmRead={confirmRead}
              inTicket={inTicket}
            />
          ))}
        </div>
      ) : (
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Produit reconnu</th>
              <th className="num">Qté</th>
              <th className="num">P.U.</th>
              <th className="num">Remise</th>
              <th className="num">Net</th>
              <th>Format · €/u</th>
              <th>COICOP</th>
              <th>Catégorie</th>
              <th>Confiance</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((it) => (
              <tr key={it.id} className={it.needsReview ? 'review' : ''}>
                <td style={{ minWidth: 180 }}>
                  <input
                    type="text"
                    value={it.normalized}
                    placeholder="Produit…"
                    onChange={(e) => correctClassification(it.id, { normalized: e.target.value })}
                  />
                  <input
                    type="text"
                    className="brand-input"
                    value={it.brand || ''}
                    placeholder="Marque (optionnel)"
                    aria-label={`Marque : ${it.normalized || it.raw || 'ligne'}`}
                    onChange={(e) => correctClassification(it.id, { brand: e.target.value })}
                  />
                  <div className="raw">{it.manual ? '➕ ligne ajoutée' : `brut : ${it.raw}`}</div>
                  {(() => {
                      const s = suggestClassification(it.normalized || it.raw)
                      return shouldSuggest(it, s) ? (
                        <button
                          type="button"
                          className="suggest-chip"
                          onClick={() => applySuggestion(it.id, s)}
                          title="Appliquer cette suggestion"
                        >
                          💡 {s.coicop} · {s.category} → appliquer
                        </button>
                      ) : null
                    })()}
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
                <td style={{ width: 116 }}>
                  <input
                    type="text"
                    value={it.format || ''}
                    placeholder="ex. 750 g"
                    onChange={(e) => update(it.id, { format: e.target.value })}
                  />
                  {(() => {
                    const up = unitPriceFor(it)
                    return up ? (
                      <div className="unit-price">
                        {formatEUR(up.value)} {up.label}
                      </div>
                    ) : null
                  })()}
                </td>
                <td style={{ width: 110 }}>
                  <CoicopPicker
                    value={it.coicop}
                    onChange={(code) => correctClassification(it.id, { coicop: code || null })}
                    suggested={(() => { const f = suggestClassification(it.normalized || it.raw); return shouldSuggest(it, f) ? [f.coicop] : [] })()}
                    inTicket={inTicket}
                  />
                </td>
                <td style={{ minWidth: 140 }}>
                  <input
                    type="text"
                    value={it.category}
                    onChange={(e) => correctClassification(it.id, { category: e.target.value })}
                  />
                </td>
                <td>
                  <div style={{ display: 'grid', gap: 4, justifyItems: 'start' }}>
                    {it.readConfidence != null && <ConfidenceBadge kind="read" value={it.readConfidence} />}
                    <ConfidenceBadge kind="class" value={it.confidence} />
                    {it.source === 'regle' && <span className="muted" title="Proposé par une règle générique, à confirmer">💡 par règle</span>}
                    {it.readConfidence != null && it.readConfidence < 0.75 && (
                      <button type="button" className="link-btn" onClick={() => confirmRead(it.id)}>
                        ✓ Lecture vérifiée
                      </button>
                    )}
                  </div>
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
      )}

      <div className="btn-row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={addItem}>
          ➕ Ajouter une ligne
        </button>
        {declared != null && !reconciled && (
          <span className="muted" style={{ alignSelf: 'center' }}>
            Écart de {formatEUR(diff)} — l'OCR a peut-être sauté un produit ?
          </span>
        )}
      </div>

      {onlyReview && (
        <div className="filter-banner">
          {visibleItems.length > 0 ? (
            <>
              🔎 Filtre actif : {visibleItems.length} ligne{visibleItems.length > 1 ? 's' : ''} à
              confirmer. Attribuez un code COICOP pour valider chacune.
              <button type="button" className="link-btn" onClick={() => setOnlyReview(false)}>
                Tout afficher
              </button>
            </>
          ) : (
            <>
              ✓ Toutes les lignes sont confirmées.
              <button type="button" className="link-btn" onClick={() => setOnlyReview(false)}>
                Revenir à la liste complète
              </button>
            </>
          )}
        </div>
      )}

      {phone ? (
        <>
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={onCancel}>
              Annuler
            </button>
          </div>
          <div className={`review-bar ${declared == null ? '' : reconciled ? 'ok' : 'warn'}`} role="status" aria-live="polite" data-testid="review-bar">
            <div className="rb-main">
              {declared != null ? (
                <>
                  <strong>
                    {reconciled ? '✓ Total cohérent' : `⚠ Écart ${formatGap(diff, formatEUR)}`}
                  </strong>
                  <span>
                    Ticket {formatEUR(declared)} · recalculé {formatEUR(totals.net)}
                  </span>
                </>
              ) : (
                <>
                  <strong>Net recalculé {formatEUR(totals.net)}</strong>
                  <span>{items.length} ligne(s) · total du ticket non lu</span>
                </>
              )}
              {reviewCount > 0 && (
                <button type="button" className="rb-chip" onClick={() => setOnlyReview((v) => !v)}>
                  {reviewCount} à confirmer {onlyReview ? '· tout afficher' : '· filtrer'}
                </button>
              )}
            </div>
            <button className="btn primary" onClick={save} disabled={!items.length}>
              💾 Enregistrer
            </button>
          </div>
        </>
      ) : (
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
      )}
    </div>
  )
}
