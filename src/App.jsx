import React, { useEffect, useState } from 'react'
import Importer from './components/Importer.jsx'
import ReviewTable from './components/ReviewTable.jsx'
import Dashboard from './components/Dashboard.jsx'
import History from './components/History.jsx'
import Settings from './components/Settings.jsx'
import {
  loadTickets,
  saveTicket,
  deleteTicket,
  learnFromCorrection,
  loadAiSettings,
  saveAiSettings,
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
  const [ai, setAi] = useState(() => loadAiSettings())
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Vue de retour après enregistrement/annulation d'une correction :
  // tableau de bord après un import, historique après l'édition d'un ticket.
  const [draftReturn, setDraftReturn] = useState('dashboard')

  useEffect(() => {
    setTickets(loadTickets())
  }, [])

  function updateAi(patch) {
    setAi(saveAiSettings(patch))
  }

  function handleDraft(d) {
    setDraftReturn('dashboard')
    setDraft(d)
    setView('review')
  }

  // Rouvre un ticket enregistré dans l'écran de correction (édition).
  function handleEdit(ticket) {
    setDraftReturn('history')
    setDraft({ ...ticket, items: (ticket.items || []).map((it) => ({ ...it })) })
    setView('review')
  }

  function handleSave(ticket, corrections) {
    for (const c of corrections) learnFromCorrection(c.raw, c.correction)
    saveTicket(ticket)
    setTickets(loadTickets())
    setDraft(null)
    setView(draftReturn)
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
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Réglages" title="Réglages">
          ⚙
        </button>
        <span className="tag">v2.5</span>
      </header>

      {settingsOpen && (
        <Settings ai={ai} updateAi={updateAi} onClose={() => setSettingsOpen(false)} />
      )}

      <main>
        {reviewing ? (
          <ReviewTable
            draft={draft}
            onSave={handleSave}
            onCancel={() => {
              setDraft(null)
              setView(draftReturn)
            }}
          />
        ) : view === 'import' ? (
          <Importer onDraft={handleDraft} ai={ai} updateAi={updateAi} onOpenSettings={() => setSettingsOpen(true)} />
        ) : view === 'dashboard' ? (
          <Dashboard tickets={tickets} />
        ) : (
          <History tickets={tickets} onDelete={handleDelete} onEdit={handleEdit} />
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
