import React, { useEffect, useMemo, useState } from 'react'
import { formatEUR, formatDate } from '../lib/format.js'
import { COICOP_LABELS, coicopLabel } from '../data/coicop.js'
import { ticketEngine, ticketStats, engineLabel, alignItems, pairStatus } from '../lib/compare.js'
import { ConfidenceBadge } from './ui.jsx'

const COICOP_OPTIONS = Object.keys(COICOP_LABELS)

// Cellule d'un côté en lecture : nom, libellé brut, montant, COICOP, confiance.
function Side({ it }) {
  if (!it) return <div className="cmp-cell cmp-absent muted">absent</div>
  return (
    <div className="cmp-cell">
      <div className="cmp-name">{it.normalized || it.raw || '—'}</div>
      <div className="raw">brut : {it.raw || '—'}</div>
      <div className="cmp-vals">
        <span className="cmp-net">{formatEUR(it.net)}</span>
        {it.coicop ? <span className="pill coicop">{it.coicop}</span> : <span className="muted">non classé</span>}
        <ConfidenceBadge value={it.confidence} />
      </div>
    </div>
  )
}

// Cellule d'un côté en édition : nom, montant, COICOP, catégorie modifiables.
function SideEdit({ it, onChange }) {
  if (!it) return <div className="cmp-cell cmp-absent muted">absent</div>
  return (
    <div className="cmp-cell cmp-edit">
      <input
        type="text"
        value={it.normalized || ''}
        placeholder="Produit…"
        onChange={(e) => onChange({ normalized: e.target.value })}
      />
      <div className="raw">brut : {it.raw || '—'}</div>
      <div className="cmp-vals">
        <input
          type="number"
          step="0.01"
          className="cmp-num"
          value={it.net}
          onChange={(e) => onChange({ net: e.target.value === '' ? 0 : Number(e.target.value) })}
          title="Montant net"
        />
        <select value={it.coicop || ''} onChange={(e) => onChange({ coicop: e.target.value || null })}>
          <option value="">— COICOP —</option>
          {COICOP_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c} — {COICOP_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      <input
        type="text"
        value={it.category || ''}
        placeholder="Catégorie…"
        onChange={(e) => onChange({ category: e.target.value })}
      />
    </div>
  )
}

function StatRow({ label, a, b, delta }) {
  const diff = a !== b
  return (
    <tr className={diff ? 'cmp-diff-row' : ''}>
      <th scope="row">{label}</th>
      <td>{a}</td>
      <td>{b}</td>
      <td className="cmp-delta">{delta}</td>
    </tr>
  )
}

const STATUS_LABEL = {
  'only-a': 'IA seul',
  'only-b': 'OCR seul',
  'coicop-diff': 'COICOP ≠',
  'net-diff': 'Montant ≠',
  same: '',
}

// Recalcule montants dérivés quand on modifie une ligne.
function applyPatch(it, patch) {
  const next = { ...it, ...patch }
  if ('coicop' in patch) next.coicopLabel = coicopLabel(patch.coicop)
  if ('net' in patch) {
    const q = Number(next.quantity) || 1
    next.gross = +((Number(next.net) || 0) - (Number(next.discount) || 0)).toFixed(2)
    next.unitPrice = +(next.gross / q).toFixed(2)
  }
  return next
}

// Champs recopiés d'un côté vers l'autre (identité + classement + montants).
const COPY_FIELDS = ['normalized', 'quantity', 'unitPrice', 'gross', 'discount', 'net', 'coicop', 'coicopLabel', 'category']

export default function Compare({ a, b, onClose, onUpdateTicket }) {
  // Convention : colonne gauche = IA si l'un des deux l'est. Ajoute un id de
  // repli aux lignes qui n'en ont pas (anciens tickets) pour l'appariement.
  const prepared = useMemo(() => {
    let left = a
    let right = b
    if (ticketEngine(a) !== 'ia' && ticketEngine(b) === 'ia') {
      left = b
      right = a
    }
    const withIds = (items, p) => (items || []).map((it, i) => ({ ...it, id: it.id || `${p}${i}` }))
    return { left, right, itemsL0: withIds(left.items, 'l'), itemsR0: withIds(right.items, 'r') }
  }, [a, b])

  const [itemsL, setItemsL] = useState(prepared.itemsL0)
  const [itemsR, setItemsR] = useState(prepared.itemsR0)
  const [edit, setEdit] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)

  // Resynchronise seulement quand la PAIRE sélectionnée change (nouveaux ids),
  // pas quand le contenu d'un ticket est mis à jour (ex. après enregistrement).
  const leftId = prepared.left.id
  const rightId = prepared.right.id
  useEffect(() => {
    setItemsL(prepared.itemsL0)
    setItemsR(prepared.itemsR0)
    setDirty(false)
    setSaved(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leftId, rightId])

  // Appariement figé sur les libellés d'origine (l'édition ne le rebat pas).
  const pairs = useMemo(
    () => alignItems({ items: prepared.itemsL0 }, { items: prepared.itemsR0 }),
    [prepared],
  )
  const curL = useMemo(() => new Map(itemsL.map((it) => [it.id, it])), [itemsL])
  const curR = useMemo(() => new Map(itemsR.map((it) => [it.id, it])), [itemsR])

  const L = ticketStats({ ...prepared.left, items: itemsL })
  const R = ticketStats({ ...prepared.right, items: itemsR })

  function patch(side, id, p) {
    const setItems = side === 'L' ? setItemsL : setItemsR
    setItems((prev) => prev.map((it) => (it.id === id ? applyPatch(it, p) : it)))
    setDirty(true)
    setSaved(false)
  }

  function copyAcross(pair, dir) {
    const src = dir === 'toR' ? curL.get(pair.a.id) : curR.get(pair.b.id)
    if (!src) return
    const targetId = dir === 'toR' ? pair.b.id : pair.a.id
    const setItems = dir === 'toR' ? setItemsR : setItemsL
    const p = {}
    for (const f of COPY_FIELDS) p[f] = src[f]
    setItems((prev) => prev.map((it) => (it.id === targetId ? { ...it, ...p } : it)))
    setDirty(true)
    setSaved(false)
  }

  function save() {
    onUpdateTicket?.({ ...prepared.left, items: itemsL })
    onUpdateTicket?.({ ...prepared.right, items: itemsR })
    setDirty(false)
    setSaved(true)
  }

  const common = pairs.filter((p) => p.a && p.b).length
  const onlyLeft = pairs.filter((p) => p.a && !p.b).length
  const onlyRight = pairs.filter((p) => p.b && !p.a).length

  const eur = (n) => (n == null ? '—' : formatEUR(n))
  const pct = (n) => (n == null ? '—' : `${Math.round(n * 100)} %`)
  const dNum = (x, y, fmt = (v) => v) => {
    if (x == null || y == null) return ''
    const d = +(x - y).toFixed(2)
    if (!d) return '='
    return (d > 0 ? '+' : '') + fmt(d)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Comparaison de deux tickets</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className={`btn ${edit ? 'primary' : ''}`}
              style={{ padding: '5px 12px' }}
              onClick={() => setEdit((v) => !v)}
            >
              {edit ? '👁 Aperçu' : '✏️ Modifier'}
            </button>
            <button className="modal-close" onClick={onClose} aria-label="Fermer">
              ✕
            </button>
          </div>
        </div>

        <p className="hint">
          {edit ? (
            <>
              Corrigez chaque côté (nom, montant, COICOP, catégorie). Sur une ligne
              commune, les flèches <b>→</b> / <b>←</b> recopient la ligne d'un côté
              vers l'autre. « Enregistrer » met à jour les <b>deux tickets</b>.
            </>
          ) : (
            <>
              Idéal pour un <b>même ticket</b> lu par l'IA et par l'OCR local. Les
              lignes sont appariées par libellé. Cliquez <b>✏️ Modifier</b> pour
              corriger les données.
            </>
          )}
        </p>

        <div className="table-wrap">
          <table className="data cmp-stats">
            <thead>
              <tr>
                <th></th>
                <th>
                  <span className={`pill engine ${L.engine}`}>{engineLabel(L.engine)}</span>
                </th>
                <th>
                  <span className={`pill engine ${R.engine}`}>{engineLabel(R.engine)}</span>
                </th>
                <th className="cmp-delta">Δ</th>
              </tr>
            </thead>
            <tbody>
              <StatRow label="Magasin" a={prepared.left.store} b={prepared.right.store} />
              <StatRow label="Date" a={formatDate(prepared.left.date)} b={formatDate(prepared.right.date)} />
              <StatRow label="Lignes lues" a={L.lines} b={R.lines} delta={dNum(L.lines, R.lines)} />
              <StatRow label="Unités (Σ qté)" a={L.units} b={R.units} delta={dNum(L.units, R.units)} />
              <StatRow label="Total net" a={eur(L.net)} b={eur(R.net)} delta={dNum(L.net, R.net, eur)} />
              <StatRow label="Total ticket" a={eur(L.declared)} b={eur(R.declared)} />
              <StatRow label="Écart vs ticket" a={eur(L.diff)} b={eur(R.diff)} />
              <StatRow label="Classées COICOP" a={`${L.classified}/${L.lines}`} b={`${R.classified}/${R.lines}`} />
              <StatRow label="À confirmer" a={L.review} b={R.review} delta={dNum(L.review, R.review)} />
              <StatRow label="Confiance moy." a={pct(L.avgConf)} b={pct(R.avgConf)} />
            </tbody>
          </table>
        </div>

        <div className="cmp-legend">
          <span className="cmp-tag same">{common} commune(s)</span>
          <span className="cmp-tag only-a">{onlyLeft} {engineLabel(L.engine)} seul</span>
          <span className="cmp-tag only-b">{onlyRight} {engineLabel(R.engine)} seul</span>
        </div>

        <div className="table-wrap">
          <table className="data cmp-lines">
            <thead>
              <tr>
                <th>{engineLabel(L.engine)}</th>
                <th>{engineLabel(R.engine)}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((p, i) => {
                const ca = p.a ? curL.get(p.a.id) : null
                const cb = p.b ? curR.get(p.b.id) : null
                const st = pairStatus({ a: ca, b: cb })
                return (
                  <tr key={`${p.key}-${i}`} className={`cmp-line ${st}`}>
                    <td>
                      {edit ? (
                        <SideEdit it={ca} onChange={(pp) => patch('L', p.a.id, pp)} />
                      ) : (
                        <Side it={ca} />
                      )}
                    </td>
                    <td>
                      {edit ? (
                        <SideEdit it={cb} onChange={(pp) => patch('R', p.b.id, pp)} />
                      ) : (
                        <Side it={cb} />
                      )}
                    </td>
                    <td className="cmp-status">
                      {edit && ca && cb ? (
                        <div className="cmp-copy">
                          <button className="btn" title="Copier IA → OCR" onClick={() => copyAcross(p, 'toR')}>
                            →
                          </button>
                          <button className="btn" title="Copier OCR → IA" onClick={() => copyAcross(p, 'toL')}>
                            ←
                          </button>
                        </div>
                      ) : (
                        STATUS_LABEL[st]
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="btn-row" style={{ marginTop: 16, alignItems: 'center' }}>
          {edit && (
            <button className="btn primary" onClick={save} disabled={!dirty}>
              💾 Enregistrer les modifications
            </button>
          )}
          {saved && <span className="muted" style={{ color: '#15803d' }}>✓ Modifications enregistrées</span>}
          {edit && dirty && !saved && <span className="muted">Modifications non enregistrées</span>}
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
