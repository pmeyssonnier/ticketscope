import React, { Suspense, lazy, useEffect, useState } from 'react'
import Importer from './components/Importer.jsx'
import ReviewTable from './components/ReviewTable.jsx'
import History from './components/History.jsx'
import Settings from './components/Settings.jsx'
import { loadTickets, saveTicket, deleteTicket } from './lib/ticketStore.js'
import {
  learnFromCorrection,
  loadAiSettings,
  saveAiSettings,
} from './lib/storage.js'
import { loadApiKey, saveApiKey } from './lib/secretStore.js'

// Le tableau de bord embarque recharts (~350 ko) : chargé à la demande.
const Dashboard = lazy(() => import('./components/Dashboard.jsx'))

const NAV = [
  { id: 'import', label: 'Importer', ico: '📷' },
  { id: 'dashboard', label: 'Tableau de bord', ico: '📊' },
  { id: 'history', label: 'Historique', ico: '🗂️' },
]

export default function App() {
  const [tickets, setTickets] = useState([])
  const [draft, setDraft] = useState(null)
  const [view, setView] = useState('import')
  // La clé API vit en mémoire ; elle est chiffrée au repos (secretStore.js).
  const [ai, setAi] = useState(() => ({ ...loadAiSettings(), apiKey: '' }))
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Vue de retour après enregistrement/annulation d'une correction :
  // tableau de bord après un import, historique après l'édition d'un ticket.
  const [draftReturn, setDraftReturn] = useState('dashboard')

  useEffect(() => {
    let alive = true
    loadTickets().then((list) => alive && setTickets(list)).catch(console.error)
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true
    loadApiKey()
      .then((key) => alive && key && setAi((a) => (a.apiKey ? a : { ...a, apiKey: key })))
      .catch(console.error)
    return () => {
      alive = false
    }
  }, [])

  // Exécute une écriture puis recharge la liste ; signale l'échec à l'utilisateur.
  async function persist(write) {
    try {
      await write()
      setTickets(await loadTickets())
      return true
    } catch (e) {
      console.error(e)
      alert("Enregistrement impossible : l'espace de stockage du navigateur est peut-être plein.")
      return false
    }
  }

  function updateAi(patch) {
    const { apiKey, ...rest } = patch
    if (Object.keys(rest).length) saveAiSettings(rest)
    if (apiKey !== undefined) saveApiKey(apiKey)
    setAi((a) => ({ ...a, ...patch }))
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

  async function handleSave(ticket, corrections) {
    for (const c of corrections) learnFromCorrection(c.raw, c.correction)
    // En cas d'échec on reste sur l'écran de correction pour ne rien perdre.
    if (!(await persist(() => saveTicket(ticket)))) return
    setDraft(null)
    setView(draftReturn)
  }

  async function handleDelete(id) {
    if (!confirm('Supprimer ce ticket ?')) return
    await persist(() => deleteTicket(id))
  }

  // Mise à jour d'un ticket existant (ex. corrections depuis la comparaison).
  async function handleUpdateTicket(ticket) {
    await persist(() => saveTicket(ticket))
  }

  const reviewing = view === 'review' && draft

  return (
    <div className="app">
      <header className="topbar">
        <img className="logo" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
        <div>
          <h1>TicketScope BE</h1>
          <p className="sub">Analyse de tickets · normalisation · COICOP</p>
        </div>
        <div className="spacer" />
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Réglages" title="Réglages">
          ⚙
        </button>
        <span className="tag">v{__APP_VERSION__}</span>
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
          <Suspense fallback={<p className="hint">Chargement du tableau de bord…</p>}>
            <Dashboard tickets={tickets} />
          </Suspense>
        ) : (
          <History
            tickets={tickets}
            onDelete={handleDelete}
            onEdit={handleEdit}
            onUpdateTicket={handleUpdateTicket}
            onReload={async () => setTickets(await loadTickets())}
          />
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
