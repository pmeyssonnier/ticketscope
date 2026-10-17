import React, { useEffect, useMemo, useRef, useState } from 'react'
import { formatEUR, formatDate, normalizeStr } from '../lib/format.js'
import { exportCSV, exportJSON, exportXLSX, download } from '../lib/exporters.js'
import { currentBackup, backupFilename, planImport, applyImport, describePlan, describeImport } from '../lib/backup.js'
import { loadLearned, exportLearnedData, mergeLearned, clearLearned } from '../lib/storage.js'
import { ticketEngine, engineLabel } from '../lib/compare.js'
import Compare from './Compare.jsx'
import { ConfidenceBadge, Empty } from './ui.jsx'

// Sauvegarde complète (tickets + dictionnaire appris) : export et import.
// `status` vit dans History : l'écran change de structure (vide -> liste) pendant l'import.
function BackupManager({ ticketCount, onReload, status, setStatus }) {
  const [busy, setBusy] = useState(false)
  const [plan, setPlan] = useState(null) // aperçu d'import en attente de confirmation
  const fileRef = useRef(null)

  async function doExport() {
    setBusy(true)
    try {
      const version = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : ''
      const backup = await currentBackup(version)
      download(backupFilename(), new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
      setStatus(`✓ Sauvegarde exportée : ${backup.tickets.length} ticket(s), ${backup.learned.length} entrée(s) du dictionnaire.`)
    } catch (e) {
      console.error(e)
      setStatus('❌ Export impossible.')
    } finally {
      setBusy(false)
    }
  }

  // Étape 1 : lecture et validation du fichier, sans rien écrire.
  async function onImport(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    setPlan(null)
    try {
      const data = JSON.parse(await file.text())
      const next = await planImport(data)
      if (next.invalid) setStatus(describePlan(next))
      else {
        setStatus('')
        setPlan(next)
      }
    } catch (err) {
      console.error(err)
      setStatus(err instanceof SyntaxError ? '❌ Fichier illisible (JSON invalide).' : '❌ Lecture du fichier impossible.')
    } finally {
      setBusy(false)
    }
  }

  // Étape 2 : écriture, seulement après confirmation.
  async function confirmImport() {
    if (!plan) return
    setBusy(true)
    try {
      const result = await applyImport(plan)
      setPlan(null)
      setStatus(describeImport(result))
      await onReload()
    } catch (err) {
      console.error(err)
      setStatus("❌ Import interrompu : l'espace de stockage est peut-être plein. Les tickets déjà écrits sont conservés.")
      setPlan(null)
      await onReload()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card">
      <h2>Sauvegarde complète</h2>
      <p className="hint">
        Un seul fichier avec vos {ticketCount} ticket(s) et votre dictionnaire appris, pour changer
        d'appareil ou vous protéger d'une perte de données. La clé API n'y figure jamais. À
        l'import, les tickets déjà présents ne sont pas écrasés ; les anciens exports JSON des
        tickets sont acceptés.
      </p>
      <div className="btn-row">
        <button className="btn primary" onClick={doExport} disabled={busy}>
          💾 Sauvegarder (.json)
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()} disabled={busy}>
          ⬆️ Restaurer (.json)
        </button>
      </div>
      <input ref={fileRef} type="file" accept="application/json,.json" onChange={onImport} style={{ display: 'none' }} />
      {plan && (
        <div className="inline-note" role="status">
          <b>Aperçu de l'import</b> — {describePlan(plan)}
          {plan.rejected.length > 0 && (
            <ul>
              {plan.rejected.slice(0, 6).map((r) => (
                <li key={r.label}>
                  ❌ Ticket {r.label} rejeté : {r.reasons.join(' ; ')}
                </li>
              ))}
              {plan.rejected.length > 6 && <li>… et {plan.rejected.length - 6} autre(s) ticket(s) rejeté(s).</li>}
            </ul>
          )}
          {plan.warnings.length > 0 && (
            <ul>
              {plan.warnings.slice(0, 4).map((w) => (
                <li key={w.label}>
                  ⚠️ Ticket {w.label} à relire : {w.notes.join(' ; ')}
                </li>
              ))}
              {plan.warnings.length > 4 && <li>… et {plan.warnings.length - 4} autre(s) ticket(s) à relire.</li>}
            </ul>
          )}
          {plan.rejected.length > 0 && <p>Les éléments rejetés ne seront pas importés.</p>}
          <div className="btn-row">
            <button className="btn primary" onClick={confirmImport} disabled={busy || (!plan.toAdd.length && !plan.learned.length)}>
              ✓ Confirmer l'import
            </button>
            <button className="btn" onClick={() => setPlan(null)} disabled={busy}>
              Annuler
            </button>
          </div>
        </div>
      )}
      {status && <p className="inline-note">{status}</p>}
    </div>
  )
}

// Sauvegarde / transfert du dictionnaire appris (corrections locales).
function LearnedManager() {
  const [count, setCount] = useState(0)
  const [status, setStatus] = useState('')
  const fileRef = useRef(null)

  useEffect(() => {
    setCount(loadLearned().length)
  }, [])

  function doExport() {
    const data = exportLearnedData()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ticketscope-dictionnaire.json'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function onImport(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result || ''))
        const r = mergeLearned(data)
        if (r.invalid) {
          setStatus('❌ Fichier non reconnu (ce n’est pas un export de dictionnaire TicketScope).')
          return
        }
        setCount(loadLearned().length)
        setStatus(
          `✓ Import terminé : ${r.added} ajout(s), ${r.updated} mise(s) à jour` +
            (r.skipped ? `, ${r.skipped} ignorée(s)` : '') +
            '. Effet sur les prochains tickets analysés.',
        )
      } catch {
        setStatus('❌ Fichier illisible (JSON invalide).')
      }
    }
    reader.readAsText(file)
  }

  function doClear() {
    if (!confirm('Vider votre dictionnaire appris (vos corrections locales) ?')) return
    clearLearned()
    setCount(0)
    setStatus('Dictionnaire appris vidé.')
  }

  return (
    <div className="card">
      <h2>Dictionnaire appris (local)</h2>
      <p className="hint">
        Vos corrections sont mémorisées sur cet appareil — {count} entrée
        {count > 1 ? 's' : ''}. Exportez-les pour les sauvegarder ou les
        transférer vers un autre appareil, puis « Importer » là-bas.
      </p>
      <div className="btn-row">
        <button className="btn" onClick={doExport} disabled={!count}>
          ⬇️ Exporter (.json)
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          ⬆️ Importer (.json)
        </button>
        {count > 0 && (
          <button className="btn danger" onClick={doClear}>
            Vider
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        onChange={onImport}
        style={{ display: 'none' }}
      />
      {status && <p className="inline-note">{status}</p>}
    </div>
  )
}

export default function History({ tickets, onDelete, onEdit, onUpdateTicket, onReload }) {
  const [query, setQuery] = useState('')
  const [backupStatus, setBackupStatus] = useState('')
  const [openId, setOpenId] = useState(null)
  const [selected, setSelected] = useState([]) // ids cochés pour comparaison (max 2)
  const [comparing, setComparing] = useState(false)

  function toggleSelect(id) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id)
      if (prev.length >= 2) return [prev[1], id] // garde les 2 plus récents cochés
      return [...prev, id]
    })
  }

  const pair = selected.map((id) => tickets.find((t) => t.id === id)).filter(Boolean)

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
      <div>
        <div className="card">
          <Empty icon="🗂️" title="Aucun ticket enregistré">
            Vos tickets analysés apparaîtront ici, avec la recherche et les exports
            Excel / CSV / JSON.
          </Empty>
        </div>
        <BackupManager ticketCount={0} onReload={onReload} status={backupStatus} setStatus={setBackupStatus} />
        <LearnedManager />
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

        <div className="cmp-bar">
          <span className="muted">
            {selected.length === 0
              ? 'Cochez deux tickets pour les comparer (ex. IA vs OCR).'
              : `${selected.length}/2 sélectionné${selected.length > 1 ? 's' : ''}`}
          </span>
          <div style={{ flex: 1 }} />
          {selected.length > 0 && (
            <button className="btn" onClick={() => setSelected([])}>
              Effacer
            </button>
          )}
          <button
            className="btn primary"
            disabled={pair.length !== 2}
            onClick={() => setComparing(true)}
          >
            ⚖️ Comparer
          </button>
        </div>

        {filtered.length === 0 && (
          <p className="muted">Aucun ticket ne correspond à « {query} ».</p>
        )}

        {filtered.map((t) => {
          const net = (t.items || []).reduce((a, b) => a + (b.net || 0), 0)
          const open = openId === t.id
          return (
            <div key={t.id} style={{ borderBottom: '1px solid var(--slate-100)' }}>
              <div className="list-row">
                <input
                  type="checkbox"
                  className="cmp-check"
                  checked={selected.includes(t.id)}
                  onChange={() => toggleSelect(t.id)}
                  title="Sélectionner pour comparer"
                  aria-label={`Comparer ${t.store}`}
                />
                <button
                  className="btn"
                  style={{ padding: '4px 10px' }}
                  onClick={() => setOpenId(open ? null : t.id)}
                  aria-label="Détails"
                >
                  {open ? '▾' : '▸'}
                </button>
                <div className="lr-main">
                  <div className="lr-title">
                    {t.store}{' '}
                    <span className={`pill engine ${ticketEngine(t)}`}>{engineLabel(ticketEngine(t))}</span>
                  </div>
                  <div className="lr-sub">
                    {formatDate(t.date)} · {(t.items || []).length} article(s)
                  </div>
                </div>
                <div className="lr-amount">{formatEUR(net)}</div>
                <button
                  className="btn"
                  style={{ padding: '4px 10px' }}
                  onClick={() => onEdit(t)}
                  title="Éditer ce ticket"
                >
                  ✏️
                </button>
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

      <BackupManager ticketCount={tickets.length} onReload={onReload} status={backupStatus} setStatus={setBackupStatus} />
      <LearnedManager />

      {comparing && pair.length === 2 && (
        <Compare
          a={pair[0]}
          b={pair[1]}
          onUpdateTicket={onUpdateTicket}
          onClose={() => setComparing(false)}
        />
      )}
    </div>
  )
}
