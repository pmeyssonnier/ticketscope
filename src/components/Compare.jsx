import React from 'react'
import { formatEUR, formatDate } from '../lib/format.js'
import { ticketStats, engineLabel, alignItems, pairStatus } from '../lib/compare.js'
import { ConfidenceBadge } from './ui.jsx'

// Une valeur de cellule COICOP + confiance pour un côté (ou « — » si absent).
function Side({ it }) {
  if (!it) return <span className="muted">absent</span>
  return (
    <div className="cmp-cell">
      <span className="cmp-net">{formatEUR(it.net)}</span>
      {it.coicop ? <span className="pill coicop">{it.coicop}</span> : <span className="muted">non classé</span>}
      <ConfidenceBadge value={it.confidence} />
    </div>
  )
}

// Ligne de synthèse : libellé + valeur pour chaque ticket + mise en évidence si différent.
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

export default function Compare({ a, b, onClose }) {
  // Convention : colonne gauche = IA si l'un des deux l'est, sinon ordre reçu.
  let left = a
  let right = b
  const sa = ticketStats(left)
  const sb = ticketStats(right)
  if (sa.engine !== 'ia' && sb.engine === 'ia') {
    ;[left, right] = [right, left]
  }
  const L = ticketStats(left)
  const R = ticketStats(right)

  const pairs = alignItems(left, right)
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
          <button className="modal-close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>

        <p className="hint">
          Idéal pour un <b>même ticket</b> lu par l'IA et par l'OCR local :
          comparez le nombre de lignes lues, les montants, le classement COICOP et
          la confiance. Les lignes sont appariées par nom de produit.
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
              <StatRow label="Magasin" a={left.store} b={right.store} />
              <StatRow label="Date" a={formatDate(left.date)} b={formatDate(right.date)} />
              <StatRow label="Lignes lues" a={L.lines} b={R.lines} delta={dNum(L.lines, R.lines)} />
              <StatRow label="Unités (Σ qté)" a={L.units} b={R.units} delta={dNum(L.units, R.units)} />
              <StatRow label="Total net" a={eur(L.net)} b={eur(R.net)} delta={dNum(L.net, R.net, eur)} />
              <StatRow label="Total ticket" a={eur(L.declared)} b={eur(R.declared)} />
              <StatRow
                label="Écart vs ticket"
                a={eur(L.diff)}
                b={eur(R.diff)}
              />
              <StatRow
                label="Classées COICOP"
                a={`${L.classified}/${L.lines}`}
                b={`${R.classified}/${R.lines}`}
              />
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
                <th>Produit</th>
                <th>{engineLabel(L.engine)}</th>
                <th>{engineLabel(R.engine)}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((p, i) => {
                const st = pairStatus(p)
                return (
                  <tr key={`${p.key}-${i}`} className={`cmp-line ${st}`}>
                    <td>
                      <div className="cmp-name">{p.label}</div>
                      <div className="raw">
                        brut : {(p.a || p.b).raw || '—'}
                      </div>
                    </td>
                    <td>
                      <Side it={p.a} />
                    </td>
                    <td>
                      <Side it={p.b} />
                    </td>
                    <td className="cmp-status">{STATUS_LABEL[st]}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="btn-row" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn primary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
