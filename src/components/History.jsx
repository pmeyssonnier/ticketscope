import React, { useMemo, useState } from 'react'
import { formatEUR, formatDate, normalizeStr } from '../lib/format.js'
import { exportCSV, exportJSON, exportXLSX } from '../lib/exporters.js'
import { ConfidenceBadge, Empty } from './ui.jsx'

export default function History({ tickets, onDelete }) {
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState(null)

  const filtered = useMemo(() => {
    const q = normalizeStr(query)
    if (!q) return tickets
    return tickets.filter((t) => {
      if (normalizeStr(t.store).includes(q)) return true
      return (t.items || []).some(
        (it) =>
          normalizeStr(it.normalized).includes(q) ||
          normalizeStr(it.raw).includes(q) ||
          normalizeStr(it.category).includes(q) ||
          (it.coicop || '').includes(q),
      )
    })
  }, [tickets, query])

  if (!tickets.length) {
    return (
      <div className="card">
        <Empty icon="🗂️" title="Aucun ticket enregistré">
          Vos tickets analysés apparaîtront ici, avec la recherche et les exports
          Excel / CSV / JSON.
        </Empty>
      </div>
    )
  }

  return (
    <div>
      <div className="card">
        <h2>Exports</h2>
        <p className="hint">
          Exportez l'ensemble de vos {tickets.length} ticket(s) et de leurs
          lignes pour Excel, Power BI ou tout autre outil.
        </p>
        <div className="btn-row">
          <button className="btn primary" onClick={() => exportXLSX(tickets)}>
            📊 Excel (.xlsx)
          </button>
          <button className="btn" onClick={() => exportCSV(tickets)}>
            📄 CSV
          </button>
          <button className="btn" onClick={() => exportJSON(tickets)}>
            {'{ }'} JSON
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Historique</h2>
        <p className="hint">
          Recherchez instantanément par produit, catégorie, code COICOP ou
          magasin.
        </p>
        <input
          type="text"
          placeholder="Rechercher : Nutella, viande, Carrefour, 01.1.7…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: 12 }}
        />

        {filtered.length === 0 && (
          <p className="muted">Aucun ticket ne correspond à « {query} ».</p>
        )}

        {filtered.map((t) => {
          const net = (t.items || []).reduce((a, b) => a + (b.net || 0), 0)
          const open = openId === t.id
          return (
            <div key={t.id} style={{ borderBottom: '1px solid var(--slate-100)' }}>
              <div className="list-row">
                <button
                  className="btn"
                  style={{ padding: '4px 10px' }}
                  onClick={() => setOpenId(open ? null : t.id)}
                  aria-label="Détails"
                >
                  {open ? '▾' : '▸'}
                </button>
                <div className="lr-main">
                  <div className="lr-title">{t.store}</div>
                  <div className="lr-sub">
                    {formatDate(t.date)} · {(t.items || []).length} article(s)
                  </div>
                </div>
                <div className="lr-amount">{formatEUR(net)}</div>
                <button
                  className="btn danger"
                  style={{ padding: '4px 10px' }}
                  onClick={() => onDelete(t.id)}
                  title="Supprimer"
                >
                  🗑
                </button>
              </div>

              {open && (
                <div className="table-wrap" style={{ margin: '0 0 14px' }}>
                  <table className="data">
                    <thead>
                      <tr>
                        <th>Produit</th>
                        <th className="num">Qté</th>
                        <th className="num">Net</th>
                        <th>COICOP</th>
                        <th>Catégorie</th>
                        <th>Confiance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.items.map((it) => (
                        <tr key={it.id}>
                          <td>
                            {it.normalized || <span className="muted">— {it.raw}</span>}
                            <div className="raw">brut : {it.raw}</div>
                          </td>
                          <td className="num">{it.quantity}</td>
                          <td className="num">{formatEUR(it.net)}</td>
                          <td>
                            {it.coicop ? (
                              <span className="pill coicop">{it.coicop}</span>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td>{it.category}</td>
                          <td>
                            <ConfidenceBadge value={it.confidence} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
