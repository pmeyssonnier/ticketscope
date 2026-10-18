import { createPortal } from 'react-dom'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { COICOP_LABELS } from '../data/coicop.js'
import { searchCoicop, groupByDivision } from '../lib/coicopSearch.js'

// Choix d'une classe COICOP : un bouton qui ouvre une fenêtre avec recherche
// (code, titre, mot-clé de produit), au lieu d'une longue liste déroulante.
// `suggested` : classes proposées pour la ligne ; `inTicket` : classes déjà utilisées dans le ticket.
export default function CoicopPicker({ value, onChange, suggested = [], inTicket = [], label = 'Code COICOP', buttonClass = '', placeholder = '— choisir —' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    inputRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const results = useMemo(() => (query.trim() ? searchCoicop(query) : null), [query])
  const groups = useMemo(() => groupByDivision(), [])

  function pick(code) {
    onChange(code)
    setOpen(false)
    setQuery('')
  }

  const option = (code) => (
    <button
      type="button"
      key={code}
      className={`picker-opt ${code === value ? 'selected' : ''}`}
      onClick={() => pick(code)}
    >
      <b>{code}</b> <span>{COICOP_LABELS[code]}</span>
    </button>
  )
  const quick = (title, codes) => {
    const list = codes.filter((c) => COICOP_LABELS[c])
    return list.length ? (
      <section className="picker-group">
        <h4>{title}</h4>
        {list.map(option)}
      </section>
    ) : null
  }

  return (
    <>
      <button type="button" className={`coicop-btn ${value ? '' : 'empty'} ${buttonClass}`} onClick={() => setOpen(true)} aria-label={`${label} : ${value || 'à choisir'}`}>
        {value ? (
          <>
            <b>{value}</b> <span>{COICOP_LABELS[value] || ''}</span>
          </>
        ) : (
          placeholder
        )}
      </button>
      {open && createPortal(
        <div className="picker-overlay" onClick={() => setOpen(false)}>
          <div className="picker-panel" role="dialog" aria-modal="true" aria-label="Choisir une classe COICOP" onClick={(e) => e.stopPropagation()}>
            <div className="picker-head">
              <input
                ref={inputRef}
                type="search"
                value={query}
                placeholder="Rechercher : lait, bonde, 04.3, chaussures…"
                aria-label="Rechercher une classe"
                onChange={(e) => setQuery(e.target.value)}
              />
              <button type="button" className="btn" onClick={() => setOpen(false)} aria-label="Fermer">
                ✕
              </button>
            </div>
            <div className="picker-list">
              {results ? (
                results.length ? (
                  results.map(option)
                ) : (
                  <p className="hint">Aucune classe ne correspond à « {query} ».</p>
                )
              ) : (
                <>
                  {value && (
                    <button type="button" className="picker-opt clear" onClick={() => pick(null)}>
                      Retirer le code
                    </button>
                  )}
                  {quick('💡 Suggérées', suggested)}
                  {quick('Dans ce ticket', inTicket)}
                  {groups.map((g) => (
                    <section className="picker-group" key={g.division}>
                      <h4>{g.title}</h4>
                      {g.codes.map(option)}
                    </section>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
