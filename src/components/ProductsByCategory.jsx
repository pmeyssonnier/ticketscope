import React, { useMemo, useState } from 'react'
import { formatEUR, formatDate } from '../lib/format.js'
import { productLines, groupProductLines, applyLineCorrection } from '../lib/productsByCategory.js'
import { learnFromCorrection } from '../lib/storage.js'
import { familyLabel } from '../data/familyLabels.js'
import CoicopPicker from './CoicopPicker.jsx'

// Tous les produits des tickets enregistrés, par catégorie : « Non classé » en premier, pour
// corriger ligne par ligne ou par lot. En parcours famille, catégories en mots simples.
export default function ProductsByCategory({ tickets, onUpdateTicket, friendly = false }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState(() => new Set(['']))
  const [selected, setSelected] = useState(() => new Set())
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)

  const all = useMemo(() => productLines(tickets), [tickets])
  const lines = useMemo(() => productLines(tickets, query), [tickets, query])
  const groups = useMemo(() => groupProductLines(lines), [lines])
  const unclassified = all.filter((l) => !l.coicop).length
  const keys = [...selected].filter((k) => all.some((l) => l.id === k))
  const searching = query.trim() !== ''
  const groupName = (g) => (g.code ? (friendly ? `${familyLabel(g.code)[0]} ${familyLabel(g.code)[1]}` : `${g.code} · ${g.label}`) : '❓ Non classé')

  function toggleGroup(code) {
    setExpanded((prev) => {
      const n = new Set(prev)
      n.has(code) ? n.delete(code) : n.add(code)
      return n
    })
  }
  function toggleLine(id) {
    setSelected((prev) => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  function toggleAll(g) {
    const every = g.items.every((l) => selected.has(l.id))
    setSelected((prev) => {
      const n = new Set(prev)
      g.items.forEach((l) => (every ? n.delete(l.id) : n.add(l.id)))
      return n
    })
  }

  async function apply(ids, code) {
    if (!code || !ids.length) return
    setBusy(true)
    const { tickets: changed, learn } = applyLineCorrection(tickets, ids, code)
    let done = 0
    for (const t of changed) {
      if (!(await onUpdateTicket(t))) break
      done += 1
    }
    if (done === changed.length) learn.forEach((l) => learnFromCorrection(l.raw, l.correction))
    setBusy(false)
    setSelected(new Set())
    setStatus(
      done === changed.length
        ? `✓ ${ids.length} ligne(s) classée(s). L'application s'en souvient pour vos prochains tickets.`
        : `Interrompu : ${done} ticket(s) sur ${changed.length} enregistré(s).`,
    )
  }

  if (!tickets.length) return null
  return (
    <div className="card" data-testid="products-by-category">
      <button type="button" className="pbc-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>📋 Produits par catégorie</span>
        <span className={unclassified ? 'cg-warn' : 'muted'}>{unclassified ? `${unclassified} non classé${unclassified > 1 ? 's' : ''}` : 'tout est classé'} {open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <>
          <p className="hint">Tous les produits de vos tickets, rangés par catégorie. Corrigez une ligne, ou cochez-en plusieurs pour les classer d'un coup.</p>
          <input type="text" placeholder="Chercher un produit ou un magasin…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Chercher un produit" />
          {status && <p className="hint" role="status">{status}</p>}
          {groups.length === 0 && <p className="hint">Aucun produit trouvé.</p>}
          {groups.map((g) => {
            const id = g.code || ''
            const isOpen = searching || expanded.has(id)
            return (
              <section className="code-group" key={id || 'none'} data-testid="pbc-group">
                <header className="code-group-head">
                  <button type="button" className="pbc-head" aria-expanded={isOpen} onClick={() => toggleGroup(id)}>
                    <b>{groupName(g)}</b>
                    <span className="muted">
                      {g.items.length} · {formatEUR(g.total)} {isOpen ? '▴' : '▾'}
                    </span>
                  </button>
                </header>
                {isOpen && (
                  <>
                    <label className="pbc-all">
                      <input type="checkbox" checked={g.items.every((l) => selected.has(l.id))} onChange={() => toggleAll(g)} aria-label={`Tout sélectionner : ${groupName(g)}`} />
                      Tout sélectionner
                    </label>
                    <ul className="pbc-list">
                      {g.items.map((l) => (
                        <li key={l.id} className={l.needsReview ? 'review' : ''}>
                          <label className="pbc-line">
                            <input type="checkbox" checked={selected.has(l.id)} onChange={() => toggleLine(l.id)} aria-label={`Sélectionner ${l.normalized || l.raw}`} />
                            <span className="pbc-name">
                              {l.normalized || l.raw || 'ligne'}
                              <small className="muted">
                                {l.store || 'Magasin ?'} · {formatDate(l.date)}
                              </small>
                            </span>
                            <span className="cg-net">{formatEUR(l.net)}</span>
                          </label>
                          <CoicopPicker
                            value={l.coicop}
                            onChange={(code) => apply([l.id], code)}
                            label={`Catégorie de ${l.normalized || l.raw}`}
                            buttonClass="coicop-btn"
                            placeholder="Choisir la catégorie…"
                            friendly={friendly}
                          />
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            )
          })}
          {keys.length > 0 && (
            <div className="bulk-bar" role="region" aria-label="Reclassement groupé">
              <strong>
                {keys.length} ligne{keys.length > 1 ? 's' : ''} sélectionnée{keys.length > 1 ? 's' : ''}
              </strong>
              <CoicopPicker value={null} onChange={(code) => apply(keys, code)} label="Classer la sélection en" buttonClass="bulk-pick" placeholder={busy ? 'Enregistrement…' : 'Classer en…'} friendly={friendly} />
              <button type="button" className="link-btn" onClick={() => setSelected(new Set())}>
                Désélectionner
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
