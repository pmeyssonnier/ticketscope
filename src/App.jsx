import React, { useEffect, useState } from 'react'
import Importer from './components/Importer.jsx'
import ReviewTable from './components/ReviewTable.jsx'
import Dashboard from './components/Dashboard.jsx'
import History from './components/History.jsx'
import {
  loadTickets,
  saveTicket,
  deleteTicket,
  learnFromCorrection,
} from './lib/storage.js'

const NAV = [
  { id: 'import', label: 'Importer', ico: '📷' },
  { id: 'dashboard', label: 'Tableau de bord', ico: '📊' },
  { id: 'history', label: 'Historique', ico: '🗂️' },
]

export default function App() {
  const [tickets, setTickets] = useState([])
  const [draft, setDraft] = useState(null)
  const [view, setView] = useState('import')

  useEffect(() => {
    setTickets(loadTickets())
  }, [])

  function handleDraft(d) {
    setDraft(d)
    setView('review')
  }

  function handleSave(ticket, corrections) {
    for (const c of corrections) learnFromCorrection(c.raw, c.correction)
    saveTicket(ticket)
    setTickets(loadTickets())
    setDraft(null)
    setView('dashboard')
  }

  function handleDelete(id) {
    if (!confirm('Supprimer ce ticket ?')) return
    deleteTicket(id)
    setTickets(loadTickets())
  }

  const reviewing = view === 'review' && draft

  return (
    <div className="app">
      <header className="topbar">
        <img className="logo" src="/favicon.svg" alt="" />
        <div>
          <h1>TicketScope BE</h1>
          <p className="sub">Analyse de tickets · normalisation · COICOP</p>
        </div>
        <div className="spacer" />
        <span className="tag">v1 · hors-ligne</span>
      </header>

      <main>
        {reviewing ? (
          <ReviewTable
            draft={draft}
            onSave={handleSave}
            onCancel={() => {
              setDraft(null)
              setView('import')
            }}
          />
        ) : view === 'import' ? (
          <Importer onDraft={handleDraft} />
        ) : view === 'dashboard' ? (
          <Dashboard tickets={tickets} />
        ) : (
          <History tickets={tickets} onDelete={handleDelete} />
        )}
      </main>

      <nav className="nav">
        {NAV.map((n) => (
          <button
            key={n.id}
            className={view === n.id && !reviewing ? 'active' : ''}
            onClick={() => {
              setDraft(null)
              setView(n.id)
            }}
          >
            <span className="ico">{n.ico}</span>
            {n.label}
            {n.id === 'history' && tickets.length > 0 && (
              <span className="badge">{tickets.length}</span>
            )}
          </button>
        ))}
      </nav>
    </div>
  )
}
