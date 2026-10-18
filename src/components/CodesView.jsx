import React, { useMemo, useState } from 'react'
import { formatEUR } from '../lib/format.js'
import { groupItemsByCoicop, codesInTicket } from '../lib/codeGroups.js'
import CoicopPicker from './CoicopPicker.jsx'

// Contrôle des codes : les lignes du ticket regroupées par code COICOP, pour repérer
// d'un coup d'œil une erreur et reclasser plusieurs lignes à la fois.
export default function CodesView({ items, onBulkCorrect }) {
  const [selected, setSelected] = useState(() => new Set())
  const groups = useMemo(() => groupItemsByCoicop(items), [items])
  const inTicket = useMemo(() => codesInTicket(items), [items])
  const ids = [...selected].filter((id) => items.some((it) => it.id === id))

  function toggle(id) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  function toggleGroup(group) {
    const all = group.items.every((it) => selected.has(it.id))
    setSelected((prev) => {
      const next = new Set(prev)
      group.items.forEach((it) => (all ? next.delete(it.id) : next.add(it.id)))
      return next
    })
  }
  function apply(code) {
    onBulkCorrect(ids, code)
    setSelected(new Set())
  }

  return (
    <div className="codes-view" data-testid="codes-view">
      <p className="hint">
        Les lignes sont regroupées par code. Cochez celles qui sont mal classées, puis choisissez le bon code.
      </p>
      {groups.map((g) => (
        <section className="code-group" key={g.code || 'none'} data-testid="code-group">
          <header className="code-group-head">
            <label>
              <input type="checkbox" checked={g.items.every((it) => selected.has(it.id))} onChange={() => toggleGroup(g)} aria-label={`Tout sélectionner : ${g.code || 'Non classé'}`} />
              <b>{g.code || '—'}</b> <span>{g.label}</span>
            </label>
            <span className="muted">
              {g.items.length} ligne{g.items.length > 1 ? 's' : ''} · {formatEUR(g.total)}
              {g.toReview > 0 && <span className="cg-warn"> · {g.toReview} à confirmer</span>}
            </span>
          </header>
          <ul>
            {g.items.map((it) => (
              <li key={it.id} className={it.needsReview ? 'review' : ''}>
                <label>
                  <input type="checkbox" checked={selected.has(it.id)} onChange={() => toggle(it.id)} aria-label={`Sélectionner ${it.normalized || it.raw}`} />
                  <span className="cg-name">{it.normalized || it.raw || 'ligne'}</span>
                </label>
                <span className="cg-net">{formatEUR(it.net)}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {ids.length > 0 && (
        <div className="bulk-bar" role="region" aria-label="Reclassement groupé">
          <strong>
            {ids.length} ligne{ids.length > 1 ? 's' : ''} sélectionnée{ids.length > 1 ? 's' : ''}
          </strong>
          <CoicopPicker value={null} onChange={apply} inTicket={inTicket} label="Classer la sélection en" buttonClass="bulk-pick" placeholder="Classer en…" />
          <button type="button" className="link-btn" onClick={() => setSelected(new Set())}>
            Désélectionner
          </button>
        </div>
      )}
    </div>
  )
}
